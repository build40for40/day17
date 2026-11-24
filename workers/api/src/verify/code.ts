import { CODE_LENGTH } from "contract";

const encoder = new TextEncoder();
const CODE_SPACE = 10 ** CODE_LENGTH;
const UNBIASED_LIMIT = Math.floor(2 ** 32 / CODE_SPACE) * CODE_SPACE;

export function generateCode(): string {
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < UNBIASED_LIMIT) return String(value % CODE_SPACE).padStart(CODE_LENGTH, "0");
  }
}

export function parseCode(input: string): string | null {
  const code = input.replace(/\s/g, "");
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code) ? code : null;
}

export async function hashCode(env: Env, phone: string, code: string): Promise<string> {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`verify:${phone}:${code}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sameHash(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right);
}
