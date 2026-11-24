import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../test/db";
import { isoAgo, newId, now, toSignal } from "./db";

const db = env.DB;

async function seedHousehold() {
  await db.batch([
    db.prepare("INSERT INTO households (id, name) VALUES ('h1', 'The Martins'), ('h2', 'The Duponts')"),
    db.prepare("INSERT INTO people (id, phone, name) VALUES ('p1', '+447700900001', 'Anastasia'), ('p2', '+447700900002', 'Grandma'), ('p3', '+447700900003', 'Theo')"),
    db.prepare(
      "INSERT INTO memberships (household_id, person_id, role) VALUES ('h1', 'p1', 'owner'), ('h1', 'p2', 'helper'), ('h1', 'p3', 'helper'), ('h2', 'p3', 'owner')",
    ),
  ]);
}

describe("helpers", () => {
  it("makes ids and ISO timestamps", () => {
    expect(newId()).not.toBe(newId());
    expect(now()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(isoAgo(60_000) < now()).toBe(true);
  });

  it("maps a signal row", () => {
    expect(
      toSignal({ id: "s1", household_id: "h1", text: "Pickup at 5", source: "sms", status: "open", opened_at: "2026-11-24T09:00:00.000Z", solved_at: null, signed_off_person_id: null }),
    ).toEqual({ id: "s1", householdId: "h1", text: "Pickup at 5", source: "sms", status: "open", openedAt: "2026-11-24T09:00:00.000Z", solvedAt: null, signedOffPersonId: null });
  });
});

describe("schema", () => {
  beforeEach(clearDatabase);

  it("defaults timestamps to the same ISO format as now()", async () => {
    await db.prepare("INSERT INTO households (id, name) VALUES ('h9', 'Test')").run();
    const row = await db.prepare("SELECT created_at FROM households WHERE id = 'h9'").first<{ created_at: string }>();
    expect(row?.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  it("allows one open signal per household", async () => {
    await seedHousehold();
    await db.prepare("INSERT INTO signals (id, household_id, text, source) VALUES ('s1', 'h1', 'Pickup at 5', 'web')").run();
    await expect(db.prepare("INSERT INTO signals (id, household_id, text, source) VALUES ('s2', 'h1', 'Nappies', 'sms')").run()).rejects.toThrow(
      /UNIQUE/,
    );
    await db.prepare("UPDATE signals SET status = 'solved' WHERE id = 's1'").run();
    await db.prepare("INSERT INTO signals (id, household_id, text, source) VALUES ('s2', 'h1', 'Nappies', 'sms')").run();
  });

  it("lets a person own more than one household", async () => {
    await seedHousehold();
    await db.prepare("INSERT INTO memberships (household_id, person_id, role) VALUES ('h2', 'p1', 'owner')").run();
    const owned = await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE person_id = 'p1' AND role = 'owner'").first<{ n: number }>();
    expect(owned?.n).toBe(2);
  });

  it("dedupes provider ids but allows many without one", async () => {
    const insert = (id: string, providerId: string | null) =>
      db
        .prepare("INSERT INTO messages (id, phone, direction, kind, body, provider_id, status) VALUES (?, '+447700900009', 'in', 'inbound', 'hi', ?, 'received')")
        .bind(id, providerId)
        .run();
    await insert("m1", null);
    await insert("m2", null);
    await insert("m3", "abc");
    await expect(insert("m4", "abc")).rejects.toThrow(/UNIQUE/);
  });

  it("deletes a household with its data and the people it leaves behind", async () => {
    await seedHousehold();
    await db.batch([
      db.prepare("INSERT INTO signals (id, household_id, text, source) VALUES ('s1', 'h1', 'Pickup at 5', 'web')"),
      db.prepare(
        "INSERT INTO messages (id, household_id, signal_id, person_id, phone, direction, kind, body, status) VALUES ('m1', 'h1', 's1', 'p2', '+447700900002', 'out', 'signal', 'Pickup at 5', 'sent')",
      ),
    ]);

    await db.prepare("DELETE FROM households WHERE id = 'h1'").run();

    const count = async (sql: string) => (await db.prepare(sql).first<{ n: number }>())?.n;
    expect(await count("SELECT count(*) AS n FROM memberships WHERE household_id = 'h1'")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM signals")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM messages")).toBe(0);
    const { results } = await db.prepare("SELECT id FROM people ORDER BY id").all<{ id: string }>();
    expect(results.map(({ id }) => id)).toEqual(["p3"]);
  });

  it("keeps the number of a person who opted out, without their name, so STOP outlives the household", async () => {
    await seedHousehold();
    await db.prepare("UPDATE people SET opted_out_at = ? WHERE id = 'p2'").bind(now()).run();

    await db.prepare("DELETE FROM households WHERE id = 'h1'").run();

    const { results } = await db.prepare("SELECT id, name, opted_out_at FROM people ORDER BY id").all();
    expect(results).toEqual([
      { id: "p2", name: null, opted_out_at: expect.any(String) },
      { id: "p3", name: "Theo", opted_out_at: null },
    ]);
  });
});
