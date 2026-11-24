import { normalisePhone } from "contract";
import { newId, now, type HouseholdRow, type PersonRow, type SignalRow } from "../db";
import { limits, take } from "../limits";
import type { InboundSms } from "../sms/provider";
import type { Delivery } from "../sms/send";
import { nothingOpen, relay, signalTooLong, signupLink, tooManySignals, tooManyTexts } from "../sms/texts";
import { isSolveKeyword, isStopKeyword } from "./keywords";
import { raiseSignal, solveSignal, type Owner, type RaiseError } from "./signals";

export type SenderContext = {
  person: PersonRow | null;
  owned: Owner | null;
  ownedOpenSignal: SignalRow | null;
  helpedOpenSignal: SignalRow | null;
  helperName: string | null;
  helpedHouseholdId: string | null;
  signupLinkSent: boolean;
};

export type Route =
  | { kind: "stop" }
  | { kind: "open" }
  | { kind: "update" }
  | { kind: "solve" }
  | { kind: "relay"; signal: SignalRow }
  | { kind: "nothing_open" }
  | { kind: "signup_link" }
  | { kind: "ignore"; reason: "signup_link_already_sent" | "empty" | "nothing_to_solve" };

export type InboundOutcome =
  | { action: "duplicate" }
  | { action: "opted_out" }
  | { action: "opened" | "updated" | "solved"; signalId: string }
  | { action: "relayed"; signalId: string; householdId: string }
  | { action: "refused"; reason: Exclude<RaiseError, "invalid_request"> }
  | { action: "nothing_open" }
  | { action: "signup_link" }
  | {
      action: "ignored";
      reason: Extract<Route, { kind: "ignore" }>["reason"] | RaiseError | "no_open_signal" | "reply_cooldown" | "signal_number";
    };

const REFUSAL_TEXTS: Record<Exclude<RaiseError, "invalid_request">, () => string> = {
  signal_too_long: signalTooLong,
  too_many_signals: tooManySignals,
  rate_limited: tooManyTexts,
};

export type InboundResult = { outcome: InboundOutcome; deliveries: Delivery[] };

export function decideRoute(context: SenderContext, body: string): Route {
  const known = context.owned !== null || context.helpedHouseholdId !== null;

  if (isStopKeyword(body)) return { kind: "stop" };
  if (!known) return context.signupLinkSent ? { kind: "ignore", reason: "signup_link_already_sent" } : { kind: "signup_link" };
  if (!body.trim()) return { kind: "ignore", reason: "empty" };

  if (context.ownedOpenSignal) return isSolveKeyword(body) ? { kind: "solve" } : { kind: "update" };
  if (context.owned) return isSolveKeyword(body) ? { kind: "ignore", reason: "nothing_to_solve" } : { kind: "open" };
  if (context.helpedOpenSignal) return { kind: "relay", signal: context.helpedOpenSignal };
  return { kind: "nothing_open" };
}

export async function routeInbound(env: Env, sms: InboundSms): Promise<InboundResult> {
  if (env.SIGNAL_NUMBER && sms.from === normalisePhone(env.SIGNAL_NUMBER)) {
    return { outcome: { action: "ignored", reason: "signal_number" }, deliveries: [] };
  }

  const context = await loadContext(env, sms.from);
  const route = decideRoute(context, sms.body);
  const { person, owned } = context;
  const known = owned !== null || context.helpedHouseholdId !== null;

  const householdId = route.kind === "relay" ? route.signal.household_id : (owned?.household.id ?? context.helpedHouseholdId);
  const signalId = route.kind === "relay" ? route.signal.id : (context.ownedOpenSignal?.id ?? null);

  const messageId = newId();
  const recorded = await env.DB.prepare(
    `INSERT OR IGNORE INTO messages (id, household_id, signal_id, person_id, phone, direction, kind, body, provider_id, status)
     VALUES (?, ?, ?, ?, ?, 'in', 'inbound', ?, ?, 'received')`,
  )
    .bind(messageId, householdId, signalId, person?.id ?? null, sms.from, known ? sms.body : "", sms.providerId)
    .run();
  if (recorded.meta.changes === 0) return { outcome: { action: "duplicate" }, deliveries: [] };

  let result: InboundResult;
  try {
    result = await act(env, context, route, sms);
  } catch (cause) {
    await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
    throw cause;
  }

  const outcomeSignalId = "signalId" in result.outcome ? result.outcome.signalId : null;
  if (outcomeSignalId && outcomeSignalId !== signalId) {
    await env.DB.prepare("UPDATE messages SET signal_id = ? WHERE id = ?").bind(outcomeSignalId, messageId).run();
  }
  if (person?.opted_out_at) result.deliveries = result.deliveries.filter((delivery) => delivery.to !== sms.from);
  return result;
}

async function act(env: Env, context: SenderContext, route: Route, sms: InboundSms): Promise<InboundResult> {
  const { person, owned } = context;
  const nothing = (outcome: InboundOutcome): InboundResult => ({ outcome, deliveries: [] });

  switch (route.kind) {
    case "stop":
      await env.DB.prepare(
        `INSERT INTO people (id, phone, opted_out_at) VALUES (?, ?, ?)
         ON CONFLICT (phone) DO UPDATE SET opted_out_at = COALESCE(people.opted_out_at, excluded.opted_out_at)`,
      )
        .bind(newId(), sms.from, now())
        .run();
      return nothing({ action: "opted_out" });

    case "open":
    case "update": {
      const result = await raiseSignal(env, owned!, sms.body, "sms");
      if (!result.ok && result.error !== "invalid_request") {
        if (!(await take(env.DB, limits.reply("refused", sms.from)))) return nothing({ action: "ignored", reason: "reply_cooldown" });
        return {
          outcome: { action: "refused", reason: result.error },
          deliveries: [
            { to: sms.from, body: REFUSAL_TEXTS[result.error](), kind: "refused", householdId: owned!.household.id, personId: person!.id },
          ],
        };
      }
      if (!result.ok) return nothing({ action: "ignored", reason: result.error });
      return { outcome: { action: result.action, signalId: result.signal.id }, deliveries: result.deliveries };
    }

    case "solve": {
      const result = await solveSignal(env, owned!);
      if (!result.ok) return nothing({ action: "ignored", reason: result.error });
      return { outcome: { action: "solved", signalId: result.signal.id }, deliveries: result.deliveries };
    }

    case "relay": {
      const parent = await env.DB.prepare(
        `SELECT p.* FROM people p
         JOIN memberships m ON m.person_id = p.id
         WHERE m.household_id = ? AND m.role = 'owner' AND p.opted_out_at IS NULL`,
      )
        .bind(route.signal.household_id)
        .first<PersonRow>();
      const outcome: InboundOutcome = { action: "relayed", signalId: route.signal.id, householdId: route.signal.household_id };
      if (!parent) return nothing(outcome);
      return {
        outcome,
        deliveries: [
          {
            to: parent.phone,
            body: relay(context.helperName ?? person!.phone, sms.body.trim()),
            kind: "relay",
            householdId: route.signal.household_id,
            signalId: route.signal.id,
            personId: parent.id,
          },
        ],
      };
    }

    case "nothing_open":
      if (!(await take(env.DB, limits.reply("nothing_open", sms.from)))) return nothing({ action: "ignored", reason: "reply_cooldown" });
      return {
        outcome: { action: "nothing_open" },
        deliveries: [{ to: sms.from, body: nothingOpen(), kind: "nothing_open", householdId: context.helpedHouseholdId, personId: person!.id }],
      };

    case "signup_link":
      return {
        outcome: { action: "signup_link" },
        deliveries: [{ to: sms.from, body: signupLink(), kind: "signup_link", householdId: null, personId: person?.id ?? null }],
      };

    case "ignore":
      return nothing({ action: "ignored", reason: route.reason });
  }
}

async function loadContext(env: Env, phone: string): Promise<SenderContext> {
  const signupLink = env.DB.prepare("SELECT 1 FROM messages WHERE phone = ? AND kind = 'signup_link' LIMIT 1").bind(phone);
  const person = await env.DB.prepare("SELECT * FROM people WHERE phone = ?").bind(phone).first<PersonRow>();

  if (!person) {
    const sent = await signupLink.first();
    return {
      person: null,
      owned: null,
      ownedOpenSignal: null,
      helpedOpenSignal: null,
      helperName: null,
      helpedHouseholdId: null,
      signupLinkSent: sent !== null,
    };
  }

  const [owned, ownedOpen, helpedOpen, helped, sent] = await env.DB.batch([
    env.DB.prepare(
      `SELECT h.* FROM households h
       JOIN memberships m ON m.household_id = h.id
       WHERE m.person_id = ? AND m.role = 'owner'`,
    ).bind(person.id),
    env.DB.prepare(
      `SELECT s.* FROM signals s
       JOIN memberships m ON m.household_id = s.household_id
       WHERE m.person_id = ? AND m.role = 'owner' AND s.status = 'open'`,
    ).bind(person.id),
    env.DB.prepare(
      `SELECT s.*, m.name AS helper_name FROM signals s
       JOIN memberships m ON m.household_id = s.household_id
       WHERE m.person_id = ? AND m.role = 'helper' AND s.status = 'open'
       ORDER BY s.opened_at DESC
       LIMIT 1`,
    ).bind(person.id),
    env.DB.prepare(
      `SELECT household_id FROM memberships
       WHERE person_id = ? AND role = 'helper'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).bind(person.id),
    signupLink,
  ]);

  const household = owned?.results[0] as HouseholdRow | undefined;
  const { helper_name: helperName = null, ...helpedOpenSignal } = (helpedOpen?.results[0] ?? {}) as Partial<SignalRow & { helper_name: string | null }>;
  return {
    person,
    owned: household ? { person, household } : null,
    ownedOpenSignal: (ownedOpen?.results[0] as SignalRow | undefined) ?? null,
    helpedOpenSignal: helpedOpenSignal.id ? (helpedOpenSignal as SignalRow) : null,
    helperName,
    helpedHouseholdId: (helped?.results[0] as { household_id: string } | undefined)?.household_id ?? null,
    signupLinkSent: (sent?.results.length ?? 0) > 0,
  };
}
