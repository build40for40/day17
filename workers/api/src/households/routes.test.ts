import { createExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { MAX_HOUSEHOLDS_PER_DAY } from "../limits";
import worker from "../index";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../../test/db";
import { createSessionCookie } from "../session";
import { clearFakeOutbox, fakeOutbox } from "../sms/fake";

const PARENT = "+447700900001";
const GRAN = "+447700900002";
const NEIGHBOUR = "+447700900003";
const OTHER_PARENT = "+447700900004";

async function addPerson(id: string, phone: string, name: string | null, optedOut = false) {
  await env.DB.prepare("INSERT INTO people (id, phone, name, opted_out_at) VALUES (?, ?, ?, ?)")
    .bind(id, phone, name, optedOut ? "2026-11-01T00:00:00.000Z" : null)
    .run();
}

async function call(method: string, path: string, personId: string | null, body?: unknown, environment?: Partial<Env>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (personId) headers.Cookie = (await createSessionCookie(env, personId)).split(";")[0]!;
  if (environment) {
    const request = new Request(`https://build40for40.com/day17/api/v1${path}`, { method, headers, body: JSON.stringify(body) });
    return worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, { ...env, ...environment }, createExecutionContext());
  }
  return exports.default.fetch(`https://build40for40.com/day17/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const valid = (helpers = [{ name: "Gran", phone: GRAN }]) => ({ parentName: "Sam", householdName: "The Martins", helpers });
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

beforeEach(async () => {
  await clearDatabase();
  clearFakeOutbox();
  await addPerson("parent", PARENT, null);
});

describe("GET /me", () => {
  it("needs a session", async () => {
    expect((await call("GET", "/me", null)).status).toBe(401);
  });

  it("treats a deleted person as unauthorized", async () => {
    expect((await call("GET", "/me", "ghost")).status).toBe(401);
  });

  it("returns a null household before one exists", async () => {
    const response = await call("GET", "/me", "parent");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      person: { id: "parent", phone: PARENT, name: null },
      household: null,
      openSignal: null,
      signalNumber: null,
    });
  });

  it("returns the household, helpers and open signal", async () => {
    await call("POST", "/households", "parent", valid());
    const me = (await (await call("GET", "/me", "parent")).json()) as any;
    await env.DB.prepare("INSERT INTO signals (id, household_id, text, source) VALUES ('s1', ?, 'Pickup at 5', 'web')")
      .bind(me.household.id)
      .run();

    const after = (await (await call("GET", "/me", "parent")).json()) as any;
    expect(after.person.name).toBe("Sam");
    expect(after.household.name).toBe("The Martins");
    expect(after.household.helpers).toEqual([expect.objectContaining({ name: "Gran", phone: GRAN, optedOut: false })]);
    expect(after.openSignal).toMatchObject({ id: "s1", text: "Pickup at 5", status: "open" });
  });
});

describe("POST /households", () => {
  it("needs a session", async () => {
    expect((await call("POST", "/households", null, valid())).status).toBe(401);
  });

  it("creates the household, normalises phones and texts each helper", async () => {
    const response = await call(
      "POST",
      "/households",
      "parent",
      valid([
        { name: "Gran", phone: "+44 7700 900002" },
        { name: "Pat", phone: NEIGHBOUR },
      ]),
    );
    expect(response.status).toBe(201);
    const { household } = (await response.json()) as any;
    expect(household.helpers.map((helper: any) => helper.phone).sort()).toEqual([GRAN, NEIGHBOUR]);
    expect(fakeOutbox().map((sms) => sms.to).sort()).toEqual([GRAN, NEIGHBOUR]);
    expect(fakeOutbox()[0]!.body).toContain("Sam");

    const { results } = await env.DB.prepare("SELECT kind, status FROM messages").all();
    expect(results).toEqual([
      { kind: "welcome", status: "sent" },
      { kind: "welcome", status: "sent" },
    ]);
  });

  it("rejects a parent who already owns a household", async () => {
    await call("POST", "/households", "parent", valid());
    const response = await call("POST", "/households", "parent", valid());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_has_household" });
    expect(await count("households")).toBe(1);
  });

  it.each([
    ["not an object", [], "invalid_request"],
    ["missing helpers", { parentName: "Sam", householdName: "H" }, "invalid_request"],
    ["blank parent name", { ...valid(), parentName: "  " }, "invalid_name"],
    ["long household name", { ...valid(), householdName: "x".repeat(61) }, "invalid_name"],
    ["blank helper name", valid([{ name: "", phone: GRAN }]), "invalid_name"],
    ["bad helper phone", valid([{ name: "Gran", phone: "nope" }]), "invalid_phone"],
    ["helper outside the UK and France", valid([{ name: "Gran", phone: "+1 202 555 0123" }]), "invalid_phone"],
    [
      "duplicate helpers",
      valid([
        { name: "Gran", phone: GRAN },
        { name: "Gran again", phone: "+44 7700 900002" },
      ]),
      "duplicate_helper",
    ],
    ["parent as their own helper", valid([{ name: "Me", phone: PARENT }]), "duplicate_helper"],
    [
      "eleven helpers",
      valid(Array.from({ length: 11 }, (_, i) => ({ name: `H${i}`, phone: `+4477009005${String(i).padStart(2, "0")}` }))),
      "too_many_helpers",
    ],
  ])("rejects %s", async (_label, body, code) => {
    const response = await call("POST", "/households", "parent", body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: code });
    expect(await count("households")).toBe(0);
    expect(fakeOutbox()).toEqual([]);
  });

  it("accepts ten helpers", async () => {
    const helpers = Array.from({ length: 10 }, (_, i) => ({ name: `H${i}`, phone: `+4477009005${String(i).padStart(2, "0")}` }));
    expect((await call("POST", "/households", "parent", valid(helpers))).status).toBe(201);
    expect(fakeOutbox()).toHaveLength(10);
  });

  it("rejects invalid json", async () => {
    const response = await exports.default.fetch("https://build40for40.com/day17/api/v1/households", {
      method: "POST",
      headers: { Cookie: (await createSessionCookie(env, "parent")).split(";")[0]!, "Content-Type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  it("shows each parent the name they gave a helper, never a name someone else chose", async () => {
    await addPerson("other", OTHER_PARENT, "Olivia");
    await addPerson("gran", GRAN, "Granny Rose");
    await call("POST", "/households", "other", valid([{ name: "Gran", phone: GRAN }]));
    const response = await call("POST", "/households", "parent", valid([{ name: "Nan", phone: GRAN }]));
    expect(response.status).toBe(201);
    const { household } = (await response.json()) as any;
    expect(household.helpers).toEqual([expect.objectContaining({ id: "gran", name: "Nan" })]);

    const olivia = (await (await call("GET", "/me", "other")).json()) as any;
    expect(olivia.household.helpers).toEqual([expect.objectContaining({ id: "gran", name: "Gran" })]);
    expect(await env.DB.prepare("SELECT name FROM people WHERE id = 'gran'").first("name")).toBe("Granny Rose");
    expect(await count("people")).toBe(3);
  });

  it("doesn't reveal the name a parent gave themselves when someone adds them as a helper", async () => {
    await addPerson("other", OTHER_PARENT, "Olivia Dupont");
    const response = await call("POST", "/households", "parent", valid([{ name: "x", phone: OTHER_PARENT }]));
    const { household } = (await response.json()) as any;
    expect(household.helpers).toEqual([expect.objectContaining({ name: "x" })]);
  });

  it("refuses the signal number as a helper", async () => {
    const response = await call("POST", "/households", "parent", valid([{ name: "Bot", phone: "+44 7700 900777" }]), { SIGNAL_NUMBER: "+447700900777" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_phone" });
    expect(fakeOutbox()).toEqual([]);
  });

  it(`caps a person at ${MAX_HOUSEHOLDS_PER_DAY} new households a day, even when they delete in between`, async () => {
    for (let i = 0; i < MAX_HOUSEHOLDS_PER_DAY; i++) {
      expect((await call("POST", "/households", "parent", valid())).status).toBe(201);
      expect((await call("DELETE", "/households/mine", "parent")).status).toBe(204);
      await addPerson("parent", PARENT, null);
    }
    clearFakeOutbox();

    const response = await call("POST", "/households", "parent", valid());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(await count("households")).toBe(0);
    expect(fakeOutbox()).toEqual([]);
  });

  it("lets an existing parent be a helper elsewhere", async () => {
    await addPerson("other", OTHER_PARENT, "Olivia");
    const response = await call("POST", "/households", "parent", valid([{ name: "Olivia B", phone: OTHER_PARENT }]));
    expect(response.status).toBe(201);
    expect(await count("people")).toBe(2);
  });

  it("adds opted out helpers without texting them", async () => {
    await addPerson("gran", GRAN, "Gran", true);
    const response = await call("POST", "/households", "parent", valid());
    const { household } = (await response.json()) as any;
    expect(household.helpers).toEqual([expect.objectContaining({ phone: GRAN, optedOut: true })]);
    expect(fakeOutbox()).toEqual([]);
    expect(await count("messages")).toBe(0);
  });

  it("still creates the household when a welcome fails to send", async () => {
    const response = await call("POST", "/households", "parent", valid([{ name: "Bad", phone: "+447700900999" }]));
    expect(response.status).toBe(201);
    expect(await env.DB.prepare("SELECT status FROM messages").first()).toEqual({ status: "failed" });
  });
});

describe("DELETE /households/mine", () => {
  it("needs a session", async () => {
    expect((await call("DELETE", "/households/mine", null)).status).toBe(401);
  });

  it("404s when there is nothing to delete", async () => {
    const response = await call("DELETE", "/households/mine", "parent");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no_household" });
  });

  it("deletes the household, its data and the parent, and signs them out", async () => {
    await call("POST", "/households", "parent", valid());
    const { household } = (await (await call("GET", "/me", "parent")).json()) as any;
    await env.DB.prepare("INSERT INTO signals (id, household_id, text, source, status) VALUES ('s1', ?, 'x', 'web', 'solved')")
      .bind(household.id)
      .run();

    const response = await call("DELETE", "/households/mine", "parent");
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^day17_session=;.*Max-Age=0/);

    expect(await count("households")).toBe(0);
    expect(await count("memberships")).toBe(0);
    expect(await count("signals")).toBe(0);
    expect(await count("messages")).toBe(0);
    expect(await count("people")).toBe(0);

    expect((await call("GET", "/me", "parent")).status).toBe(401);
  });

  it("keeps helpers who help in another household", async () => {
    await addPerson("other", OTHER_PARENT, "Olivia");
    await call("POST", "/households", "other", valid([{ name: "Gran", phone: GRAN }]));
    await call("POST", "/households", "parent", valid([{ name: "Gran", phone: GRAN }]));

    await call("DELETE", "/households/mine", "parent");

    const phones = (await env.DB.prepare("SELECT phone FROM people ORDER BY phone").all<{ phone: string }>()).results.map((r) => r.phone);
    expect(phones).toEqual([GRAN, OTHER_PARENT]);
    expect(await count("households")).toBe(1);
  });

  it("keeps a parent who is a helper elsewhere with that membership", async () => {
    await addPerson("other", OTHER_PARENT, "Olivia");
    await call("POST", "/households", "other", valid([{ name: "Sam", phone: PARENT }]));
    await call("POST", "/households", "parent", valid());

    await call("DELETE", "/households/mine", "parent");

    expect(await count("memberships")).toBe(2);
  });
});
