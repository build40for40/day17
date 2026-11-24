import { describe, expect, it } from "vitest";
import { error, json, readJson } from "./http";

const post = (body: BodyInit, headers: HeadersInit = { "Content-Type": "application/json" }) =>
  new Request("https://build40for40.com", { method: "POST", body, headers });

describe("json and error", () => {
  it("builds JSON responses", async () => {
    const response = json({ ok: true }, 201);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("builds error responses", async () => {
    const response = error("rate_limited", 429, { "Retry-After": "60" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });
});

describe("readJson", () => {
  it("parses a JSON body", async () => {
    expect(await readJson(post('{"phone":"+447700900001"}'))).toEqual({ ok: true, data: { phone: "+447700900001" } });
  });

  it("accepts a JSON content type with a charset", async () => {
    expect(await readJson(post("{}", { "Content-Type": "application/json; charset=utf-8" }))).toEqual({ ok: true, data: {} });
  });

  it.each<Record<string, string>>([{}, { "Content-Type": "text/plain" }, { "Content-Type": "application/x-www-form-urlencoded" }])(
    "refuses a body sent with headers %j, so a plain form can't post JSON",
    async (headers) => {
      const result = await readJson(post('{"text":"Come now"}', headers));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(415);
        expect(await result.response.json()).toEqual({ error: "unsupported_media_type" });
      }
    },
  );

  it("rejects bad JSON and empty bodies", async () => {
    for (const request of [post("{nope"), new Request("https://build40for40.com", { method: "POST", headers: { "Content-Type": "application/json" } })]) {
      const result = await readJson(request);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(await result.response.json()).toEqual({ error: "invalid_json" });
    }
  });

  it("caps the body size", async () => {
    const result = await readJson(post(JSON.stringify({ text: "x".repeat(100) })), 50);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("caps the body size even when Content-Length lies", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: "x".repeat(100) })));
        controller.close();
      },
    });
    const result = await readJson(post(stream), 50);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});
