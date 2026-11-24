import { describe, expect, it } from "vitest";
import { isSolveKeyword, isStopKeyword } from "./keywords";

describe("isSolveKeyword", () => {
  it.each(["SOLVED", "solved", "  Solved  ", "solved!", "RESOLU", "résolu", "RÉSOLU", "Résolu.", "résolu"])("matches %j", (body) => {
    expect(isSolveKeyword(body)).toBe(true);
  });

  it.each(["", "solve", "solved it", "not solved", "resolue", "STOP"])("ignores %j", (body) => {
    expect(isSolveKeyword(body)).toBe(false);
  });
});

describe("isStopKeyword", () => {
  it.each(["STOP", "stop", " Stop ", "STOP."])("matches %j", (body) => {
    expect(isStopKeyword(body)).toBe(true);
  });

  it.each(["", "stop it", "don't stop", "SOLVED"])("ignores %j", (body) => {
    expect(isStopKeyword(body)).toBe(false);
  });
});
