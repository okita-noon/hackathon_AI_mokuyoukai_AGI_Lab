import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/llm";
import { OKAN_CHARACTER, JUDGE_PROMPT } from "@/lib/prompts";
import { demoVerdictFor } from "@/lib/demo";
import type { Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  mimeType: string;
  base64: string;
  promise: { goal: string; evidence: string; deadline: string; penalty: number };
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  const user = `${JUDGE_PROMPT}

---- 本人が結んだ約束 ----
目標: ${body.promise.goal}
提出すべきエビデンス: ${body.promise.evidence}
期限: ${body.promise.deadline}
守れなかった場合の罰金: ${body.promise.penalty}円`;

  const result = await generateJSON<Verdict>({
    system: OKAN_CHARACTER,
    user,
    image: { mimeType: body.mimeType, base64: body.base64 },
  });

  if (result?.data?.verdict) {
    return NextResponse.json({ ...result.data, engine: result.engine });
  }
  return NextResponse.json({ ...demoVerdictFor(body.base64.length), engine: "demo" });
}
