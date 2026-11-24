import type { MembershipRole, RecipientState, Signal, SignalSource, SignalStatus } from "contract";

export type MessageDirection = "in" | "out";
export type MessageKind =
  | "inbound"
  | "welcome"
  | "signal"
  | "update"
  | "all_clear"
  | "relay"
  | "nothing_open"
  | "signup_link"
  | "refused"
  | "reply_received"
  | "reply"
  | "signed_off"
  | "standby"
  | "stand_down"
  | "dropped_out"
  | "still_needed"
  | "code_prompt"
  | "sign_off_help"
  | "pick_group";
export type MessageStatus = "received" | "sent" | "failed";

export type HouseholdRow = { id: string; name: string; created_at: string };

export type PersonRow = {
  id: string;
  phone: string;
  name: string | null;
  opted_out_at: string | null;
  created_at: string;
};

export type MembershipRow = {
  household_id: string;
  person_id: string;
  role: MembershipRole;
  created_at: string;
};

export type SignalRow = {
  id: string;
  household_id: string;
  text: string;
  source: SignalSource;
  status: SignalStatus;
  opened_at: string;
  solved_at: string | null;
  signed_off_person_id: string | null;
};

export type RecipientRow = {
  signal_id: string;
  person_id: string;
  code: number;
  slot: number;
  state: RecipientState;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  household_id: string | null;
  signal_id: string | null;
  person_id: string | null;
  phone: string;
  direction: MessageDirection;
  kind: MessageKind;
  body: string;
  provider_id: string | null;
  status: MessageStatus;
  created_at: string;
};

export type VerificationRow = {
  id: number;
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
};

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function toSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    householdId: row.household_id,
    text: row.text,
    source: row.source,
    status: row.status,
    openedAt: row.opened_at,
    solvedAt: row.solved_at,
    signedOffPersonId: row.signed_off_person_id,
  };
}
