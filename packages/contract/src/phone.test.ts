import { describe, expect, it } from "vitest";
import { isE164, normalisePhone } from "./phone";

describe("normalisePhone", () => {
  it.each([
    ["+447700900123", "+447700900123"],
    ["+44 7700 900123", "+447700900123"],
    ["+44 (0)7700 900123", "+447700900123"],
    ["07700 900123", "+447700900123"],
    ["07700-900-123", "+447700900123"],
    ["  (07700) 900.123  ", "+447700900123"],
    ["0044 7700 900123", "+447700900123"],
    ["+33 6 12 34 56 78", "+33612345678"],
  ])("turns %j into %s", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "7700900123",
    "+0123456789",
    "+1234567",
    "+1234567890123456",
    "+44 7700 900ABC",
    "+44+7700900123",
    "call me",
    "+1 202 555 0123",
    "+882 1234 5678",
    "001 202 555 0123",
  ])("rejects %j", (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});

describe("isE164", () => {
  it("accepts a plus and 8 to 15 digits", () => {
    expect(isE164("+12345678")).toBe(true);
    expect(isE164("+123456789012345")).toBe(true);
    expect(isE164("+1234567")).toBe(false);
    expect(isE164("447700900123")).toBe(false);
  });
});
