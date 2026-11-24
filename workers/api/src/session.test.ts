import { env } from "cloudflare:workers";
import { SESSION_TTL_SECONDS } from "contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, createSessionCookie, readSession, requireSession, SESSION_COOKIE } from "./session";

const withCookie = (cookie: string) => new Request("https://build40for40.com/lantern/api/v1/me", { headers: { Cookie: cookie } });
const cookieValue = (setCookie: string) => setCookie.split(";")[0]!;

describe("session", () => {
  afterEach(() => vi.useRealTimers());

  it("sets a hardened 30 day cookie", async () => {
    const setCookie = await createSessionCookie(env, "person-1");
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[\\w-]+\\.[\\w-]+;`));
    for (const attribute of ["Path=/lantern", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${SESSION_TTL_SECONDS}`]) {
      expect(setCookie).toContain(attribute);
    }
  });

  it("reads back the person from its own cookie", async () => {
    const cookie = cookieValue(await createSessionCookie(env, "person-1"));
    expect(await readSession(withCookie(`theme=dark; ${cookie}`), env)).toEqual({ personId: "person-1" });
  });

  it("rejects a missing, tampered or foreign cookie", async () => {
    const cookie = cookieValue(await createSessionCookie(env, "person-1"));
    const [, value] = cookie.split("=");
    const [body, signature] = value!.split(".");
    const forged = btoa(JSON.stringify({ personId: "person-2", exp: 9_999_999_999 })).replace(/=+$/, "");

    expect(await readSession(new Request("https://build40for40.com"), env)).toBeNull();
    expect(await readSession(withCookie(`${SESSION_COOKIE}=${forged}.${signature}`), env)).toBeNull();
    expect(await readSession(withCookie(`${SESSION_COOKIE}=${body}.AAAA`), env)).toBeNull();
    expect(await readSession(withCookie(`${SESSION_COOKIE}=garbage`), env)).toBeNull();
    expect(await readSession(withCookie(cookie), { ...env, SESSION_SECRET: "another-secret" })).toBeNull();
  });

  it("expires after 30 days", async () => {
    const cookie = cookieValue(await createSessionCookie(env, "person-1"));
    vi.useFakeTimers({ now: Date.now() + (SESSION_TTL_SECONDS + 1) * 1000 });
    expect(await readSession(withCookie(cookie), env)).toBeNull();
  });

  it("clears the cookie", () => {
    expect(clearSessionCookie()).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Path=/lantern.*Max-Age=0`));
  });

  it("answers 401 without a session", async () => {
    const result = await requireSession(new Request("https://build40for40.com"), env);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(await (result as Response).json()).toEqual({ error: "unauthorized" });
  });
});
