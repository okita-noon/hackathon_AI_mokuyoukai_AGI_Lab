import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/penalty";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cloud Scheduler から OIDC もしくは共有シークレットで叩かれるスイープワーカー。
 *   gcloud scheduler jobs create http commitpay-tick --schedule="every 5 minutes" ...
 */
export async function POST(req: Request) {
  const auth = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (auth !== env.cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runTick();
  return NextResponse.json({ ok: true, ...report });
}

export const GET = POST; // ローカルでブラウザから叩けるように
