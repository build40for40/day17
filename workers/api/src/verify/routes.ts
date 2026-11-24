import { MAX_CODE_ATTEMPTS, normalisePhone, type VerifyCheckResponse, type VerifyStartResponse } from "contract";
import { now } from "../db";
import { error, json, readJson, type Handler } from "../http";
import { limits, take } from "../limits";
import { createSessionCookie } from "../session";
import { getProvider } from "../sms/provider";
import { verificationCode } from "../sms/texts";
import { generateCode, hashCode, parseCode, sameHash } from "./code";
import { issueCode, latestCode, pruneCodes, spendCode, takeAttempt, upsertPerson } from "./store";
import { passesTurnstile } from "./turnstile";

export const handleVerifyStart: Handler = async (request, env) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const { phone: rawPhone, turnstileToken } = fields(body.data);

  const phone = typeof rawPhone === "string" ? normalisePhone(rawPhone) : null;
  if (!phone) return error("invalid_phone", 400);

  const ip = request.headers.get("CF-Connecting-IP");
  const token = typeof turnstileToken === "string" ? turnstileToken : undefined;
  if (!(await passesTurnstile(env, token, ip))) return error("turnstile_failed", 400);

  const optedOut = await env.DB.prepare("SELECT 1 FROM people WHERE phone = ? AND opted_out_at IS NOT NULL").bind(phone).first();
  if (optedOut) return json<VerifyStartResponse>({ ok: true });

  if (!(await take(env.DB, limits.verifyIp(ip ?? "unknown"))) || !(await take(env.DB, limits.verifyGlobal()))) {
    return error("rate_limited", 429);
  }

  await pruneCodes(env.DB);
  const code = generateCode();
  if (!(await issueCode(env.DB, phone, await hashCode(env, phone, code)))) return error("rate_limited", 429);

  await getProvider(env).send({ to: phone, body: verificationCode(code) });
  return json<VerifyStartResponse>({ ok: true });
};

export const handleVerifyCheck: Handler = async (request, env) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const { phone: rawPhone, code: rawCode } = fields(body.data);

  const phone = typeof rawPhone === "string" ? normalisePhone(rawPhone) : null;
  const code = typeof rawCode === "string" ? parseCode(rawCode) : null;
  if (!phone || !code) return error("invalid_code", 400);

  const row = await latestCode(env.DB, phone);
  if (!row || row.expires_at <= now()) return error("invalid_code", 400);
  if (row.attempts >= MAX_CODE_ATTEMPTS || !(await takeAttempt(env.DB, row.id))) return error("too_many_attempts", 429);

  const matches = sameHash(await hashCode(env, phone, code), row.code_hash);
  if (!matches || !(await spendCode(env.DB, row.id))) return error("invalid_code", 400);

  const personId = await upsertPerson(env.DB, phone);
  return json<VerifyCheckResponse>({ ok: true }, { headers: { "Set-Cookie": await createSessionCookie(env, personId) } });
};

function fields(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}
