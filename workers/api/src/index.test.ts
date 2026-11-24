import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "./index";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`https://build40for40.com${path}`, init);

const routes = [
  ["POST", "/verify/start"],
  ["POST", "/verify/check"],
  ["GET", "/me"],
  ["POST", "/households"],
  ["DELETE", "/households/mine"],
  ["POST", "/signals"],
  ["POST", "/signals/solve"],
  ["POST", "/sms/inbound"],
] as const;

describe("router", () => {
  it.each(routes)("dispatches %s %s to its handler", async (method, path) => {
    const response = await call(`/day17/api/v1${path}`, { method, body: method === "POST" ? "{}" : undefined });
    expect([404, 405]).not.toContain(response.status);
  });

  it.each(routes)("answers 405 with Allow for the wrong method on %s %s", async (method, path) => {
    const response = await call(`/day17/api/v1${path}`, { method: method === "GET" ? "POST" : "GET" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe(method);
    expect(await response.json()).toEqual({ error: "method_not_allowed" });
  });

  it("404s anything else", async () => {
    for (const path of ["/day17/api/v1/nope", "/day17/api/v1/", "/day17/api/v1", "/day17", "/day17/api/v1/me/extra", "/day17/api/v2/me"]) {
      const response = await call(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });

  it("runs the scheduled handler", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.now() }), env, ctx);
    await waitOnExecutionContext(ctx);
  });
});
