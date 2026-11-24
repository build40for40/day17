import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getProvider } from "./provider";

describe("getProvider", () => {
  it("uses the fake by default", () => {
    expect(getProvider(env)).toBeDefined();
    expect(getProvider({ ...env, SMS_PROVIDER: "" })).toBeDefined();
  });

  it("refuses the fake unless the environment allows it, so a deploy never runs on it", () => {
    expect(() => getProvider({ ...env, ALLOW_FAKE_SMS: undefined })).toThrow(/ALLOW_FAKE_SMS/);
    expect(() => getProvider({ ...env, ALLOW_FAKE_SMS: "false" })).toThrow(/ALLOW_FAKE_SMS/);
  });

  it("refuses a provider it doesn't know", () => {
    expect(() => getProvider({ ...env, SMS_PROVIDER: "carrier-pigeon" })).toThrow(/carrier-pigeon/);
  });
});
