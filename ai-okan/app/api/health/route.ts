import { NextResponse } from "next/server";
import { pool } from "@/lib/backend/db";
import { detectEngine } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: "connected", engine: detectEngine() });
  } catch (error) {
    console.error("[health]", error);
    return NextResponse.json({ ok: false, database: "unavailable", engine: detectEngine() }, { status: 503 });
  }
}
