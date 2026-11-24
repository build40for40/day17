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
    `${parentName} picked you as a helper for ${householdName}. When they need a hand you'll get a text from this number. Reply STOP to opt out.`,
    `${parentName} t'a choisi comme renfort pour ${householdName}. Quand il faut un coup de main, tu recevras un SMS de ce numéro. Réponds STOP pour arrêter.`,
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

export type Offer = { name: string; slot: number };
export type Alert = { name: string; code: number };

const replyHint = (code: number) =>
  bilingual(
    `Reply Y${code} if you can, C${code} if you're checking, N${code} if you can't.`,
    `Réponds Y${code} si tu peux, C${code} si tu regardes, N${code} si tu ne peux pas.`,
  );

const withNote = (text: string, name: string, note: string) => (note ? `${text}\n\n${relay(name, note)}` : text);

const offerList = (offers: Offer[]) => offers.map((offer) => `${offer.name} (OK ${offer.slot})`).join(", ");

export function signalWithCodes(senderName: string, body: string, code: number): string {
  return `${relay(senderName, body)}\n\n${replyHint(code)}`;
}

export function updateWithCodes(senderName: string, body: string, code: number): string {
  return `${relay(senderName, body)} (Y${code} / C${code} / N${code})`;
}

export function stillNeeded(senderName: string, body: string, code: number): string {
  return `Still needed. ${relay(senderName, body)}\n\n${replyHint(code)}`;
}

export function acceptReceived(parentName: string): string {
  return bilingual(
    `Got it. ${parentName} knows you can help. Hang tight until they confirm.`,
    `Bien reçu. ${parentName} sait que tu peux aider. Attends sa confirmation.`,
  );
}

export function checkingReceived(parentName: string, code: number): string {
  return bilingual(
    `Got it. ${parentName} knows you're checking. Send Y${code} or N${code} when you know.`,
    `Bien reçu. ${parentName} sait que tu regardes. Envoie Y${code} ou N${code} quand tu sais.`,
  );
}

export function rejectReceived(parentName: string): string {
  return bilingual(
    `No worries. ${parentName} knows you can't this time.`,
    `Pas de souci. ${parentName} sait que tu ne peux pas cette fois.`,
  );
}

export function helperAccepted(helperName: string, slot: number, note = ""): string {
  return withNote(
    bilingual(
      `${helperName} can help. Reply OK ${slot} to confirm them.`,
      `${helperName} peut aider. Réponds OK ${slot} pour confirmer.`,
    ),
    helperName,
    note,
  );
}

export function helperChecking(helperName: string, note = ""): string {
  return withNote(bilingual(`${helperName} is checking.`, `${helperName} regarde si c'est possible.`), helperName, note);
}

export function helperRejected(helperName: string, note = ""): string {
  return withNote(bilingual(`${helperName} can't this time.`, `${helperName} ne peut pas cette fois.`), helperName, note);
}

export function youAreOn(parentName: string, code: number): string {
  return bilingual(
    `You're on, hero. ${parentName} is counting on you. Reply N${code} if you have to drop out.`,
    `C'est toi, héros. ${parentName} compte sur toi. Réponds N${code} si tu dois lâcher.`,
  );
}

export function standby(parentName: string, chosenName: string): string {
  return bilingual(
    `${chosenName} has this one for ${parentName}. Stay warm, you're the backup.`,
    `${chosenName} s'en occupe pour ${parentName}. Reste dispo, tu es le plan B.`,
  );
}

export function standDown(parentName: string, chosenName: string): string {
  return bilingual(`${chosenName} is on it for ${parentName}. Stand easy.`, `${chosenName} s'en occupe pour ${parentName}. Repos.`);
}

export function droppedOut(helperName: string, offers: Offer[]): string {
  return offers.length > 0
    ? bilingual(
        `${helperName} had to drop out. Still offering: ${offerList(offers)}.`,
        `${helperName} a dû lâcher. Toujours partants : ${offerList(offers)}.`,
      )
    : bilingual(
        `${helperName} had to drop out. We've asked everyone else again.`,
        `${helperName} a dû lâcher. On a relancé tout le monde.`,
      );
}

export function signOffHelp(offers: Offer[]): string {
  return offers.length > 0
    ? bilingual(
        `Nobody by that number has offered. Offers so far: ${offerList(offers)}.`,
        `Personne à ce numéro ne s'est proposé. Partants pour l'instant : ${offerList(offers)}.`,
      )
    : bilingual("Nobody has offered yet, so there's no one to confirm.", "Personne ne s'est encore proposé, donc personne à confirmer.");
}

export function codePrompt(alerts: Alert[], ownsHousehold: boolean): string {
  const english = alerts.map((alert) => `Y${alert.code}, C${alert.code} or N${alert.code} for ${alert.name}`).join(", ");
  const french = alerts.map((alert) => `Y${alert.code}, C${alert.code} ou N${alert.code} pour ${alert.name}`).join(", ");
  return bilingual(
    `Which signal is that for? Reply ${english}.${ownsHousehold ? " To raise your own signal, send it again." : ""}`,
    `C'est pour quelle alerte ? Réponds ${french}.${ownsHousehold ? " Pour lancer la tienne, renvoie ton message." : ""}`,
  );
}

export function pickGroup(): string {
  return bilingual(
    `You have more than one group, so pick which one on the page: ${SIGNUP_URL}`,
    `Tu as plusieurs groupes, alors choisis lequel sur la page : ${SIGNUP_URL}`,
  );
}
