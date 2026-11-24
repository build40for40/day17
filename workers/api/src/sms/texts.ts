import { CODE_TTL_MS, MAX_SIGNAL_LENGTH, MAX_SIGNALS_PER_DAY } from "contract";
import { MAX_BROADCASTS_PER_DAY } from "../limits";

export const SIGNUP_URL = "https://build40for40.com/day17/";

const CODE_MINUTES = CODE_TTL_MS / 60_000;

export function verificationCode(code: string): string {
  return `Your bat signal code is ${code}. It works for ${CODE_MINUTES} minutes, so be quick.`;
}

export function welcome(parentName: string, householdName: string): string {
  return `${parentName} picked you as a helper for ${householdName}. When they need a hand you'll get a text from bat signal. Not for you? Ask them to take you off the list.`;
}

export function allClear(parentName: string): string {
  return `All clear: ${parentName} says it's sorted. Thanks for being on call, hero.`;
}

export function nothingOpen(): string {
  return "Nothing's open right now, so there's nobody to reply to. Stand easy.";
}

export function signupLink(): string {
  return `This number only talks to bat signal households. Set yours up at ${SIGNUP_URL}`;
}

export function signalTooLong(): string {
  return `That's over ${MAX_SIGNAL_LENGTH} characters, so it didn't go out. Try a shorter one.`;
}

export function tooManySignals(): string {
  return `That's ${MAX_SIGNALS_PER_DAY} signals in 24 hours, so this one didn't go out. Give your helpers a breather.`;
}

export function tooManyTexts(): string {
  return `That's ${MAX_BROADCASTS_PER_DAY} texts to your helpers in 24 hours, so this one didn't go out. Give them a breather.`;
}

export function relay(senderName: string, body: string): string {
  return `${senderName}: ${body}`;
}
