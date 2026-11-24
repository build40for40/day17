import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { generateCode, hashCode, parseCode, sameHash } from "./code";

describe("generateCode", () => {
  it("makes 6 digit codes that vary", () => {
    const codes = Array.from({ length: 50 }, generateCode);
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(40);
  });
});

describe("parseCode", () => {
  it("accepts 6 digits, ignoring spaces", () => {
    expect(parseCode("012345")).toBe("012345");
    expect(parseCode(" 123 456 ")).toBe("123456");
  });

  it.each(["", "12345", "1234567", "12345a", "١٢٣٤٥٦"])("rejects %j", (input) => {
    expect(parseCode(input)).toBeNull();
  });
});

describe("hashCode", () => {
  it("is a keyed hash bound to the phone, never the code", async () => {
    const hash = await hashCode(env, "+447700900001", "123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
    expect(await hashCode(env, "+447700900001", "123456")).toBe(hash);
    expect(await hashCode(env, "+447700900002", "123456")).not.toBe(hash);
    expect(await hashCode({ ...env, SESSION_SECRET: "another" }, "+447700900001", "123456")).not.toBe(hash);
  });

  it("refuses to run without a secret", async () => {
    await expect(hashCode({ ...env, SESSION_SECRET: "" }, "+447700900001", "123456")).rejects.toThrow("SESSION_SECRET");
  });
});

describe("sameHash", () => {
  it("compares equal, different and mismatched lengths", () => {
    expect(sameHash("abc", "abc")).toBe(true);
    expect(sameHash("abc", "abd")).toBe(false);
    expect(sameHash("abc", "abcd")).toBe(false);
  });
});
