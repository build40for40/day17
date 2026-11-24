import { env } from "cloudflare:workers";
import { MAX_CODE_ATTEMPTS, MAX_CODES_PER_HOUR } from "contract";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../../test/db";
import { isoAgo } from "../db";
import { issueCode, latestCode, pruneCodes, RATE_WINDOW_MS, spendCode, takeAttempt, upsertPerson } from "./store";

const PHONE = "+447700900101";
const countCodes = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM verifications").first<number>("n")) ?? 0;

describe("verification store", () => {
  beforeEach(clearDatabase);

  it("issues at most 3 codes per phone per hour", async () => {
    for (let i = 0; i < MAX_CODES_PER_HOUR; i++) expect(await issueCode(env.DB, PHONE, `hash-${i}`)).toBe(true);
    expect(await issueCode(env.DB, PHONE, "hash-x")).toBe(false);
    expect(await issueCode(env.DB, "+447700900102", "hash-y")).toBe(true);

    await env.DB.prepare("UPDATE verifications SET created_at = ? WHERE phone = ?").bind(isoAgo(RATE_WINDOW_MS + 1000), PHONE).run();
    expect(await issueCode(env.DB, PHONE, "hash-z")).toBe(true);
  });

  it("reads the latest code for a phone", async () => {
    await issueCode(env.DB, PHONE, "hash-1");
    await issueCode(env.DB, PHONE, "hash-2");
    expect((await latestCode(env.DB, PHONE))?.code_hash).toBe("hash-2");
    expect(await latestCode(env.DB, "+447700900102")).toBeNull();
  });

  it("stops taking attempts at the limit", async () => {
    await issueCode(env.DB, PHONE, "hash-1");
    const { id } = (await latestCode(env.DB, PHONE))!;
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) expect(await takeAttempt(env.DB, id)).toBe(true);
    expect(await takeAttempt(env.DB, id)).toBe(false);
    expect((await latestCode(env.DB, PHONE))?.attempts).toBe(MAX_CODE_ATTEMPTS);
  });

  it("spends a code only once", async () => {
    await issueCode(env.DB, PHONE, "hash-1");
    const { id } = (await latestCode(env.DB, PHONE))!;
    expect(await spendCode(env.DB, id)).toBe(true);
    expect(await spendCode(env.DB, id)).toBe(false);
  });

  it("prunes codes older than the rate window", async () => {
    await issueCode(env.DB, PHONE, "hash-old");
    await env.DB.prepare("UPDATE verifications SET created_at = ?").bind(isoAgo(RATE_WINDOW_MS + 1000)).run();
    await issueCode(env.DB, PHONE, "hash-new");
    await pruneCodes(env.DB);
    expect(await countCodes()).toBe(1);
  });

  it("creates a person once per phone", async () => {
    const id = await upsertPerson(env.DB, PHONE);
    await env.DB.prepare("UPDATE people SET name = 'Anna' WHERE id = ?").bind(id).run();
    expect(await upsertPerson(env.DB, PHONE)).toBe(id);
    expect(await env.DB.prepare("SELECT name FROM people WHERE phone = ?").bind(PHONE).first("name")).toBe("Anna");
  });
});
