import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { API_BASE, MAX_SIGNAL_LENGTH } from "contract";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../../test/db";
import { isoAgo, now } from "../db";
import { MAX_BROADCASTS_PER_DAY } from "../limits";
import type { Handler } from "../http";
import { createSessionCookie } from "../session";
import { clearFakeOutbox, fakeOutbox } from "../sms/fake";
import { allClear, signalWithCodes, standDown, updateWithCodes, youAreOn } from "../sms/texts";
import { anastasia, grandma, insertSignal, seedHousehold, signalsOf, stranger, theo } from "./fixtures";
import { handleCreateSignal, handleInboundSms, handleScheduled, handleSignOff, handleSolveSignal } from "./routes";

async function cookieFor(personId: string): Promise<string> {
  return (await createSessionCookie(env, personId)).split(";")[0]!;
}

async function call(handler: Handler, path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const request = new Request(`https://build40for40.com${API_BASE}${path}`, { method: "POST", ...init });
  request.headers.set("Content-Type", "application/json");
  const response = await handler(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function asParent(handler: Handler, path: string, body?: unknown, personId = anastasia.id) {
  return call(handler, path, { headers: { Cookie: await cookieFor(personId) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const sent = () => fakeOutbox().map(({ to, body }) => ({ to, body }));

describe("signal routes", () => {
  beforeEach(async () => {
    await clearDatabase();
    clearFakeOutbox();
    await seedHousehold("h1", "The Martins", anastasia, [grandma, theo]);
  });

  describe("POST /signals", () => {
    it("needs a session", async () => {
      const response = await call(handleCreateSignal, "/signals", { body: JSON.stringify({ text: "Help" }) });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    });

    it("treats a deleted person as signed out", async () => {
      expect((await asParent(handleCreateSignal, "/signals", { text: "Help" }, "p-deleted")).status).toBe(401);
    });

    it("needs a household the person owns", async () => {
      const response = await asParent(handleCreateSignal, "/signals", { text: "Help" }, grandma.id);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "no_household" });
    });

    it("opens a signal and texts the helpers", async () => {
      const response = await asParent(handleCreateSignal, "/signals", { text: "Hospital run, need a lift" });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        signal: { id: expect.any(String), householdId: "h1", text: "Hospital run, need a lift", source: "web", status: "open", openedAt: expect.any(String), solvedAt: null, signedOffPersonId: null },
      });
      expect(sent()).toEqual([
        { to: grandma.phone, body: signalWithCodes("Anastasia", "Hospital run, need a lift", 1) },
        { to: theo.phone, body: signalWithCodes("Anastasia", "Hospital run, need a lift", 1) },
      ]);
    });

    it("sends an update when a signal is already open", async () => {
      await asParent(handleCreateSignal, "/signals", { text: "Pickup at 5" });
      clearFakeOutbox();

      const response = await asParent(handleCreateSignal, "/signals", { text: "Make it 5:30" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ signal: { text: "Pickup at 5", status: "open" } });
      expect(sent()).toEqual([
        { to: grandma.phone, body: updateWithCodes("Anastasia", "Make it 5:30", 1) },
        { to: theo.phone, body: updateWithCodes("Anastasia", "Make it 5:30", 1) },
      ]);
    });

    it.each([
      [{}, 400, "invalid_request"],
      [{ text: 42 }, 400, "invalid_request"],
      [{ text: "  " }, 400, "invalid_request"],
      [{ text: "x".repeat(MAX_SIGNAL_LENGTH + 1) }, 400, "signal_too_long"],
    ])("rejects %j", async (body, status, code) => {
      const response = await asParent(handleCreateSignal, "/signals", body);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: code });
    });

    it("rejects a body that isn't JSON", async () => {
      const response = await call(handleCreateSignal, "/signals", { headers: { Cookie: await cookieFor(anastasia.id) }, body: "nope" });
      expect(await response.json()).toEqual({ error: "invalid_json" });
    });

    it("answers 429 once the parent has used up a day of broadcasts", async () => {
      await env.DB.batch(
        Array.from({ length: MAX_BROADCASTS_PER_DAY }, () =>
          env.DB.prepare("INSERT INTO rate_events (key, created_at) VALUES (?, ?)").bind(`broadcast:${anastasia.phone}`, now()),
        ),
      );
      const response = await asParent(handleCreateSignal, "/signals", { text: "Help" });
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "rate_limited" });
      expect(sent()).toEqual([]);
    });

    it("rejects a sixth signal in 24 hours", async () => {
      for (let minute = 1; minute <= 5; minute++) await insertSignal("h1", isoAgo(minute * 60_000), "solved");
      const response = await asParent(handleCreateSignal, "/signals", { text: "One more" });
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "too_many_signals" });
    });
  });

  describe("with several groups", () => {
    beforeEach(async () => {
      await seedHousehold("h2", "Football", anastasia, [theo]);
    });

    it("needs to know which group", async () => {
      const response = await asParent(handleCreateSignal, "/signals", { text: "Who's playing at 10?" });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
      expect(sent()).toEqual([]);
    });

    it("signals only the chosen group, and each group has its own open signal", async () => {
      const football = await asParent(handleCreateSignal, "/signals", { text: "Who's playing at 10?", householdId: "h2" });
      expect(football.status).toBe(201);
      expect(sent()).toEqual([{ to: theo.phone, body: signalWithCodes("Anastasia", "Who's playing at 10?", 1) }]);

      clearFakeOutbox();
      const family = await asParent(handleCreateSignal, "/signals", { text: "Pickup at 5", householdId: "h1" });
      expect(family.status).toBe(201);
      expect(sent()).toEqual([
        { to: grandma.phone, body: signalWithCodes("Anastasia", "Pickup at 5", 1) },
        { to: theo.phone, body: signalWithCodes("Anastasia", "Pickup at 5", 2) },
      ]);

      clearFakeOutbox();
      const solved = await asParent(handleSolveSignal, "/signals/solve", { householdId: "h2" });
      expect(solved.status).toBe(200);
      expect(sent()).toEqual([{ to: theo.phone, body: allClear("Anastasia") }]);
      expect((await signalsOf("h1"))[0]?.status).toBe("open");
    });

    it("refuses a group that isn't theirs", async () => {
      await seedHousehold("h9", "Someone else", { id: "p-zoe", phone: "+447700900104", name: "Zoe" }, [grandma]);

      const response = await asParent(handleCreateSignal, "/signals", { text: "Hello", householdId: "h9" });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "no_household" });
    });
  });

  describe("POST /signals/solve", () => {
    it("closes the signal and sends the all clear", async () => {
      await asParent(handleCreateSignal, "/signals", { text: "Pickup at 5" });
      clearFakeOutbox();

      const response = await asParent(handleSolveSignal, "/signals/solve");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ signal: { status: "solved", solvedAt: expect.any(String) } });
      expect(sent()).toEqual([
        { to: grandma.phone, body: allClear("Anastasia") },
        { to: theo.phone, body: allClear("Anastasia") },
      ]);
    });

    it("says when nothing is open", async () => {
      const response = await asParent(handleSolveSignal, "/signals/solve");
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "no_open_signal" });
    });

    it("needs a session", async () => {
      expect((await call(handleSolveSignal, "/signals/solve")).status).toBe(401);
    });
  });

  describe("POST /signals/sign-off", () => {
    const reply = (from: string, body: string) => call(handleInboundSms, "/sms/inbound", { body: JSON.stringify({ from, body }) });

    it("confirms a helper who offered and keeps the signal open", async () => {
      await asParent(handleCreateSignal, "/signals", { text: "Pickup at 5" });
      await reply(grandma.phone, "Y1");
      clearFakeOutbox();

      const response = await asParent(handleSignOff, "/signals/sign-off", { personId: grandma.id });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ signal: { status: "open", signedOffPersonId: grandma.id } });
      expect(sent()).toEqual([
        { to: grandma.phone, body: youAreOn("Anastasia", 1) },
        { to: theo.phone, body: standDown("Anastasia", "Grandma") },
      ]);
    });

    it("refuses a helper who hasn't offered", async () => {
      await asParent(handleCreateSignal, "/signals", { text: "Pickup at 5" });

      const response = await asParent(handleSignOff, "/signals/sign-off", { personId: theo.id });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "not_accepted" });
    });

    it("says when nothing is open", async () => {
      const response = await asParent(handleSignOff, "/signals/sign-off", { personId: grandma.id });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "no_open_signal" });
    });
  });

  describe("POST /sms/inbound", () => {
    const inbound = (payload: unknown) => call(handleInboundSms, "/sms/inbound", { body: JSON.stringify(payload) });

    it("answers 403 when the provider can't verify the request", async () => {
      const response = await inbound({ nope: true });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden" });
    });

    it("routes the text and answers 200", async () => {
      const response = await inbound({ from: "+44 7700 900100", body: "Pickup at 5", providerId: "in-1" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(await signalsOf("h1")).toMatchObject([{ text: "Pickup at 5", source: "sms" }]);
      expect(sent().map(({ to }) => to)).toEqual([grandma.phone, theo.phone]);
    });

    it("answers 200 to a retry without acting again", async () => {
      await inbound({ from: anastasia.phone, body: "Pickup at 5", providerId: "in-1" });
      clearFakeOutbox();

      expect((await inbound({ from: anastasia.phone, body: "Pickup at 5", providerId: "in-1" })).status).toBe(200);
      expect(sent()).toEqual([]);
    });

    it("solves by SMS just like the button", async () => {
      await asParent(handleCreateSignal, "/signals", { text: "Pickup at 5" });
      clearFakeOutbox();

      await inbound({ from: anastasia.phone, body: "Résolu", providerId: "in-2" });
      expect(await signalsOf("h1")).toMatchObject([{ status: "solved" }]);
      expect(sent()).toEqual([
        { to: grandma.phone, body: allClear("Anastasia") },
        { to: theo.phone, body: allClear("Anastasia") },
      ]);
    });
  });

  describe("scheduled", () => {
    it("closes signals open longer than 24 hours without texting anyone", async () => {
      await insertSignal("h1", isoAgo(25 * 60 * 60 * 1000));

      const ctx = createExecutionContext();
      await handleScheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.now() }), env, ctx);
      await waitOnExecutionContext(ctx);

      expect(await signalsOf("h1")).toMatchObject([{ status: "solved" }]);
      expect(sent()).toEqual([]);
    });

    it("forgets sign-in codes older than an hour", async () => {
      await env.DB.prepare("INSERT INTO verifications (phone, code_hash, expires_at, created_at) VALUES (?, 'x', ?, ?)")
        .bind(stranger, isoAgo(2 * 60 * 60 * 1000), isoAgo(2 * 60 * 60 * 1000))
        .run();

      const ctx = createExecutionContext();
      await handleScheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.now() }), env, ctx);

      expect(await env.DB.prepare("SELECT count(*) AS n FROM verifications").first("n")).toBe(0);
    });

    it("forgets rate limit events older than a day", async () => {
      await env.DB.prepare("INSERT INTO rate_events (key, created_at) VALUES ('old', ?)").bind(isoAgo(25 * 60 * 60 * 1000)).run();

      await handleScheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.now() }), env, createExecutionContext());

      expect(await env.DB.prepare("SELECT count(*) AS n FROM rate_events").first("n")).toBe(0);
    });
  });
});
