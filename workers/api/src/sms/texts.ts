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

export type Offer = { name: string; slot: number };
export type Alert = { name: string; code: number };

const replyHint = (code: number) => `Reply Y${code} if you can, C${code} if you're checking, N${code} if you can't.`;

const withNote = (text: string, name: string, note: string) => (note ? `${text} ${relay(name, note)}` : text);

const offerList = (offers: Offer[]) => offers.map((offer) => `${offer.name} (OK ${offer.slot})`).join(", ");

export function signalWithCodes(senderName: string, body: string, code: number): string {
  return `${relay(senderName, body)}\n${replyHint(code)}`;
}

export function updateWithCodes(senderName: string, body: string, code: number): string {
  return `${relay(senderName, body)} (Y${code} / C${code} / N${code})`;
}

export function stillNeeded(senderName: string, body: string, code: number): string {
  return `Still needed. ${relay(senderName, body)}\n${replyHint(code)}`;
}

export function acceptReceived(parentName: string): string {
  return `Got it. ${parentName} knows you can help. Hang tight until they confirm.`;
}

export function checkingReceived(parentName: string, code: number): string {
  return `Got it. ${parentName} knows you're checking. Send Y${code} or N${code} when you know.`;
}

export function rejectReceived(parentName: string): string {
  return `No worries. ${parentName} knows you can't this time.`;
}

export function helperAccepted(helperName: string, slot: number, note = ""): string {
  return withNote(`${helperName} can help. Reply OK ${slot} to confirm them.`, helperName, note);
}

export function helperChecking(helperName: string, note = ""): string {
  return withNote(`${helperName} is checking.`, helperName, note);
}

export function helperRejected(helperName: string, note = ""): string {
  return withNote(`${helperName} can't this time.`, helperName, note);
}

export function youAreOn(parentName: string, code: number): string {
  return `You're on, hero. ${parentName} is counting on you. Reply N${code} if you have to drop out.`;
}

export function standby(parentName: string, chosenName: string): string {
  return `${chosenName} has this one for ${parentName}. Stay warm, you're the backup.`;
}

export function standDown(parentName: string, chosenName: string): string {
  return `${chosenName} is on it for ${parentName}. Stand easy.`;
}

export function droppedOut(helperName: string, offers: Offer[]): string {
  return offers.length > 0
    ? `${helperName} had to drop out. Still offering: ${offerList(offers)}.`
    : `${helperName} had to drop out. We've asked everyone else again.`;
}

export function signOffHelp(offers: Offer[]): string {
  return offers.length > 0
    ? `Nobody by that number has offered. Offers so far: ${offerList(offers)}.`
    : "Nobody has offered yet, so there's no one to confirm.";
}

export function codePrompt(alerts: Alert[], ownsHousehold: boolean): string {
  const codes = alerts.map((alert) => `Y${alert.code}, C${alert.code} or N${alert.code} for ${alert.name}`).join(", ");
  return `Which signal is that for? Reply ${codes}.${ownsHousehold ? " To raise your own signal, send it again." : ""}`;
}

export function pickGroup(): string {
  return `You have more than one group, so pick which one on the page: ${SIGNUP_URL}`;
}
