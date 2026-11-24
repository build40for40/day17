import { CODE_TTL_MS, MAX_SIGNAL_LENGTH, MAX_SIGNALS_PER_DAY } from "contract";
import { MAX_BROADCASTS_PER_DAY } from "../limits";

export const SIGNUP_URL = "https://build40for40.com/day17/";

const CODE_MINUTES = CODE_TTL_MS / 60_000;

const bilingual = (english: string, french: string) => `${english}\n\n${french}`;

export function verificationCode(code: string): string {
  return bilingual(
    `Your bat signal code is ${code}. It works for ${CODE_MINUTES} minutes, so be quick.`,
    `Ton code bat signal est ${code}. Il marche ${CODE_MINUTES} minutes, alors fonce.`,
  );
}

export function welcome(parentName: string, householdName: string): string {
  return bilingual(
    `${parentName} picked you as a helper for ${householdName}. When they need a hand you'll get a text from bat signal. Not for you? Ask ${parentName} to take you off the list.`,
    `${parentName} t'a choisi comme renfort pour ${householdName}. Quand il faut un coup de main, tu recevras un SMS de bat signal. Pas pour toi ? Demande à ${parentName} de te retirer de la liste.`,
  );
}

export function allClear(parentName: string): string {
  return bilingual(
    `All clear: ${parentName} says it's sorted. Thanks for being on call, hero.`,
    `Fin de l'alerte : ${parentName} dit que c'est réglé. Merci d'avoir répondu présent.`,
  );
}

export function nothingOpen(): string {
  return bilingual(
    "Nothing's open right now, so there's nobody to reply to. Stand easy.",
    "Aucune alerte en cours, personne à qui répondre. Repos.",
  );
}

export function signupLink(): string {
  return bilingual(
    `This number only talks to bat signal households. Set yours up at ${SIGNUP_URL}`,
    `Ce numéro ne parle qu'aux foyers bat signal. Crée le tien sur ${SIGNUP_URL}`,
  );
}

export function signalTooLong(): string {
  return bilingual(
    `That's over ${MAX_SIGNAL_LENGTH} characters, so it didn't go out. Try a shorter one.`,
    `Plus de ${MAX_SIGNAL_LENGTH} caractères, donc rien n'est parti. Essaie plus court.`,
  );
}

export function tooManySignals(): string {
  return bilingual(
    `That's ${MAX_SIGNALS_PER_DAY} signals in 24 hours, so this one didn't go out. Give your helpers a breather.`,
    `Ça fait ${MAX_SIGNALS_PER_DAY} alertes en 24 heures, celle-ci n'est pas partie. Laisse souffler tes renforts.`,
  );
}

export function tooManyTexts(): string {
  return bilingual(
    `That's ${MAX_BROADCASTS_PER_DAY} texts to your helpers in 24 hours, so this one didn't go out. Give them a breather.`,
    `Ça fait ${MAX_BROADCASTS_PER_DAY} SMS à tes renforts en 24 heures, celui-ci n'est pas parti. Laisse les souffler.`,
  );
}

export function relay(senderName: string, body: string): string {
  return `${senderName}: ${body}`;
}
