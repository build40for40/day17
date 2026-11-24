import { newId, type MessageKind, type MessageStatus } from "../db";
import { getProvider, type SendResult, type SmsProvider } from "./provider";

export type Delivery = {
  to: string;
  body: string;
  kind: MessageKind;
  householdId: string | null;
  signalId?: string | null;
  personId?: string | null;
};

export type DeliveryOutcome = { to: string; status: Extract<MessageStatus, "sent" | "failed"> };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendInTurn(provider: SmsProvider, deliveries: Delivery[]): Promise<PromiseSettledResult<SendResult>[]> {
  const results: PromiseSettledResult<SendResult>[] = [];
  for (const [index, delivery] of deliveries.entries()) {
    if (index > 0 && provider.gapMs) await pause(provider.gapMs);
    try {
      results.push({ status: "fulfilled", value: await provider.send({ to: delivery.to, body: delivery.body }) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
}

export async function sendAll(env: Env, deliveries: Delivery[], provider: SmsProvider = getProvider(env)): Promise<DeliveryOutcome[]> {
  const results = await sendInTurn(provider, deliveries);

  const outcomes = deliveries.map((delivery, index): DeliveryOutcome & { providerId: string | null } => {
    const result = results[index]!;
    if (result.status === "rejected") console.error(`SMS to ${delivery.to} failed`, result.reason);
    return result.status === "fulfilled"
      ? { to: delivery.to, status: "sent", providerId: result.value.providerId }
      : { to: delivery.to, status: "failed", providerId: null };
  });

  if (deliveries.length > 0) {
    const insert = env.DB.prepare(
      `INSERT INTO messages (id, household_id, signal_id, person_id, phone, direction, kind, body, provider_id, status)
       VALUES (?, ?, ?, ?, ?, 'out', ?, ?, ?, ?)`,
    );
    await env.DB.batch(
      deliveries.map((delivery, index) => {
        const outcome = outcomes[index]!;
        return insert.bind(
          newId(),
          delivery.householdId,
          delivery.signalId ?? null,
          delivery.personId ?? null,
          delivery.to,
          delivery.kind,
          delivery.body,
          outcome.providerId,
          outcome.status,
        );
      }),
    );
  }

  return outcomes.map(({ to, status }) => ({ to, status }));
}
