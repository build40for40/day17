import {
  MAX_HELPERS,
  MAX_HOUSEHOLDS,
  MAX_NAME_LENGTH,
  normalisePhone,
  type CreateHouseholdResponse,
  type Group,
  type Household,
  type HelperInput,
  type MeResponse,
} from "contract";
import {
  newId,
  toSignal,
  type HouseholdRow,
  type PersonRow,
  type SignalRow,
} from "../db";
import { error, json, noContent, readJson, type Handler } from "../http";
import { limits, take } from "../limits";
import { clearSessionCookie, requireSession } from "../session";
import { sendAll } from "../sms/send";
import { welcome } from "../sms/texts";
import { listRecipients, toSignalRecipient } from "../signals/recipients";

type ValidHelper = { name: string; phone: string };
type ValidRequest = { parentName: string; householdName: string; helpers: ValidHelper[] };
type Validation = { ok: true; value: ValidRequest } | { ok: false; response: Response };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
};

function validate(data: unknown, parentPhone: string, signalNumber: string | null): Validation {
  const fail = (code: Parameters<typeof error>[0], status = 400) => ({ ok: false, response: error(code, status) }) as const;
  if (!isRecord(data) || !Array.isArray(data.helpers)) return fail("invalid_request");

  const parentName = cleanName(data.parentName);
  const householdName = cleanName(data.householdName);
  if (!parentName || !householdName) return fail("invalid_name");
  if (data.helpers.length > MAX_HELPERS) return fail("too_many_helpers");

  const helpers: ValidHelper[] = [];
  const seen = new Set<string>([parentPhone]);
  for (const entry of data.helpers as unknown[]) {
    if (!isRecord(entry)) return fail("invalid_request");
    const { name: rawName, phone: rawPhone } = entry as Partial<HelperInput>;
    const name = cleanName(rawName);
    if (!name) return fail("invalid_name");
    const phone = typeof rawPhone === "string" ? normalisePhone(rawPhone) : null;
    if (!phone || phone === signalNumber) return fail("invalid_phone");
    if (seen.has(phone)) return fail("duplicate_helper");
    seen.add(phone);
    helpers.push({ name, phone });
  }
  return { ok: true, value: { parentName, householdName, helpers } };
}

async function findPerson(env: Env, personId: string): Promise<PersonRow | null> {
  return env.DB.prepare("SELECT * FROM people WHERE id = ?").bind(personId).first<PersonRow>();
}

async function loadOwnedHouseholds(env: Env, personId: string): Promise<Household[]> {
  const { results } = await env.DB.prepare(
    `SELECT h.* FROM households h JOIN memberships m ON m.household_id = h.id
     WHERE m.person_id = ? AND m.role = 'owner'
     ORDER BY h.created_at, h.id`,
  )
    .bind(personId)
    .all<HouseholdRow>();
  return Promise.all(results.map((row) => loadHousehold(env, row)));
}

async function loadHousehold(env: Env, row: HouseholdRow): Promise<Household> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, m.name, p.phone, p.opted_out_at FROM memberships m JOIN people p ON p.id = m.person_id
     WHERE m.household_id = ? AND m.role = 'helper' ORDER BY m.created_at, m.name`,
  )
    .bind(row.id)
    .all<Pick<PersonRow, "id" | "name" | "phone" | "opted_out_at">>();

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    helpers: results.map((helper) => ({
      id: helper.id,
      name: helper.name ?? "",
      phone: helper.phone,
      optedOut: helper.opted_out_at !== null,
    })),
  };
}

export const handleMe: Handler = async (request, env) => {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const person = await findPerson(env, session.personId);
  if (!person) return error("unauthorized", 401);

  const households = await loadOwnedHouseholds(env, person.id);
  const groups = await Promise.all(
    households.map(async (household): Promise<Group> => {
      const signalRow = await env.DB.prepare("SELECT * FROM signals WHERE household_id = ? AND status = 'open'")
        .bind(household.id)
        .first<SignalRow>();
      return {
        household,
        openSignal: signalRow ? toSignal(signalRow) : null,
        recipients: signalRow ? (await listRecipients(env, signalRow.id)).map((recipient) => toSignalRecipient(recipient, signalRow)) : [],
      };
    }),
  );

  return json({
    person: { id: person.id, phone: person.phone, name: person.name },
    groups,
    signalNumber: env.SIGNAL_NUMBER || null,
  } satisfies MeResponse);
};

export const handleCreateHousehold: Handler = async (request, env) => {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const person = await findPerson(env, session.personId);
  if (!person) return error("unauthorized", 401);

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const validation = validate(body.data, person.phone, env.SIGNAL_NUMBER ? normalisePhone(env.SIGNAL_NUMBER) : null);
  if (!validation.ok) return validation.response;
  const { parentName, householdName, helpers } = validation.value;

  if ((await loadOwnedHouseholds(env, person.id)).length >= MAX_HOUSEHOLDS) return error("too_many_households", 409);
  if (!(await take(env.DB, limits.household(person.phone)))) return error("rate_limited", 429);

  const householdId = newId();
  const upsertPerson = env.DB.prepare("INSERT INTO people (id, phone) VALUES (?, ?) ON CONFLICT (phone) DO NOTHING");
  const addMember = env.DB.prepare(
    `INSERT INTO memberships (household_id, person_id, role, name)
     SELECT ?, id, 'helper', ? FROM people WHERE phone = ?`,
  );

  await env.DB.batch([
    env.DB.prepare("UPDATE people SET name = ? WHERE id = ?").bind(parentName, person.id),
    env.DB.prepare("INSERT INTO households (id, name) VALUES (?, ?)").bind(householdId, householdName),
    env.DB.prepare("INSERT INTO memberships (household_id, person_id, role) VALUES (?, ?, 'owner')").bind(
      householdId,
      person.id,
    ),
    ...helpers.flatMap((helper) => [
      upsertPerson.bind(newId(), helper.phone),
      addMember.bind(householdId, helper.name, helper.phone),
    ]),
  ]);

  const household = (await loadOwnedHouseholds(env, person.id)).find((owned) => owned.id === householdId)!;
  const recipients = household.helpers.filter((helper) => !helper.optedOut);
  await sendAll(
    env,
    recipients.map((helper) => ({
      to: helper.phone,
      body: welcome(parentName, householdName),
      kind: "welcome" as const,
      householdId,
      personId: helper.id,
    })),
  );

  return json({ household } satisfies CreateHouseholdResponse, 201);
};

export const handleDeleteHousehold: Handler = async (request, env) => {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const person = await findPerson(env, session.personId);
  if (!person) return error("unauthorized", 401);

  const households = await loadOwnedHouseholds(env, person.id);
  const id = new URL(request.url).searchParams.get("id");
  const household = id ? households.find((owned) => owned.id === id) : households.length === 1 ? households[0] : undefined;
  if (!household) return error(id || households.length === 0 ? "no_household" : "invalid_request", id || households.length === 0 ? 404 : 400);

  if (households.length > 1) {
    await env.DB.prepare("DELETE FROM households WHERE id = ?").bind(household.id).run();
    return noContent();
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM households WHERE id = ?").bind(household.id),
    env.DB.prepare("UPDATE people SET name = NULL WHERE id = ?").bind(person.id),
  ]);

  return noContent({ "Set-Cookie": clearSessionCookie() });
};
