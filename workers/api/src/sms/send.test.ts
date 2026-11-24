import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { MessageRow } from "../db";
import { clearFakeOutbox, FAKE_FAILING_NUMBER, fakeOutbox } from "./fake";
import { sendAll } from "./send";

describe("sendAll", () => {
  beforeEach(async () => {
    clearFakeOutbox();
    await env.DB.prepare("INSERT OR IGNORE INTO households (id, name) VALUES ('h1', 'The Martins')").run();
  });

  it("sends each message and records every outcome", async () => {
    const outcomes = await sendAll(env, [
      { to: "+447700900001", body: "Need a pickup at 5", kind: "signal", householdId: "h1" },
      { to: FAKE_FAILING_NUMBER, body: "Need a pickup at 5", kind: "signal", householdId: "h1" },
    ]);

    expect(outcomes).toEqual([
      { to: "+447700900001", status: "sent" },
      { to: FAKE_FAILING_NUMBER, status: "failed" },
    ]);
    expect(fakeOutbox()).toEqual([{ to: "+447700900001", body: "Need a pickup at 5" }]);

    const { results } = await env.DB.prepare("SELECT * FROM messages WHERE household_id = 'h1' ORDER BY status DESC").all<MessageRow>();
    expect(results.map(({ phone, direction, kind, status }) => ({ phone, direction, kind, status }))).toEqual([
      { phone: "+447700900001", direction: "out", kind: "signal", status: "sent" },
      { phone: FAKE_FAILING_NUMBER, direction: "out", kind: "signal", status: "failed" },
    ]);
    expect(results[0]?.provider_id).toMatch(/^fake-/);
    expect(results[1]?.provider_id).toBeNull();
  });

  it("sends one text at a time, in order", async () => {
    const sent: string[] = [];
    let inFlight = 0;
    let most = 0;
    const provider = {
      gapMs: 1,
      async send({ to }: { to: string }) {
        most = Math.max(most, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        sent.push(to);
        return { providerId: null };
      },
      async verifyAndParseInbound() {
        return null;
      },
    };
    const numbers = ["+447700900001", "+447700900002", "+447700900003"];

    await sendAll(env, numbers.map((to) => ({ to, body: "Need a pickup at 5", kind: "signal" as const, householdId: "h1" })), provider);

    expect(sent).toEqual(numbers);
    expect(most).toBe(1);
  });

  it("does nothing with no deliveries", async () => {
    expect(await sendAll(env, [])).toEqual([]);
  });
});
