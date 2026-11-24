import { MAX_SIGNAL_LENGTH, MAX_SIGNALS_PER_DAY, SIGNAL_AUTO_CLOSE_MS, SIGNAL_WINDOW_MS, type SignalSource } from "contract";
import { isoAgo, newId, now, type HouseholdRow, type PersonRow, type SignalRow } from "../db";
import { limits, take } from "../limits";
import type { Delivery } from "../sms/send";
import { allClear, relay } from "../sms/texts";

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

  return { ok: true, action: "opened", signal, deliveries: await broadcast(env, owner, signal, "signal", relay(senderName(owner), text)) };
}

export async function solveSignal(env: Env, owner: Owner): Promise<SolveResult> {
  const signal = await env.DB.prepare(
    "UPDATE signals SET status = 'solved', solved_at = ? WHERE household_id = ? AND status = 'open' RETURNING *",
  )
    .bind(now(), owner.household.id)
    .first<SignalRow>();
  if (!signal) return { ok: false, error: "no_open_signal" };
  return { ok: true, signal, deliveries: await broadcast(env, owner, signal, "all_clear", allClear(senderName(owner))) };
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
  return { ok: true, action: "updated", signal, deliveries: await broadcast(env, owner, signal, "update", relay(senderName(owner), text)) };
}

async function broadcast(env: Env, owner: Owner, signal: SignalRow, kind: Delivery["kind"], body: string): Promise<Delivery[]> {
  const { results } = await env.DB.prepare(
    `SELECT p.* FROM people p
     JOIN memberships m ON m.person_id = p.id
     WHERE m.household_id = ? AND m.role = 'helper' AND p.opted_out_at IS NULL
     ORDER BY m.created_at, p.phone`,
  )
    .bind(owner.household.id)
    .all<PersonRow>();
  return results.map((helper) => ({ to: helper.phone, body, kind, householdId: owner.household.id, signalId: signal.id, personId: helper.id }));
}

function isUniqueViolation(cause: unknown): boolean {
  return cause instanceof Error && /UNIQUE/.test(cause.message);
}
