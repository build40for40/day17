export type ErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "payload_too_large"
  | "unsupported_media_type"
  | "invalid_phone"
  | "invalid_name"
  | "invalid_description"
  | "invalid_code"
  | "turnstile_failed"
  | "rate_limited"
  | "too_many_attempts"
  | "unauthorized"
  | "forbidden"
  | "too_many_households"
  | "no_household"
  | "too_many_helpers"
  | "duplicate_helper"
  | "signal_too_long"
  | "too_many_signals"
  | "no_open_signal"
  | "classifier_unavailable"
  | "not_accepted"
  | "not_found"
  | "method_not_allowed"
  | "not_implemented"
  | "internal_error";

export type ErrorResponse = { error: ErrorCode };
export type OkResponse = { ok: true };

export type SignalStatus = "open" | "solved";
export type SignalSource = "sms" | "web";
export type RecipientState = "not_read" | "pending" | "accepted" | "rejected";
export type MembershipRole = "owner" | "helper";

export type Person = {
  id: string;
  phone: string;
  name: string | null;
};

export type Helper = {
  id: string;
  name: string;
  phone: string;
  optedOut: boolean;
};

export type Household = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  helpers: Helper[];
};

export type Signal = {
  id: string;
  householdId: string;
  text: string;
  source: SignalSource;
  status: SignalStatus;
  openedAt: string;
  solvedAt: string | null;
  signedOffPersonId: string | null;
};

export type SignalRecipient = {
  personId: string;
  name: string;
  state: RecipientState;
  signedOff: boolean;
};

export type VerifyStartRequest = { phone: string; turnstileToken?: string };
export type VerifyStartResponse = OkResponse;

export type VerifyCheckRequest = { phone: string; code: string };
export type VerifyCheckResponse = OkResponse;

export type Group = {
  household: Household;
  openSignal: Signal | null;
  recipients: SignalRecipient[];
};

export type MeResponse = {
  person: Person;
  groups: Group[];
  signalNumber: string | null;
};

export type HelperInput = { name: string; phone: string };

export type CreateHouseholdRequest = {
  parentName: string;
  householdName: string;
  description: string;
  helpers: HelperInput[];
};
export type CreateHouseholdResponse = { household: Household };

export type AddHelperRequest = HelperInput & { householdId?: string };
export type AddHelperResponse = { household: Household };
export type RemoveHelperResponse = { household: Household };

export type CreateSignalRequest = { text: string; householdIds?: string[]; householdId?: string };
export type CreateSignalResponse = { signals: Signal[] };

export type GroupMatch = { householdId: string; score: number };
export type MatchSignalRequest = { text: string };
export type MatchSignalResponse = { matches: GroupMatch[] };

export type SolveSignalRequest = { householdId?: string };
export type SolveSignalResponse = { signal: Signal };

export type SignOffRequest = { personId: string; householdId?: string };
export type SignOffResponse = { signal: Signal };
