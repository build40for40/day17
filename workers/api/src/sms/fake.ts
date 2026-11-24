import { normalisePhone } from "contract";
import type { InboundSms, OutboundSms, SmsProvider } from "./provider";

export const FAKE_FAILING_NUMBER = "+447700900999";

const OUTBOX_SIZE = 200;
const outbox: OutboundSms[] = [];

export function fakeOutbox(): readonly OutboundSms[] {
  return outbox;
}

export function clearFakeOutbox(): void {
  outbox.length = 0;
}

export function createFakeProvider(): SmsProvider {
  return {
    async send({ to, body }) {
      if (to === FAKE_FAILING_NUMBER) throw new Error(`Fake SMS to ${to} failed`);
      console.log(`[fake sms] to ${to}: ${body}`);
      outbox.push({ to, body });
      if (outbox.length > OUTBOX_SIZE) outbox.shift();
      return { providerId: `fake-${crypto.randomUUID()}` };
    },

    async verifyAndParseInbound(request) {
      const payload: unknown = await request.json().catch(() => null);
      if (!isRecord(payload)) return null;
      const { from, body, providerId } = payload;
      if (typeof from !== "string" || typeof body !== "string") return null;
      const phone = normalisePhone(from);
      if (!phone) return null;
      const id = typeof providerId === "string" && providerId ? providerId : `fake-${crypto.randomUUID()}`;
      return { from: phone, body, providerId: id } satisfies InboundSms;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
