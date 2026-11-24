import { env } from "cloudflare:workers";

const TABLES = ["signal_recipients", "messages", "signals", "memberships", "people", "households", "verifications", "rate_events"];

export async function clearDatabase(): Promise<void> {
  await env.DB.batch(TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
}
