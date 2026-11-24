import { isoAgo, now } from "./db";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const MAX_CODES_PER_IP_PER_HOUR = 10;
export const MAX_CODES_PER_HOUR_GLOBAL = 500;
export const MAX_BROADCASTS_PER_DAY = 30;
export const MAX_HOUSEHOLDS_PER_DAY = 3;
export const REPLY_COOLDOWN_MS = HOUR_MS;

export const limits = {
  verifyGlobal: () => ({ key: "verify", max: MAX_CODES_PER_HOUR_GLOBAL, windowMs: HOUR_MS }),
  verifyIp: (ip: string) => ({ key: `verify-ip:${ip}`, max: MAX_CODES_PER_IP_PER_HOUR, windowMs: HOUR_MS }),
  broadcast: (phone: string) => ({ key: `broadcast:${phone}`, max: MAX_BROADCASTS_PER_DAY, windowMs: DAY_MS }),
  household: (phone: string) => ({ key: `household:${phone}`, max: MAX_HOUSEHOLDS_PER_DAY, windowMs: DAY_MS }),
  reply: (kind: string, phone: string) => ({ key: `reply:${kind}:${phone}`, max: 1, windowMs: REPLY_COOLDOWN_MS }),
};

export type Limit = ReturnType<(typeof limits)[keyof typeof limits]>;

export async function takeToken(db: D1Database, key: string, max: number, windowMs: number): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO rate_events (key, created_at)
       SELECT ?1, ?2
       WHERE (SELECT COUNT(*) FROM rate_events WHERE key = ?1 AND created_at > ?3) < ?4`,
    )
    .bind(key, now(), isoAgo(windowMs), max)
    .run();
  return result.meta.changes === 1;
}

export function take(db: D1Database, { key, max, windowMs }: Limit): Promise<boolean> {
  return takeToken(db, key, max, windowMs);
}

export async function pruneRateEvents(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM rate_events WHERE created_at < ?").bind(isoAgo(DAY_MS)).run();
}
