import { MAX_SIGNAL_LENGTH, MAX_SIGNALS_PER_DAY, SIGNAL_AUTO_CLOSE_MS, SIGNAL_WINDOW_MS, type SignalSource } from "contract";
import { isoAgo, newId, now, type HouseholdRow, type PersonRow, type SignalRow } from "../db";
import { limits, take } from "../limits";
import type { Delivery } from "../sms/send";
import { allClear, signalWithCodes, updateWithCodes } from "../sms/texts";
import { createRecipients, listRecipients } from "./recipients";

export type Owner = { person: PersonRow; household: HouseholdRow };

export type RaiseError = "invalid_request" | "signal_too_long" | "too_many_signals" | "rate_limited";
export type RaiseResult =
  | { ok: true; action: "opened" | "updated"; signal: SignalRow; deliveries: Delivery[] }
  | { ok: false; error: RaiseError };

export type SolveResult = { ok: true; signal: SignalRow; deliveries: Delivery[] } | { ok: false; error: "no_open_signal" };

export async function findOwner(env: Env, personId: string): Promise<{ person: PersonRow | null; household: HouseholdRow | null }> {
  const [person, household] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM people WHERE id = ?").bind(personId),
    env.DB.prepare(
      `SELECT h.* FROM households h
       JOIN memberships m ON m.household_id = h.id
       WHERE m.person_id = ? AND m.role = 'owner'`,
    ).bind(personId),
  ]);
  return {
    person: (person?.results[0] as PersonRow | undefined) ?? null,
    household: (household?.results[0] as HouseholdRow | undefined) ?? null,
  };
}

export async function findOpenSignal(env: Env, householdId: string): Promise<SignalRow | null> {
  return env.DB.prepare("SELECT * FROM signals WHERE household_id = ? AND status = 'open'").bind(householdId).first<SignalRow>();
}

export async function raiseSignal(env: Env, owner: Owner, rawText: string, source: SignalSource): Promise<RaiseResult> {
  const text = rawText.trim();
  if (!text) return { ok: false, error: "invalid_request" };
  if (text.length > MAX_SIGNAL_LENGTH) return { ok: false, error: "signal_too_long" };

  const open = await findOpenSignal(env, owner.household.id);
  if (!open) {
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM signals WHERE household_id = ? AND opened_at > ?")
      .bind(owner.household.id, isoAgo(SIGNAL_WINDOW_MS))
      .first<{ count: number }>();
    if ((recent?.count ?? 0) >= MAX_SIGNALS_PER_DAY) return { ok: false, error: "too_many_signals" };
  }

  if (!(await take(env.DB, limits.broadcast(owner.person.phone)))) return { ok: false, error: "rate_limited" };
  if (open) return update(env, owner, open, text);

  let signal: SignalRow | null;
  try {
    signal = await env.DB.prepare("INSERT INTO signals (id, household_id, text, source, opened_at) VALUES (?, ?, ?, ?, ?) RETURNING *")
      .bind(newId(), owner.household.id, text, source, now())
      .first<SignalRow>();
  } catch (cause) {
    if (!isUniqueViolation(cause)) throw cause;
    const raced = await findOpenSignal(env, owner.household.id);
    if (!raced) throw cause;
    return update(env, owner, raced, text);
  }
  if (!signal) throw new Error("Inserting a signal returned no row");

  await createRecipients(env, signal, await activeHelpers(env, owner.household.id));
  return {
    ok: true,
    action: "opened",
    signal,
    deliveries: await broadcast(env, signal, "signal", (code) => signalWithCodes(senderName(owner), text, code)),
  };
}

export async function solveSignal(env: Env, owner: Owner): Promise<SolveResult> {
  const signal = await env.DB.prepare(
    "UPDATE signals SET status = 'solved', solved_at = ? WHERE household_id = ? AND status = 'open' RETURNING *",
  )
    .bind(now(), owner.household.id)
    .first<SignalRow>();
  if (!signal) return { ok: false, error: "no_open_signal" };
  return { ok: true, signal, deliveries: await broadcast(env, signal, "all_clear", () => allClear(senderName(owner))) };
}

export async function closeStaleSignals(env: Env): Promise<number> {
  const { meta } = await env.DB.prepare("UPDATE signals SET status = 'solved', solved_at = ? WHERE status = 'open' AND opened_at <= ?")
    .bind(now(), isoAgo(SIGNAL_AUTO_CLOSE_MS))
    .run();
  return meta.changes;
}

export function senderName(owner: Owner): string {
  return owner.person.name ?? owner.household.name;
}

async function update(env: Env, owner: Owner, signal: SignalRow, text: string): Promise<RaiseResult> {
  return {
    ok: true,
    action: "updated",
    signal,
    deliveries: await broadcast(env, signal, "update", (code) => updateWithCodes(senderName(owner), text, code)),
  };
}

async function activeHelpers(env: Env, householdId: string): Promise<PersonRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT p.* FROM people p
     JOIN memberships m ON m.person_id = p.id
     WHERE m.household_id = ? AND m.role = 'helper' AND p.opted_out_at IS NULL
     ORDER BY m.created_at, p.phone`,
  )
    .bind(householdId)
    .all<PersonRow>();
  return results;
}

async function broadcast(env: Env, signal: SignalRow, kind: Delivery["kind"], body: (code: number) => string): Promise<Delivery[]> {
  let recipients = await listRecipients(env, signal.id);
  if (recipients.length === 0) {
    await createRecipients(env, signal, await activeHelpers(env, signal.household_id));
    recipients = await listRecipients(env, signal.id);
  }
  return recipients
    .filter((recipient) => !recipient.opted_out_at)
    .map((recipient) => ({
      to: recipient.phone,
      body: body(recipient.code),
      kind,
      householdId: signal.household_id,
      signalId: signal.id,
      personId: recipient.person_id,
    }));
}

function isUniqueViolation(cause: unknown): boolean {
  return cause instanceof Error && /UNIQUE/.test(cause.message);
}
