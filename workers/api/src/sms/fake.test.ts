import { beforeEach, describe, expect, it } from "vitest";
import { clearFakeOutbox, createFakeProvider, FAKE_FAILING_NUMBER, fakeOutbox } from "./fake";

const inbound = (payload: unknown) =>
  new Request("https://build40for40.com/day17/api/v1/sms/inbound", { method: "POST", body: JSON.stringify(payload) });

describe("fake provider", () => {
  const provider = createFakeProvider();

  beforeEach(() => clearFakeOutbox());

  it("keeps sent messages in the outbox", async () => {
    const result = await provider.send({ to: "+447700900001", body: "hello" });
    expect(result.providerId).toMatch(/^fake-/);
    expect(fakeOutbox()).toEqual([{ to: "+447700900001", body: "hello" }]);
  });

  it("fails sends to the failing number", async () => {
    await expect(provider.send({ to: FAKE_FAILING_NUMBER, body: "hello" })).rejects.toThrow();
    expect(fakeOutbox()).toEqual([]);
  });

  it("parses a plain JSON inbound message", async () => {
    const message = await provider.verifyAndParseInbound(inbound({ from: "+44 7700 900002", body: "SOLVED", providerId: "abc" }));
    expect(message).toEqual({ from: "+447700900002", body: "SOLVED", providerId: "abc" });
  });

  it("makes up a providerId when there isn't one", async () => {
    const message = await provider.verifyAndParseInbound(inbound({ from: "+447700900002", body: "hi" }));
    expect(message?.providerId).toMatch(/^fake-/);
  });

  it("rejects anything else", async () => {
    expect(await provider.verifyAndParseInbound(inbound({ from: "nope", body: "hi" }))).toBeNull();
    expect(await provider.verifyAndParseInbound(inbound({ from: "+447700900002" }))).toBeNull();
    expect(await provider.verifyAndParseInbound(new Request("https://x.test", { method: "POST", body: "not json" }))).toBeNull();
  });
});
