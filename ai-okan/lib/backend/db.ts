import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { AppState } from "@/lib/types";

declare global {
  var __aiOkanPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL ?? "postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab";

export const pool =
  global.__aiOkanPool ?? new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== "production") global.__aiOkanPool = pool;

export async function one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const result = await pool.query(sql, params);
  return (result.rows[0] as T | undefined) ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function anonymousEmail(sessionId: string) {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return `anon-${digest}@ai-okan.invalid`;
}

export async function currentUser(sessionId: string, client: Pool | PoolClient = pool) {
  const result = await client.query(
    `INSERT INTO users (email, display_name)
     VALUES ($1, '匿名デモユーザー')
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id, ai_okan_state`,
    [anonymousEmail(sessionId)],
  );
  return result.rows[0] as { id: string; ai_okan_state: Partial<AppState> | null };
}

export async function saveState(userId: string, state: Partial<AppState>, client: Pool | PoolClient = pool) {
  await client.query(`UPDATE users SET ai_okan_state=$2::jsonb WHERE id=$1`, [userId, JSON.stringify(state)]);
}
