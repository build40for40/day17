import { normalisePhone, type RecipientState } from "contract";
import { isoAgo, newId, now, type HouseholdRow, type PersonRow, type SignalRow } from "../db";
import { limits, take } from "../limits";
import type { InboundSms } from "../sms/provider";
import type { Delivery } from "../sms/send";
import { codePrompt, nothingOpen, pickGroup, relay, signalTooLong, signOffHelp, signupLink, tooManySignals, tooManyTexts } from "../sms/texts";
import { isSolveKeyword, isStopKeyword } from "./keywords";
import { applyReply, signOff } from "./recipients";
import { parseReply, parseSignOff, type Answer } from "./replies";
import { raiseSignal, senderName, solveSignal, type Owner, type RaiseError } from "./signals";

const PROMPT_WINDOW_MS = 10 * 60_000;

export type Alert = { signal: SignalRow; code: number; state: RecipientState; parentName: string };

export type SenderContext = {
  person: PersonRow | null;
  owned: Owner | null;
  ownedOpenSignal: SignalRow | null;
  helpedOpenSignal: SignalRow | null;
  helperName: string | null;
  helpedHouseholdId: string | null;
  signupLinkSent: boolean;
  alerts: Alert[];
  promptedRecently: boolean;
  ownsSeveral: boolean;
};

export type Route =
  | { kind: "stop" }
  | { kind: "open" }
  | { kind: "update" }
  | { kind: "solve" }
  | { kind: "relay"; signal: SignalRow }
  | { kind: "reply"; alert: Alert; answer: Answer; note: string }
  | { kind: "sign_off"; slot: number | null }
  | { kind: "code_prompt" }
  | { kind: "pick_group" }
  | { kind: "nothing_open" }
  | { kind: "signup_link" }
  | { kind: "ignore"; reason: "signup_link_already_sent" | "empty" | "nothing_to_solve" };

export type InboundOutcome =
  | { action: "duplicate" }
  | { action: "opted_out" }
  | { action: "opened" | "updated" | "solved"; signalId: string }
  | { action: "relayed"; signalId: string; householdId: string }
  | { action: "replied"; signalId: string; state: RecipientState }
  | { action: "signed_off"; signalId: string }
  | { action: "sign_off_refused" }
  | { action: "code_prompt" }
  | { action: "pick_group" }
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
  const known = context.owned !== null || context.ownsSeveral || context.helpedHouseholdId !== null;

  if (isStopKeyword(body)) return { kind: "stop" };
  if (!known) return context.signupLinkSent ? { kind: "ignore", reason: "signup_link_already_sent" } : { kind: "signup_link" };
  if (!body.trim()) return { kind: "ignore", reason: "empty" };

  const reply = parseReply(body);
  if (reply) {
    const alert = reply.code === null ? context.alerts[0] : context.alerts.find((candidate) => candidate.code === reply.code);
    if (reply.code === null && context.alerts.length > 1) return { kind: "code_prompt" };
    return alert ? { kind: "reply", alert, answer: reply.answer, note: reply.note } : { kind: "nothing_open" };
  }

  if (context.ownedOpenSignal) {
    if (isSolveKeyword(body)) return { kind: "solve" };
    const signedOff = parseSignOff(body);
    if (signedOff) return { kind: "sign_off", slot: signedOff.slot };
  }

  if (!context.owned && context.ownsSeveral) return { kind: "pick_group" };

  const unanswered = context.alerts.some((alert) => alert.state === "not_read" || alert.state === "pending");
  if (context.owned && unanswered && !context.promptedRecently) return { kind: "code_prompt" };

  if (context.ownedOpenSignal) return { kind: "update" };
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
  const known = owned !== null || context.ownsSeveral || context.helpedHouseholdId !== null;

  const about = route.kind === "relay" ? route.signal : route.kind === "reply" ? route.alert.signal : null;
  const householdId = about?.household_id ?? owned?.household.id ?? context.helpedHouseholdId;
  const signalId = about?.id ?? context.ownedOpenSignal?.id ?? null;

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

    case "reply": {
      const { signal, parentName } = route.alert;
      const parent = await findParent(env, signal.household_id);
      const { state, deliveries } = await applyReply(env, signal, parent, parentName, person!.id, route.answer, route.note);
      return { outcome: { action: "replied", signalId: signal.id, state }, deliveries };
    }

    case "sign_off": {
      const signal = context.ownedOpenSignal!;
      const result = await signOff(env, signal, senderName(owned!), route.slot === null ? null : { slot: route.slot });
      if (result.ok) return { outcome: { action: "signed_off", signalId: signal.id }, deliveries: result.deliveries };
      return {
        outcome: { action: "sign_off_refused" },
        deliveries: [
          {
            to: sms.from,
            body: signOffHelp(result.offers),
            kind: "sign_off_help",
            householdId: signal.household_id,
            signalId: signal.id,
            personId: person!.id,
          },
        ],
      };
    }

    case "code_prompt":
      return {
        outcome: { action: "code_prompt" },
        deliveries: [
          {
            to: sms.from,
            body: codePrompt(
              context.alerts.map((alert) => ({ name: alert.parentName, code: alert.code })),
              owned !== null,
            ),
            kind: "code_prompt",
            householdId: null,
            personId: person!.id,
          },
        ],
      };

    case "pick_group":
      if (!(await take(env.DB, limits.reply("pick_group", sms.from)))) return nothing({ action: "ignored", reason: "reply_cooldown" });
      return {
        outcome: { action: "pick_group" },
        deliveries: [{ to: sms.from, body: pickGroup(), kind: "pick_group", householdId: null, personId: person!.id }],
      };

    case "relay": {
      const parent = await findParent(env, route.signal.household_id);
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

function findParent(env: Env, householdId: string): Promise<PersonRow | null> {
  return env.DB.prepare(
    `SELECT p.* FROM people p
     JOIN memberships m ON m.person_id = p.id
     WHERE m.household_id = ? AND m.role = 'owner' AND p.opted_out_at IS NULL`,
  )
    .bind(householdId)
    .first<PersonRow>();
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
      alerts: [],
      promptedRecently: false,
      ownsSeveral: false,
    };
  }

  const [owned, ownedOpen, helpedOpen, helped, sent, alerts, lastOutbound] = await env.DB.batch([
    env.DB.prepare(
      `SELECT h.* FROM households h
       JOIN memberships m ON m.household_id = h.id
       WHERE m.person_id = ? AND m.role = 'owner'
       ORDER BY h.created_at, h.id`,
    ).bind(person.id),
    env.DB.prepare(
      `SELECT s.* FROM signals s
       JOIN memberships m ON m.household_id = s.household_id
       WHERE m.person_id = ? AND m.role = 'owner' AND s.status = 'open'
       ORDER BY s.opened_at DESC`,
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
    env.DB.prepare(
      `SELECT s.*, sr.code, sr.state, COALESCE(po.name, h.name) AS parent_name
       FROM signal_recipients sr
       JOIN signals s ON s.id = sr.signal_id AND s.status = 'open'
       JOIN households h ON h.id = s.household_id
       LEFT JOIN memberships mo ON mo.household_id = h.id AND mo.role = 'owner'
       LEFT JOIN people po ON po.id = mo.person_id
       WHERE sr.person_id = ?
       ORDER BY s.opened_at DESC`,
    ).bind(person.id),
    env.DB.prepare("SELECT kind, created_at FROM messages WHERE phone = ? AND direction = 'out' ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(
      person.phone,
    ),
  ]);
  const last = lastOutbound?.results[0] as { kind: string; created_at: string } | undefined;

  const households = (owned?.results ?? []) as HouseholdRow[];
  const openSignals = (ownedOpen?.results ?? []) as SignalRow[];
  const ownedOpenSignal = households.length === 1 || openSignals.length === 1 ? (openSignals[0] ?? null) : null;
  const household = households.length === 1 ? households[0] : households.find((candidate) => candidate.id === ownedOpenSignal?.household_id);
  const { helper_name: helperName = null, ...helpedOpenSignal } = (helpedOpen?.results[0] ?? {}) as Partial<SignalRow & { helper_name: string | null }>;
  return {
    person,
    owned: household ? { person, household } : null,
    ownedOpenSignal,
    helpedOpenSignal: helpedOpenSignal.id ? (helpedOpenSignal as SignalRow) : null,
    helperName,
    helpedHouseholdId: (helped?.results[0] as { household_id: string } | undefined)?.household_id ?? null,
    signupLinkSent: (sent?.results.length ?? 0) > 0,
    alerts: ((alerts?.results ?? []) as (SignalRow & { code: number; state: RecipientState; parent_name: string })[]).map(
      ({ code, state, parent_name: parentName, ...signal }) => ({ signal, code, state, parentName }),
    ),
    promptedRecently: last?.kind === "code_prompt" && last.created_at > isoAgo(PROMPT_WINDOW_MS),
    ownsSeveral: households.length > 1,
  };
}
