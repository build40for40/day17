import { describe, expect, it } from "vitest";
import { parseReply, parseSignOff } from "./replies";

describe("parseReply", () => {
  it.each([
    ["Y4", { answer: "accepted", code: 4, note: "" }],
    ["y 4", { answer: "accepted", code: 4, note: "" }],
    ["YES4", { answer: "accepted", code: 4, note: "" }],
    ["oui 12", { answer: "accepted", code: 12, note: "" }],
    ["O4", { answer: "accepted", code: 4, note: "" }],
    ["C4", { answer: "pending", code: 4, note: "" }],
    ["checking 4", { answer: "pending", code: 4, note: "" }],
    ["N4", { answer: "rejected", code: 4, note: "" }],
    ["non4", { answer: "rejected", code: 4, note: "" }],
    ["Y4 there in 10", { answer: "accepted", code: 4, note: "there in 10" }],
    ["N4, sorry, at work", { answer: "rejected", code: 4, note: "sorry, at work" }],
    ["  Y  ", { answer: "accepted", code: null, note: "" }],
    ["No.", { answer: "rejected", code: null, note: "" }],
  ] as const)("reads %j", (body, reply) => {
    expect(parseReply(body)).toEqual(reply);
  });

  it.each(["No nappies left", "Yes please someone come", "Can anyone grab Leo at 5?", "OK", "OK 2", "Y4567", "On my way", "Coming", ""])(
    "leaves %j alone",
    (body) => {
      expect(parseReply(body)).toBeNull();
    },
  );
});

describe("parseSignOff", () => {
  it.each([
    ["OK", { slot: null }],
    ["ok 2", { slot: 2 }],
    ["OK2!", { slot: 2 }],
  ] as const)("reads %j", (body, result) => {
    expect(parseSignOff(body)).toEqual(result);
  });

  it.each(["OK thanks everyone", "okay", "Y2", "2"])("leaves %j alone", (body) => {
    expect(parseSignOff(body)).toBeNull();
  });
});
