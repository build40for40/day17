import { createExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { MAX_HELPERS, MAX_HOUSEHOLDS } from "contract";
import { MAX_HELPER_ADDS_PER_DAY, MAX_HOUSEHOLDS_PER_DAY } from "../limits";
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

const valid = (helpers = [{ name: "Gran", phone: GRAN }]) => ({ parentName: "Sam", householdName: "The Martins", description: "Family pickups and emergencies", helpers });
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

  it("returns no groups before one exists", async () => {
    const response = await call("GET", "/me", "parent");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      person: { id: "parent", phone: PARENT, name: null },
      groups: [],
      signalNumber: null,
    });
  });

  it("returns the household, helpers and open signal", async () => {
    await call("POST", "/households", "parent", valid());
    const me = (await (await call("GET", "/me", "parent")).json()) as any;
    await env.DB.prepare("INSERT INTO signals (id, household_id, text, source) VALUES ('s1', ?, 'Pickup at 5', 'web')")
      .bind(me.groups[0].household.id)
      .run();

    const after = (await (await call("GET", "/me", "parent")).json()) as any;
    expect(after.person.name).toBe("Sam");
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].household.name).toBe("The Martins");
    expect(after.groups[0].household.helpers).toEqual([expect.objectContaining({ name: "Gran", phone: GRAN, optedOut: false })]);
    expect(after.groups[0].openSignal).toMatchObject({ id: "s1", text: "Pickup at 5", status: "open" });
  });
});

describe("PATCH /me", () => {
  it("needs a session", async () => {
    expect((await call("PATCH", "/me", null, { name: "Sam" })).status).toBe(401);
  });

  it("changes the name a parent gave themselves", async () => {
    const response = await call("PATCH", "/me", "parent", { name: "  Sam   Martin " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ person: { id: "parent", phone: PARENT, name: "Sam Martin" } });
    expect(((await (await call("GET", "/me", "parent")).json()) as any).person.name).toBe("Sam Martin");
  });

  it("refuses an empty name", async () => {
    const response = await call("PATCH", "/me", "parent", { name: " " });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_name" });
  });
});

describe("POST /sign-out", () => {
  it("clears the session cookie and leaves the data alone", async () => {
    await call("POST", "/households", "parent", valid());

    const response = await call("POST", "/sign-out", "parent", {});
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^day17_session=;.*Max-Age=0/);
    expect(await count("households")).toBe(1);
  });
});

describe("DELETE /me", () => {
  it("needs a session", async () => {
    expect((await call("DELETE", "/me", null)).status).toBe(401);
  });

  it("deletes every group, its data and the parent, and signs them out", async () => {
    await call("POST", "/households", "parent", valid());
    await call("POST", "/households", "parent", { ...valid([{ name: "Coach", phone: NEIGHBOUR }]), householdName: "Football" });

    const response = await call("DELETE", "/me", "parent");
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^day17_session=;.*Max-Age=0/);

    expect(await count("households")).toBe(0);
    expect(await count("memberships")).toBe(0);
    expect(await count("messages")).toBe(0);
    expect(await count("people")).toBe(0);
  });

  it("forgets someone who never made a group", async () => {
    expect((await call("DELETE", "/me", "parent")).status).toBe(204);
    expect(await count("people")).toBe(0);
  });

  it("keeps a nameless row for a parent who still helps someone else", async () => {
    await addPerson("other", OTHER_PARENT, null);
    await call("POST", "/households", "other", valid([{ name: "Sam next door", phone: PARENT }]));
    await call("POST", "/households", "parent", valid());

    expect((await call("DELETE", "/me", "parent")).status).toBe(204);

    expect(await count("households")).toBe(1);
    expect(await env.DB.prepare("SELECT name FROM people WHERE id = 'parent'").first()).toEqual({ name: null });
    const { groups } = (await (await call("GET", "/me", "other")).json()) as any;
    expect(groups[0].household.helpers.map((helper: any) => helper.name)).toEqual(["Sam next door"]);
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

  it("lets a parent own several groups, each with its own helpers and signal", async () => {
    await call("POST", "/households", "parent", valid());
    const response = await call("POST", "/households", "parent", { ...valid([{ name: "Coach", phone: OTHER_PARENT }]), householdName: "Football" });
    expect(response.status).toBe(201);
    expect(((await response.json()) as any).household).toMatchObject({ name: "Football", helpers: [expect.objectContaining({ name: "Coach" })] });

    const me = (await (await call("GET", "/me", "parent")).json()) as any;
    expect(me.groups.map((group: any) => group.household.name)).toEqual(["The Martins", "Football"]);
    expect(me.groups.map((group: any) => group.household.helpers.length)).toEqual([valid().helpers.length, 1]);
  });

  it("stops at the maximum number of groups", async () => {
    const insert = env.DB.prepare("INSERT INTO households (id, name) VALUES (?, 'Group')");
    const own = env.DB.prepare("INSERT INTO memberships (household_id, person_id, role) VALUES (?, 'parent', 'owner')");
    await env.DB.batch(Array.from({ length: MAX_HOUSEHOLDS }, (_, i) => [insert.bind(`g${i}`), own.bind(`g${i}`)]).flat());

    const response = await call("POST", "/households", "parent", valid());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "too_many_households" });
    expect(await count("households")).toBe(MAX_HOUSEHOLDS);
  });

  it.each([
    ["not an object", [], "invalid_request"],
    ["missing helpers", { parentName: "Sam", householdName: "H" }, "invalid_request"],
    ["missing description", { ...valid(), description: " " }, "invalid_description"],
    ["long description", { ...valid(), description: "x".repeat(201) }, "invalid_description"],
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
    expect(olivia.groups[0].household.helpers).toEqual([expect.objectContaining({ id: "gran", name: "Gran" })]);
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
    const { household } = ((await (await call("GET", "/me", "parent")).json()) as any).groups[0];
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

  it("deletes one group of several by id and keeps the parent signed in", async () => {
    await call("POST", "/households", "parent", valid());
    await call("POST", "/households", "parent", { ...valid(), householdName: "Football" });
    const { groups } = (await (await call("GET", "/me", "parent")).json()) as any;

    expect((await call("DELETE", "/households/mine", "parent")).status).toBe(400);
    const response = await call("DELETE", `/households/mine?id=${groups[1].household.id}`, "parent");

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    const after = (await (await call("GET", "/me", "parent")).json()) as any;
    expect(after.person.name).toBe("Sam");
    expect(after.groups.map((group: any) => group.household.name)).toEqual(["The Martins"]);
  });

  it("won't delete a group that belongs to someone else", async () => {
    await addPerson("other", OTHER_PARENT, "Olivia");
    await call("POST", "/households", "other", valid());
    await call("POST", "/households", "parent", valid());
    const theirs = ((await (await call("GET", "/me", "other")).json()) as any).groups[0].household.id;

    expect((await call("DELETE", `/households/mine?id=${theirs}`, "parent")).status).toBe(404);
    expect(await count("households")).toBe(2);
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

describe("POST /households/helpers", () => {
  const groupId = async () => ((await (await call("GET", "/me", "parent")).json()) as any).groups[0].household.id as string;

  it("needs a session", async () => {
    expect((await call("POST", "/households/helpers", null, { name: "Nan", phone: NEIGHBOUR })).status).toBe(401);
  });

  it("adds a helper to the group and texts them a welcome", async () => {
    await call("POST", "/households", "parent", valid());
    clearFakeOutbox();

    const response = await call("POST", "/households/helpers", "parent", { name: " Nan ", phone: "+44 7700 900003" });

    expect(response.status).toBe(201);
    const { household } = (await response.json()) as any;
    expect(household.helpers.map((helper: any) => [helper.name, helper.phone])).toEqual([
      ["Gran", GRAN],
      ["Nan", NEIGHBOUR],
    ]);
    expect(fakeOutbox().map((sms) => sms.to)).toEqual([NEIGHBOUR]);
  });

  it("refuses a number already in the group and the parent's own", async () => {
    await call("POST", "/households", "parent", valid());
    const add = async (phone: string) => (await (await call("POST", "/households/helpers", "parent", { name: "Nan", phone })).json()) as any;

    expect((await add(GRAN)).error).toBe("duplicate_helper");
    expect((await add(PARENT)).error).toBe("duplicate_helper");
  });

  it("refuses an eleventh helper", async () => {
    const add = async (phone: string) => (await (await call("POST", "/households/helpers", "parent", { name: "Nan", phone })).json()) as any;
    const ten = Array.from({ length: MAX_HELPERS }, (_, index) => ({ name: `Helper ${index}`, phone: `+4477009001${String(index).padStart(2, "0")}` }));
    await call("POST", "/households", "parent", valid(ten));
    expect((await add(NEIGHBOUR)).error).toBe("too_many_helpers");
  });

  it("needs a group id once the parent owns several, and won't touch someone else's", async () => {
    await call("POST", "/households", "parent", valid());
    await call("POST", "/households", "parent", { ...valid([]), householdName: "Football" });
    await addPerson("other", OTHER_PARENT, null);
    await call("POST", "/households", "other", valid([]));
    const theirs = ((await (await call("GET", "/me", "other")).json()) as any).groups[0].household.id;

    expect((await call("POST", "/households/helpers", "parent", { name: "Nan", phone: NEIGHBOUR })).status).toBe(400);
    expect((await call("POST", "/households/helpers", "parent", { name: "Nan", phone: NEIGHBOUR, householdId: theirs })).status).toBe(404);
    expect((await call("POST", "/households/helpers", "parent", { name: "Nan", phone: NEIGHBOUR, householdId: await groupId() })).status).toBe(201);
  });

  it(`caps a parent at ${MAX_HELPER_ADDS_PER_DAY} added helpers a day, even when they remove in between`, async () => {
    await call("POST", "/households", "parent", valid([]));
    for (let index = 0; index < MAX_HELPER_ADDS_PER_DAY; index++) {
      const response = await call("POST", "/households/helpers", "parent", { name: "Nan", phone: NEIGHBOUR });
      const id = ((await response.json()) as any).household.helpers[0].id;
      await call("DELETE", `/households/helpers?personId=${id}`, "parent");
    }

    expect((await call("POST", "/households/helpers", "parent", { name: "Nan", phone: NEIGHBOUR })).status).toBe(429);
  });
});

describe("DELETE /households/helpers", () => {
  const helpers = async (personId = "parent") => ((await (await call("GET", "/me", personId)).json()) as any).groups[0].household.helpers as any[];

  it("needs a session", async () => {
    expect((await call("DELETE", "/households/helpers?personId=x", null)).status).toBe(401);
  });

  it("removes the helper, their texts and their place on the open signal, and forgets them", async () => {
    await call("POST", "/households", "parent", valid([{ name: "Gran", phone: GRAN }, { name: "Nan", phone: NEIGHBOUR }]));
    await call("POST", "/signals", "parent", { text: "Pickup at 5" });
    const gran = (await helpers()).find((helper) => helper.phone === GRAN);

    const response = await call("DELETE", `/households/helpers?personId=${gran.id}`, "parent");

    expect(response.status).toBe(200);
    expect(((await response.json()) as any).household.helpers.map((helper: any) => helper.phone)).toEqual([NEIGHBOUR]);
    const left = async (sql: string) => (await env.DB.prepare(sql).bind(GRAN).first<{ n: number }>())!.n;
    expect(await left("SELECT COUNT(*) AS n FROM people WHERE phone = ?")).toBe(0);
    expect(await left("SELECT COUNT(*) AS n FROM messages WHERE phone = ?")).toBe(0);
    expect(await left("SELECT COUNT(*) AS n FROM signal_recipients r JOIN people p ON p.id = r.person_id WHERE p.phone = ?")).toBe(0);
  });

  it("keeps a helper who is still in another group", async () => {
    await call("POST", "/households", "parent", valid());
    await addPerson("other", OTHER_PARENT, null);
    await call("POST", "/households", "other", valid());
    const gran = (await helpers())[0];

    await call("DELETE", `/households/helpers?personId=${gran.id}`, "parent");

    expect(await helpers()).toEqual([]);
    expect((await helpers("other")).map((helper) => helper.phone)).toEqual([GRAN]);
  });

  it("404s for someone who isn't a helper in the group, the parent included", async () => {
    await call("POST", "/households", "parent", valid());

    expect((await call("DELETE", "/households/helpers?personId=parent", "parent")).status).toBe(404);
    expect((await call("DELETE", "/households/helpers?personId=nobody", "parent")).status).toBe(404);
    expect(await count("memberships")).toBe(2);
  });
});
