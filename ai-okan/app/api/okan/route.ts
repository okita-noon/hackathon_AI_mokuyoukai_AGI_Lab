import { NextResponse } from "next/server";
import pastSelf from "@/data/past-self.json";
import { generateJSON, detectEngine } from "@/lib/llm";
import { OKAN_CHARACTER, PROFILE_PROMPT, PROMISE_PROMPT, SCOLD_PROMPT } from "@/lib/prompts";
import { demoProfile, demoPromiseReply, demoScold } from "@/lib/demo";
import type { Profile, PastSelf } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  mode: "profile" | "promise" | "scold";
  extra?: string;
  promise?: { goal: string; deadline: string; evidence: string; penalty: number };
};

function flatten(data: PastSelf, extra?: string) {
  const lines = data.sources.flatMap((s) =>
    s.items.map((i) => `[${s.label}] ${i.date} ${i.text}`),
  );
  if (extra?.trim()) lines.push(`[本人が追加した情報] ${extra.trim()}`);
  return lines.join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (body.mode === "profile") {
    const user = `${PROFILE_PROMPT}\n\n---- 過去データ ----\n${flatten(pastSelf as PastSelf, body.extra)}`;
    const result = await generateJSON<Profile>({ system: OKAN_CHARACTER, user });
    return NextResponse.json({
      profile: result?.data ?? demoProfile,
      engine: result?.engine ?? "demo",
    });
  }

  if (body.mode === "promise") {
    const p = body.promise;
    const user = `${PROMISE_PROMPT}

---- 本人の宣言 ----
目標: ${p?.goal}
期限: ${p?.deadline}
エビデンス: ${p?.evidence}
罰金: ${p?.penalty}円

---- 参考: 本人の過去 ----
${flatten(pastSelf as PastSelf)}`;
    const result = await generateJSON<{ okan: string }>({ system: OKAN_CHARACTER, user });
    return NextResponse.json({
      okan: result?.data?.okan ?? demoPromiseReply,
      engine: result?.engine ?? "demo",
    });
  }

  const p = body.promise;
  const user = `${SCOLD_PROMPT}

---- 果たせなかった約束 ----
目標: ${p?.goal}
期限: ${p?.deadline}
罰金: ${p?.penalty}円

---- 本人の過去の挫折歴 ----
${flatten(pastSelf as PastSelf)}`;
  const result = await generateJSON<{ okan: string }>({ system: OKAN_CHARACTER, user });
  return NextResponse.json({
    okan: result?.data?.okan ?? demoScold,
    engine: result?.engine ?? "demo",
  });
}

export async function GET() {
  return NextResponse.json({ engine: detectEngine() });
}
