import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { matchGroups } from "./match";

const groups = [
  { id: "h1", name: "Léa", description: "School runs and pickups for Léa" },
  { id: "h2", name: "Football", description: "Sunday football team parents" },
];

function fakeTypesafe(reply: unknown, status = 200) {
  const calls: { headers: Headers; body: { model: string; state: unknown; questions: Record<string, { type: string; instructions: { group: unknown } }> } }[] = [];
  const fetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ headers: new Headers(init?.headers), body: JSON.parse(init?.body as string) });
    return Response.json(reply, { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("matchGroups", () => {
  it("asks one question per group about the message and reads each probability", async () => {
    const { calls, fetcher } = fakeTypesafe({ answers: { h1: { type: "noul", noul: 0.93 }, h2: { type: "noul", noul: 0.04 } } });

    const scores = await matchGroups(env, "Can anyone grab Léa at 5?", groups, fetcher);

    expect([...scores]).toEqual([["h1", 0.93], ["h2", 0.04]]);
    expect(calls[0]!.headers.get("Authorization")).toBe(`Bearer ${env.TYPESAFE_API_KEY}`);
    expect(calls[0]!.body.state).toEqual({ message: "Can anyone grab Léa at 5?" });
    expect(Object.keys(calls[0]!.body.questions)).toEqual(["h1", "h2"]);
    expect(calls[0]!.body.questions.h2!.instructions.group).toEqual({ name: "Football", description: "Sunday football team parents" });
  });

  it("throws when TypeSafe fails, so a failure is never read as no match", async () => {
    const { fetcher } = fakeTypesafe({ detail: "nope" }, 529);
    await expect(matchGroups(env, "Help", groups, fetcher)).rejects.toThrow(/529/);
  });

  it("throws when an answer is missing", async () => {
    const { fetcher } = fakeTypesafe({ answers: { h1: { type: "noul", noul: 0.9 } } });
    await expect(matchGroups(env, "Help", groups, fetcher)).rejects.toThrow(/h2/);
  });

  it("throws without a key", async () => {
    const { calls, fetcher } = fakeTypesafe({});
    await expect(matchGroups({ ...env, TYPESAFE_API_KEY: undefined }, "Help", groups, fetcher)).rejects.toThrow(/TYPESAFE_API_KEY/);
    expect(calls).toHaveLength(0);
  });
});
