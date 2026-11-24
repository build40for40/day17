import { env } from "cloudflare:workers";
import type { MessageRow, SignalRow } from "../db";
import type { Owner } from "./signals";

export type FixturePerson = { id: string; phone: string; name: string; optedOut?: boolean };

export const anastasia: FixturePerson = { id: "p-anastasia", phone: "+447700900100", name: "Anastasia" };
export const grandma: FixturePerson = { id: "p-grandma", phone: "+447700900101", name: "Grandma" };
export const theo: FixturePerson = { id: "p-theo", phone: "+447700900102", name: "Theo" };
export const camille: FixturePerson = { id: "p-camille", phone: "+447700900103", name: "Camille" };
export const stranger = "+447700900555";

export async function seedHousehold(id: string, name: string, owner: FixturePerson, helpers: FixturePerson[]): Promise<Owner> {
  const db = env.DB;
  const people = [owner, ...helpers];
  await db.batch([
    db.prepare("INSERT INTO households (id, name) VALUES (?, ?)").bind(id, name),
    ...people.map((person) =>
      db
        .prepare("INSERT OR IGNORE INTO people (id, phone, name, opted_out_at) VALUES (?, ?, ?, ?)")
        .bind(person.id, person.phone, person.name, person.optedOut ? "2026-11-01T00:00:00.000Z" : null),
    ),
    db.prepare("INSERT INTO memberships (household_id, person_id, role) VALUES (?, ?, 'owner')").bind(id, owner.id),
    ...helpers.map((helper) =>
      db.prepare("INSERT INTO memberships (household_id, person_id, role, name) VALUES (?, ?, 'helper', ?)").bind(id, helper.id, helper.name),
    ),
  ]);
  return {
    person: { id: owner.id, phone: owner.phone, name: owner.name, opted_out_at: null, created_at: "" },
    household: { id, name, created_at: "" },
  };
}

export async function insertSignal(householdId: string, openedAt: string, status: "open" | "solved" = "open"): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO signals (id, household_id, text, source, status, opened_at) VALUES (?, ?, 'Earlier ask', 'web', ?, ?)")
    .bind(id, householdId, status, openedAt)
    .run();
  return id;
}

export async function signalsOf(householdId: string): Promise<SignalRow[]> {
  const { results } = await env.DB.prepare("SELECT * FROM signals WHERE household_id = ? ORDER BY opened_at").bind(householdId).all<SignalRow>();
  return results;
}

export async function outboundMessages(): Promise<MessageRow[]> {
  const { results } = await env.DB.prepare("SELECT * FROM messages WHERE direction = 'out' ORDER BY phone").all<MessageRow>();
  return results;
}
