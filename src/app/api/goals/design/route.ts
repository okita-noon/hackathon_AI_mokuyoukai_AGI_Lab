import { NextResponse } from "next/server";
import { designGoal, type Answer } from "@/lib/ai/designer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 目標設計エージェント。
 * req: { goal: string, answers?: [{ question, answer }] }
 * res: { phase: "QUESTION", questions: [...] } または { phase: "PROPOSAL", proposal: {...} }
 *
 * 状態はサーバーに持たず、クライアントが回答履歴を毎回送る（Cloud Run のインスタンスが
 * 入れ替わってもセッションが壊れない）。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const goal = String(body?.goal ?? "").trim();
  if (goal.length < 2) {
    return NextResponse.json({ error: "目標を入力してください" }, { status: 400 });
  }
  const answers: Answer[] = Array.isArray(body?.answers)
    ? body.answers
        .filter((a: any) => a?.question && a?.answer)
        .slice(0, 6)
        .map((a: any) => ({ question: String(a.question), answer: String(a.answer) }))
    : [];

  try {
    const design = await designGoal(goal, answers);
    return NextResponse.json(design);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "設計に失敗しました" }, { status: 502 });
  }
}
