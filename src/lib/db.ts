import { Pool } from "pg";
import { env } from "./env";

// Cloud Run では Cloud SQL コネクタ経由の UNIX ソケット
// (postgresql://user:pass@/db?host=/cloudsql/PROJECT:REGION:INSTANCE) をそのまま DATABASE_URL に入れる
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 5, // Cloud Run のインスタンス数 × max が Cloud SQL の上限を超えないよう小さめに
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** 単一トランザクション。ペナルティ執行のような「取りこぼし＝二重課金」の処理で使う */
export async function tx<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
