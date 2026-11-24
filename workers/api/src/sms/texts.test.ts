import { describe, expect, it } from "vitest";
import {
  acceptReceived,
  checkingReceived,
  codePrompt,
  pickGroup,
  droppedOut,
  helperAccepted,
  helperChecking,
  helperRejected,
  rejectReceived,
  signOffHelp,
  standby,
  standDown,
  youAreOn,
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
  acceptReceived: acceptReceived("Anastasia"),
  checkingReceived: checkingReceived("Anastasia", 4),
  rejectReceived: rejectReceived("Anastasia"),
  helperAccepted: helperAccepted("Grandma", 2),
  helperChecking: helperChecking("Grandma"),
  helperRejected: helperRejected("Grandma"),
  youAreOn: youAreOn("Anastasia", 4),
  standby: standby("Anastasia", "Grandma"),
  standDown: standDown("Anastasia", "Grandma"),
  droppedOut: droppedOut("Grandma", [{ name: "Theo", slot: 2 }]),
  droppedOutAlone: droppedOut("Grandma", []),
  signOffHelp: signOffHelp([{ name: "Theo", slot: 2 }]),
  signOffHelpEmpty: signOffHelp([]),
  codePrompt: codePrompt([{ name: "Zoe", code: 4 }], true),
  pickGroup: pickGroup(),
};

describe("system texts", () => {
  it.each(Object.entries(systemTexts))("%s has English then French", (_name, text) => {
    const [english, french, ...rest] = text.split("\n\n");
    expect(english).toBeTruthy();
    expect(french).toBeTruthy();
    expect(rest).toEqual([]);
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
