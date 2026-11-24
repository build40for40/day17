import { describe, expect, it } from "vitest";
import {
  allClear,
  nothingOpen,
  relay,
  signalTooLong,
  signupLink,
  SIGNUP_URL,
  tooManySignals,
  tooManyTexts,
  verificationCode,
  welcome,
} from "./texts";

const systemTexts = {
  verificationCode: verificationCode("123456"),
  welcome: welcome("Anastasia", "The Martins"),
  allClear: allClear("Anastasia"),
  nothingOpen: nothingOpen(),
  signupLink: signupLink(),
  signalTooLong: signalTooLong(),
  tooManySignals: tooManySignals(),
  tooManyTexts: tooManyTexts(),
};

describe("system texts", () => {
  it.each(Object.entries(systemTexts))("%s is one English paragraph in plain SMS characters", (_name, text) => {
    expect(text).toBeTruthy();
    expect(text).not.toContain("\n");
    // Anything outside this set makes a text cost twice as many credits.
    expect(text).toMatch(/^[A-Za-z0-9 .,:;!?'"()\/&%+@#*=<>_-]+$/);
  });

  it.each(Object.entries(systemTexts))("%s has no emoji and no mid sentence dashes", (_name, text) => {
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(/[–—]| - /);
  });

  it("fills in the details", () => {
    expect(systemTexts.verificationCode).toContain("123456");
    expect(systemTexts.welcome).toContain("The Martins");
    expect(systemTexts.allClear).toContain("Anastasia");
    expect(systemTexts.signupLink).toContain(SIGNUP_URL);
  });

  it("relays a message exactly as written", () => {
    expect(relay("Grandma", "On my way, 10 min")).toBe("Grandma: On my way, 10 min");
  });
});
