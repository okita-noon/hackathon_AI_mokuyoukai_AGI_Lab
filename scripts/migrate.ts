import { readFileSync } from "node:fs";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgresql://commitpay:commitpay@localhost:55432/commitpay_agi_lab";
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(readFileSync("db/schema.sql", "utf8"));
  await c.end();
  console.log("migrated:", url.replace(/:[^:@]*@/, ":***@"));
}
main().catch((e) => { console.error(e); process.exit(1); });
