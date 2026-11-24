import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { MAX_CODE_ATTEMPTS, MAX_CODES_PER_HOUR } from "contract";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../../test/db";
import { isoAgo, now, type VerificationRow } from "../db";
import { MAX_CODES_PER_HOUR_GLOBAL, MAX_CODES_PER_IP_PER_HOUR } from "../limits";
import type { Handler } from "../http";
import { readSession } from "../session";
import { clearFakeOutbox, fakeOutbox } from "../sms/fake";
import { handleVerifyCheck, handleVerifyStart } from "./routes";

const PHONE = "+447700900201";

const post = (handler: Handler, body: unknown, environment: Env = env, ip = "203.0.113.7") =>
  handler(
    new Request("https://build40for40.com/day17/api/v1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    environment,
    createExecutionContext(),
  );

const start = (phone: string, environment?: Env, ip?: string) => post(handleVerifyStart, { phone }, environment, ip);
const check = (phone: string, code: string) => post(handleVerifyCheck, { phone, code });

function lastCodeSentTo(phone: string): string {
  const message = fakeOutbox().findLast(({ to }) => to === phone);
  const code = message?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code was sent to ${phone}`);
  return code;
}

const wrongCodeFor = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");
const codeRows = () => env.DB.prepare("SELECT * FROM verifications ORDER BY id").all<VerificationRow>().then((r) => r.results);

describe("verify routes", () => {
  beforeEach(async () => {
    await clearDatabase();
    clearFakeOutbox();
  });

  it("texts a code and signs the person in with it", async () => {
    const started = await start("+44 7700 900201");
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ ok: true });

    const response = await check(PHONE, lastCodeSentTo(PHONE));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const person = await env.DB.prepare("SELECT id FROM people WHERE phone = ?").bind(PHONE).first<{ id: string }>();
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    const session = await readSession(new Request("https://build40for40.com/day17/", { headers: { Cookie: cookie } }), env);
    expect(session).toEqual({ personId: person!.id });
  });

  it("signs an existing person back in as themselves", async () => {
    await env.DB.prepare("INSERT INTO people (id, phone, name) VALUES ('p1', ?, 'Anna')").bind(PHONE).run();
    await start(PHONE);
    await check(PHONE, lastCodeSentTo(PHONE));
    const { results } = await env.DB.prepare("SELECT id, name FROM people").all();
    expect(results).toEqual([{ id: "p1", name: "Anna" }]);
  });

  it("stores a hash, never the code", async () => {
    await start(PHONE);
    const code = lastCodeSentTo(PHONE);
    const [row] = await codeRows();
    expect(row!.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.code_hash).not.toContain(code);
    const { results } = await env.DB.prepare("SELECT * FROM messages").all();
    expect(results).toEqual([]);
  });

  it("rejects a wrong code and counts the attempt", async () => {
    await start(PHONE);
    const response = await check(PHONE, wrongCodeFor(lastCodeSentTo(PHONE)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_code" });
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect((await codeRows())[0]!.attempts).toBe(1);
  });

  it("rejects an expired code", async () => {
    await start(PHONE);
    await env.DB.prepare("UPDATE verifications SET expires_at = ?").bind(isoAgo(1000)).run();
    const response = await check(PHONE, lastCodeSentTo(PHONE));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_code" });
  });

  it("rejects a code once it has been used", async () => {
    await start(PHONE);
    const code = lastCodeSentTo(PHONE);
    expect((await check(PHONE, code)).status).toBe(200);
    expect(await (await check(PHONE, code)).json()).toEqual({ error: "invalid_code" });
  });

  it("only accepts the latest code", async () => {
    await start(PHONE);
    const first = lastCodeSentTo(PHONE);
    await start(PHONE);
    const second = lastCodeSentTo(PHONE);
    if (first !== second) expect((await check(PHONE, first)).status).toBe(400);
    expect((await check(PHONE, second)).status).toBe(200);
  });

  it("locks a code after 5 wrong attempts, even for the right code", async () => {
    await start(PHONE);
    const code = lastCodeSentTo(PHONE);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) expect((await check(PHONE, wrongCodeFor(code))).status).toBe(400);

    const response = await check(PHONE, code);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too_many_attempts" });
  });

  it("sends at most 3 codes per phone per hour", async () => {
    for (let i = 0; i < MAX_CODES_PER_HOUR; i++) expect((await start(PHONE)).status).toBe(200);

    const limited = await start(PHONE);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(fakeOutbox()).toHaveLength(MAX_CODES_PER_HOUR);

    await env.DB.prepare("UPDATE verifications SET created_at = ?").bind(isoAgo(61 * 60 * 1000)).run();
    expect((await start(PHONE)).status).toBe(200);
  });

  it("never texts a number that said STOP, and answers the same as for anyone else", async () => {
    await env.DB.prepare("INSERT INTO people (id, phone, opted_out_at) VALUES ('p1', ?, ?)").bind(PHONE, now()).run();
    const response = await start(PHONE);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fakeOutbox()).toEqual([]);
    expect(await codeRows()).toEqual([]);
  });

  it("caps codes per IP address per hour", async () => {
    for (let i = 0; i < MAX_CODES_PER_IP_PER_HOUR; i++) {
      expect((await start(`+4477009004${String(i).padStart(2, "0")}`, env, "198.51.100.1")).status).toBe(200);
    }
    const limited = await start("+447700900499", env, "198.51.100.1");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await start("+447700900499", env, "198.51.100.2")).status).toBe(200);
    expect(fakeOutbox()).toHaveLength(MAX_CODES_PER_IP_PER_HOUR + 1);
  });

  it("caps codes across everyone per hour", async () => {
    await env.DB.batch(
      Array.from({ length: MAX_CODES_PER_HOUR_GLOBAL }, () => env.DB.prepare("INSERT INTO rate_events (key, created_at) VALUES ('verify', ?)").bind(now())),
    );
    const limited = await start(PHONE);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(fakeOutbox()).toEqual([]);
  });

  it.each([{}, { phone: "call me" }, { phone: 447700900201 }, { phone: "7700900201" }, { phone: "+1 202 555 0123" }])("rejects an invalid phone %j", async (body) => {
    const response = await post(handleVerifyStart, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_phone" });
    expect(fakeOutbox()).toEqual([]);
  });

  it("rejects malformed check requests as an invalid code", async () => {
    for (const body of [{}, { phone: PHONE }, { phone: PHONE, code: "12" }, { phone: "nope", code: "123456" }]) {
      const response = await post(handleVerifyCheck, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_code" });
    }
  });

  it("passes on bad JSON errors", async () => {
    expect(await (await post(handleVerifyStart, "{nope")).json()).toEqual({ error: "invalid_json" });
    expect(await (await post(handleVerifyCheck, "{nope")).json()).toEqual({ error: "invalid_json" });
  });

  it("answers the same whether or not the phone is known", async () => {
    await env.DB.prepare("INSERT INTO people (id, phone) VALUES ('p1', ?)").bind(PHONE).run();
    const known = await start(PHONE);
    const unknown = await start("+447700900202");
    expect([known.status, await known.text()]).toEqual([unknown.status, await unknown.text()]);
  });

  it("needs a Turnstile token once a secret is configured", async () => {
    const response = await start(PHONE, { ...env, TURNSTILE_SECRET: "turnstile-secret" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "turnstile_failed" });
    expect(fakeOutbox()).toEqual([]);
    expect(await codeRows()).toEqual([]);
  });
});
