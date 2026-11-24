import { describe, expect, it } from "vitest";
import { grandma, theo } from "../signals/fixtures";
import { createTextbeltProvider } from "./textbelt";

function fakeTextbelt(reply: unknown, status = 200) {
  const calls: URLSearchParams[] = [];
  const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init?.body as URLSearchParams);
    return Response.json(reply, { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("textbelt provider", () => {
  it("posts the number, message and key, and keeps Textbelt's id", async () => {
    const { calls, fetcher } = fakeTextbelt({ success: true, textId: 123, quotaRemaining: 29 });
    const result = await createTextbeltProvider("fake-key", fetcher).send({ to: grandma.phone, body: "Bat signal: pickup at 5" });

    expect(result).toEqual({ providerId: "textbelt-123" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.get("phone")).toBe(grandma.phone);
    expect(calls[0]!.get("message")).toBe("Bat signal: pickup at 5");
    expect(calls[0]!.get("key")).toBe("fake-key");
  });

  it("throws with Textbelt's reason when it refuses a text", async () => {
    const { fetcher } = fakeTextbelt({ success: false, quotaRemaining: 0, error: "Out of quota" });
    await expect(createTextbeltProvider("fake-key", fetcher).send({ to: grandma.phone, body: "hi" })).rejects.toThrow(/Out of quota/);
  });

  it("throws on an HTTP failure", async () => {
    const { fetcher } = fakeTextbelt({}, 502);
    await expect(createTextbeltProvider("fake-key", fetcher).send({ to: grandma.phone, body: "hi" })).rejects.toThrow(/502/);
  });

  it("takes no inbound texts", async () => {
    const request = new Request("https://build40for40.com/lantern/api/v1/sms/inbound", {
      method: "POST",
      body: JSON.stringify({ from: theo.phone, body: "SOLVED" }),
    });
    expect(await createTextbeltProvider("fake-key").verifyAndParseInbound(request)).toBeNull();
  });
});
