import type { RecipientState } from "contract";

export type Answer = Exclude<RecipientState, "not_read">;
export type Reply = { answer: Answer; code: number | null; note: string };

const ANSWERS: Record<string, Answer> = {
  Y: "accepted",
  YES: "accepted",
  O: "accepted",
  OUI: "accepted",
  C: "pending",
  CHECK: "pending",
  CHECKING: "pending",
  N: "rejected",
  NO: "rejected",
  NON: "rejected",
};

const REPLY = /^(YES|OUI|Y|O|CHECKING|CHECK|C|NON|NO|N)\s*(\d{1,3})?(?:[\s,.:;!]+(.*))?$/is;
const SIGN_OFF = /^OK\s*(\d{1,3})?[\s.!]*$/i;

export function parseReply(body: string): Reply | null {
  const match = REPLY.exec(body.trim());
  if (!match) return null;
  const code = match[2] ? Number(match[2]) : null;
  const note = (match[3] ?? "").trim();
  // "No nappies left" from a parent is a signal, not a bare N.
  if (code === null && note) return null;
  return { answer: ANSWERS[match[1]!.toUpperCase()]!, code, note };
}

export function parseSignOff(body: string): { slot: number | null } | null {
  const match = SIGN_OFF.exec(body.trim());
  if (!match) return null;
  return { slot: match[1] ? Number(match[1]) : null };
}
