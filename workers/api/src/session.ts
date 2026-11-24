import { SESSION_TTL_SECONDS } from "contract";
import { error } from "./http";

export const SESSION_COOKIE = "day17_session";
const COOKIE_ATTRIBUTES = "Path=/day17; HttpOnly; Secure; SameSite=Lax";

export type Session = { personId: string };
type Payload = { personId: string; exp: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createSessionCookie(env: Env, personId: string): Promise<string> {
  const payload: Payload = { personId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(env), encoder.encode(body));
  const value = `${body}.${toBase64Url(new Uint8Array(signature))}`;
  return `${SESSION_COOKIE}=${value}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}

export async function readSession(request: Request, env: Env): Promise<Session | null> {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return null;

  const [body, signature, ...rest] = value.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (!signatureBytes || !bodyBytes) return null;

  const valid = await crypto.subtle.verify("HMAC", await signingKey(env), signatureBytes, encoder.encode(body));
  if (!valid) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(bodyBytes));
  } catch {
    return null;
  }
  if (!isPayload(payload) || payload.exp <= Date.now() / 1000) return null;
  return { personId: payload.personId };
}

export async function requireSession(request: Request, env: Env): Promise<Session | Response> {
  return (await readSession(request, env)) ?? error("unauthorized", 401);
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

async function signingKey(env: Env): Promise<CryptoKey> {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function isPayload(value: unknown): value is Payload {
  if (typeof value !== "object" || value === null) return false;
  const { personId, exp } = value as Record<string, unknown>;
  return typeof personId === "string" && personId !== "" && typeof exp === "number";
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
