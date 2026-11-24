import type { OutboundSms, SmsProvider } from "./provider";

// Textbelt (https://textbelt.com) sends one text per HTTP call, from a shared pool of numbers.
// It can't receive texts outside the US, so nothing ever arrives on the inbound webhook,
// and it blocks texts with links until the key is whitelisted.
const TEXTBELT_URL = "https://textbelt.com/text";

type TextbeltResponse = { success: boolean; textId?: string | number; error?: string };

export function createTextbeltProvider(key: string, fetcher: typeof fetch = fetch): SmsProvider {
  return {
    async send({ to, body }: OutboundSms) {
      const response = await fetcher(TEXTBELT_URL, {
        method: "POST",
        body: new URLSearchParams({ phone: to, message: body, key }),
      });
      if (!response.ok) throw new Error(`Textbelt answered ${response.status} for ${to}`);

      const result = await response.json<TextbeltResponse>();
      if (!result.success) throw new Error(`Textbelt refused the text to ${to}: ${result.error ?? "no reason given"}`);
      return { providerId: result.textId === undefined ? null : `textbelt-${result.textId}` };
    },

    async verifyAndParseInbound() {
      return null;
    },
  };
}
