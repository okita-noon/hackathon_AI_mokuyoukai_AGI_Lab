import { NextResponse } from "next/server";
import { pool } from "@/lib/backend/db";
import { detectEngine } from "@/lib/llm";
import { storageEnabled } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    // videoUpload=false なら、動画は base64 経路（8MB上限）に落ちる
    return NextResponse.json({
      ok: true,
      database: "connected",
      engine: detectEngine(),
      videoUpload: storageEnabled(),
    });
  } catch (error) {
    console.error("[health]", error);
    return NextResponse.json(
      { ok: false, database: "unavailable", engine: detectEngine(), videoUpload: storageEnabled() },
      { status: 503 },
    );
  }
}
