import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, MAX_CODES_PER_HOUR } from "contract";
import { isoAgo, isoFromNow, newId, now, type VerificationRow } from "../db";

export const RATE_WINDOW_MS = 60 * 60 * 1000;

export async function pruneCodes(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM verifications WHERE created_at < ?").bind(isoAgo(RATE_WINDOW_MS)).run();
}

export async function issueCode(db: D1Database, phone: string, codeHash: string): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO verifications (phone, code_hash, expires_at, created_at)
       SELECT ?1, ?2, ?3, ?4
       WHERE (SELECT COUNT(*) FROM verifications WHERE phone = ?1 AND created_at >= ?5) < ?6`,
    )
    .bind(phone, codeHash, isoFromNow(CODE_TTL_MS), now(), isoAgo(RATE_WINDOW_MS), MAX_CODES_PER_HOUR)
    .run();
  return result.meta.changes === 1;
}

export async function latestCode(db: D1Database, phone: string): Promise<VerificationRow | null> {
  return db.prepare("SELECT * FROM verifications WHERE phone = ? ORDER BY id DESC LIMIT 1").bind(phone).first<VerificationRow>();
}

export async function takeAttempt(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare("UPDATE verifications SET attempts = attempts + 1 WHERE id = ? AND attempts < ?")
    .bind(id, MAX_CODE_ATTEMPTS)
    .run();
  return result.meta.changes === 1;
}

export async function spendCode(db: D1Database, id: number): Promise<boolean> {
  const at = now();
  const result = await db.prepare("UPDATE verifications SET expires_at = ?1 WHERE id = ?2 AND expires_at > ?1").bind(at, id).run();
  return result.meta.changes === 1;
}

export async function upsertPerson(db: D1Database, phone: string): Promise<string> {
  const row = await db
    .prepare("INSERT INTO people (id, phone) VALUES (?, ?) ON CONFLICT (phone) DO UPDATE SET phone = excluded.phone RETURNING id")
    .bind(newId(), phone)
    .first<{ id: string }>();
  if (!row) throw new Error("Upserting a person returned no row");
  return row.id;
}
