import { createFakeProvider } from "./fake";
import { createTextbeltProvider } from "./textbelt";

export type OutboundSms = { to: string; body: string };
export type SendResult = { providerId: string | null };
export type InboundSms = { from: string; body: string; providerId: string };

export interface SmsProvider {
  gapMs?: number;
  send(message: OutboundSms): Promise<SendResult>;
  verifyAndParseInbound(request: Request): Promise<InboundSms | null>;
}

export function getProvider(env: Env): SmsProvider {
  switch (env.SMS_PROVIDER || "fake") {
    case "fake":
      if (env.ALLOW_FAKE_SMS !== "true") throw new Error("The fake SMS provider only runs where ALLOW_FAKE_SMS is true");
      return createFakeProvider();
    case "textbelt":
      if (!env.TEXTBELT_KEY) throw new Error("The Textbelt SMS provider needs the TEXTBELT_KEY secret");
      return createTextbeltProvider(env.TEXTBELT_KEY);
    default:
      throw new Error(`Unknown SMS_PROVIDER "${env.SMS_PROVIDER}"`);
  }
}
