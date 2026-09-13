import { NextResponse } from "next/server";
import { generateJSON, detectEngine, type MediaInput } from "@/lib/llm";
import { OKAN_CHARACTER, JUDGE_PROMPT } from "@/lib/prompts";
import { demoVerdictFor } from "@/lib/demo";
import type { Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  /** 動画そのもの。Geminiのときだけ使う */
  video?: MediaInput;
  /** 画像、または動画から抜き出した連続フレーム */
  frames: MediaInput[];
  promise: { goal: string; evidence: string; deadline: string; penalty: number };
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const engine = detectEngine();

  // Geminiは動画をそのまま解析できる。OpenAIは動画を受け取れないのでフレームで代替する
  const useVideo = engine === "gemini" && !!body.video;
  const media: MediaInput[] = useVideo ? [body.video!] : body.frames;

  const kind = useVideo
    ? "動画そのもの"
    : body.frames.length > 1
      ? `動画から抜き出した連続フレーム${body.frames.length}枚（時系列順）`
      : "写真1枚";

  const user = `${JUDGE_PROMPT}

---- 提出されたもの ----
${kind}

---- 本人が結んだ約束 ----
目標: ${body.promise.goal}
提出すべきエビデンス: ${body.promise.evidence}
期限: ${body.promise.deadline}
守れなかった場合の罰金: ${body.promise.penalty}円`;

  const result = await generateJSON<Verdict>({ system: OKAN_CHARACTER, user, media });

  if (result?.data?.verdict) {
    return NextResponse.json({ ...result.data, engine: result.engine, analyzed: kind });
  }
  const seed = (body.video?.base64.length ?? 0) + (body.frames[0]?.base64.length ?? 0);
  return NextResponse.json({ ...demoVerdictFor(seed), engine: "demo", analyzed: kind });
}
