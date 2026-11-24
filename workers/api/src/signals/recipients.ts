import type { RecipientState, SignalRecipient } from "contract";
import { now, type PersonRow, type RecipientRow, type SignalRow } from "../db";
import type { Delivery } from "../sms/send";
import {
  acceptReceived,
  checkingReceived,
  droppedOut,
  helperAccepted,
  helperChecking,
  helperRejected,
  rejectReceived,
  standby,
  standDown,
  stillNeeded,
  youAreOn,
  type Offer,
} from "../sms/texts";
import type { Answer } from "./replies";

export type Recipient = RecipientRow & { phone: string; name: string; opted_out_at: string | null };

export type SignOffTarget = { slot: number } | { personId: string } | null;
export type SignOffResult =
  | { ok: true; signal: SignalRow; deliveries: Delivery[] }
  | { ok: false; error: "not_accepted"; offers: Offer[] };

export async function listRecipients(env: Env, signalId: string): Promise<Recipient[]> {
  const { results } = await env.DB.prepare(
    `SELECT sr.*, p.phone, p.opted_out_at, COALESCE(m.name, p.phone) AS name
     FROM signal_recipients sr
     JOIN people p ON p.id = sr.person_id
     JOIN signals s ON s.id = sr.signal_id
     LEFT JOIN memberships m ON m.household_id = s.household_id AND m.person_id = sr.person_id
     WHERE sr.signal_id = ?
     ORDER BY sr.slot`,
  )
    .bind(signalId)
    .all<Recipient>();
  return results;
}

export async function createRecipients(env: Env, signal: SignalRow, helpers: PersonRow[]): Promise<void> {
  if (helpers.length === 0) return;
  const { results: taken } = await env.DB.prepare(
    `SELECT sr.person_id, sr.code FROM signal_recipients sr
     JOIN signals s ON s.id = sr.signal_id
     WHERE s.status = 'open' AND sr.person_id IN (${helpers.map(() => "?").join(", ")})`,
  )
    .bind(...helpers.map((helper) => helper.id))
    .all<{ person_id: string; code: number }>();

  const insert = env.DB.prepare("INSERT OR IGNORE INTO signal_recipients (signal_id, person_id, code, slot) VALUES (?, ?, ?, ?)");
  await env.DB.batch(
    helpers.map((helper, index) => {
      const used = new Set(taken.filter((row) => row.person_id === helper.id).map((row) => row.code));
      let code = 1;
      while (used.has(code)) code++;
      return insert.bind(signal.id, helper.id, code, index + 1);
    }),
  );
}

export function toSignalRecipient(recipient: Recipient, signal: SignalRow): SignalRecipient {
  return {
    personId: recipient.person_id,
    name: recipient.name,
    state: recipient.state,
    signedOff: signal.signed_off_person_id === recipient.person_id,
  };
}

export const offersOf = (recipients: Recipient[], signal: SignalRow): Offer[] =>
  recipients
    .filter((recipient) => recipient.state === "accepted" && recipient.person_id !== signal.signed_off_person_id)
    .map(({ name, slot }) => ({ name, slot }));

export async function applyReply(
  env: Env,
  signal: SignalRow,
  parent: PersonRow | null,
  parentName: string,
  personId: string,
  answer: Answer,
  note: string,
): Promise<{ state: RecipientState; deliveries: Delivery[] }> {
  const recipients = await listRecipients(env, signal.id);
  const recipient = recipients.find((candidate) => candidate.person_id === personId);
  if (!recipient) return { state: "not_read", deliveries: [] };
  if (recipient.state === answer && !note) return { state: answer, deliveries: [] };

  const wasSignedOff = signal.signed_off_person_id === personId;
  const dropsOut = wasSignedOff && answer !== "accepted";
  await env.DB.batch([
    env.DB.prepare("UPDATE signal_recipients SET state = ?, updated_at = ? WHERE signal_id = ? AND person_id = ?").bind(
      answer,
      now(),
      signal.id,
      personId,
    ),
    ...(dropsOut ? [env.DB.prepare("UPDATE signals SET signed_off_person_id = NULL WHERE id = ?").bind(signal.id)] : []),
  ]);

  const others = recipients.filter((candidate) => candidate.person_id !== personId);
  const base = { householdId: signal.household_id, signalId: signal.id };
  const deliveries: Delivery[] = [];
  const toHelper = (to: Recipient, body: string, kind: Delivery["kind"]) => {
    if (!to.opted_out_at) deliveries.push({ ...base, to: to.phone, body, kind, personId: to.person_id });
  };
  const toParent = (body: string, kind: Delivery["kind"]) => {
    if (parent && !parent.opted_out_at) deliveries.push({ ...base, to: parent.phone, body, kind, personId: parent.id });
  };

  if (recipient.state !== answer) {
    const received = { accepted: acceptReceived(parentName), pending: checkingReceived(parentName, recipient.code), rejected: rejectReceived(parentName) };
    toHelper(recipient, received[answer], "reply_received");
  }

  if (dropsOut) {
    const cleared = { ...signal, signed_off_person_id: null };
    toParent(droppedOut(recipient.name, offersOf(others, cleared)), "dropped_out");
    for (const other of others) {
      if (other.state === "not_read" || other.state === "pending") toHelper(other, stillNeeded(parentName, signal.text, other.code), "still_needed");
    }
    if (note) toParent(`${recipient.name}: ${note}`, "reply");
  } else {
    const told = {
      accepted: wasSignedOff ? "" : helperAccepted(recipient.name, recipient.slot, note),
      pending: helperChecking(recipient.name, note),
      rejected: helperRejected(recipient.name, note),
    };
    if (told[answer]) toParent(told[answer], "reply");
    else if (note) toParent(`${recipient.name}: ${note}`, "reply");
  }

  return { state: answer, deliveries };
}

export async function signOff(env: Env, signal: SignalRow, parentName: string, target: SignOffTarget): Promise<SignOffResult> {
  const recipients = await listRecipients(env, signal.id);
  const accepted = recipients.filter((recipient) => recipient.state === "accepted");
  const offers = accepted.filter((recipient) => recipient.person_id !== signal.signed_off_person_id);
  const chosen =
    target === null
      ? offers.length === 1
        ? offers[0]
        : undefined
      : accepted.find((recipient) => ("slot" in target ? recipient.slot === target.slot : recipient.person_id === target.personId));

  if (!chosen) return { ok: false, error: "not_accepted", offers: offersOf(recipients, signal) };
  if (chosen.person_id === signal.signed_off_person_id) return { ok: true, signal, deliveries: [] };

  const updated = await env.DB.prepare("UPDATE signals SET signed_off_person_id = ? WHERE id = ? AND status = 'open' RETURNING *")
    .bind(chosen.person_id, signal.id)
    .first<SignalRow>();
  if (!updated) return { ok: false, error: "not_accepted", offers: [] };

  const switching = signal.signed_off_person_id !== null;
  const deliveries: Delivery[] = [];
  for (const recipient of recipients) {
    if (recipient.opted_out_at) continue;
    const send = (body: string, kind: Delivery["kind"]) =>
      deliveries.push({ to: recipient.phone, body, kind, householdId: signal.household_id, signalId: signal.id, personId: recipient.person_id });

    if (recipient.person_id === chosen.person_id) send(youAreOn(parentName, recipient.code), "signed_off");
    else if (recipient.state === "accepted") {
      if (!switching || recipient.person_id === signal.signed_off_person_id) send(standby(parentName, chosen.name), "standby");
    } else if (!switching && recipient.state !== "rejected") send(standDown(parentName, chosen.name), "stand_down");
  }
  return { ok: true, signal: updated, deliveries };
}
