import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../test/db";
import { isoAgo } from "./db";
import { pruneRateEvents, takeToken } from "./limits";

const HOUR = 60 * 60 * 1000;
const rows = async () => (await env.DB.prepare("SELECT count(*) AS n FROM rate_events").first<{ n: number }>())!.n;

describe("takeToken", () => {
  beforeEach(clearDatabase);

  it("allows up to the limit within the window, per key", async () => {
    expect(await takeToken(env.DB, "a", 2, HOUR)).toBe(true);
    expect(await takeToken(env.DB, "a", 2, HOUR)).toBe(true);
    expect(await takeToken(env.DB, "a", 2, HOUR)).toBe(false);
    expect(await takeToken(env.DB, "b", 2, HOUR)).toBe(true);
    expect(await rows()).toBe(3);
  });

  it("forgets events older than the window", async () => {
    await env.DB.prepare("INSERT INTO rate_events (key, created_at) VALUES ('a', ?)").bind(isoAgo(2 * HOUR)).run();
    expect(await takeToken(env.DB, "a", 1, HOUR)).toBe(true);
  });
});

describe("pruneRateEvents", () => {
  beforeEach(clearDatabase);

  it("deletes events older than a day", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO rate_events (key, created_at) VALUES ('old', ?)").bind(isoAgo(25 * HOUR)),
      env.DB.prepare("INSERT INTO rate_events (key, created_at) VALUES ('new', ?)").bind(isoAgo(HOUR)),
    ]);
    await pruneRateEvents(env.DB);
    expect(await env.DB.prepare("SELECT key FROM rate_events").all().then((r) => r.results)).toEqual([{ key: "new" }]);
  });
});
