import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { passesTurnstile } from "./turnstile";

const withSecret = { ...env, TURNSTILE_SECRET: "turnstile-secret" };

describe("passesTurnstile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("skips the check when no secret is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await passesTurnstile(env, undefined, null)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails without a token once a secret is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await passesTurnstile(withSecret, undefined, null)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the secret, token and IP to siteverify", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: true }));
    expect(await passesTurnstile(withSecret, "token-1", "192.0.2.1")).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = init?.body as FormData;
    expect([form.get("secret"), form.get("response"), form.get("remoteip")]).toEqual(["turnstile-secret", "token-1", "192.0.2.1"]);
  });

  it("fails when siteverify says no, errors or is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce(Response.json({ success: false }));
    expect(await passesTurnstile(withSecret, "token-1", null)).toBe(false);

    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    expect(await passesTurnstile(withSecret, "token-1", null)).toBe(false);

    fetchSpy.mockRejectedValueOnce(new Error("offline"));
    expect(await passesTurnstile(withSecret, "token-1", null)).toBe(false);
  });
});
