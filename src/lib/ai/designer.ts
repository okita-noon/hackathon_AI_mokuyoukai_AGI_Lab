import { genaiClient } from "./client";
import { env } from "../env";
import { GOAL_DESIGN_SCHEMA, type GoalDesign } from "./schema";
import { GOAL_DESIGNER_SYSTEM_PROMPT, sanitizeUserText } from "./prompts";

export type Answer = { question: string; answer: string };

export async function designGoal(goal: string, answers: Answer[]): Promise<GoalDesign & { model: string }> {
  const answerBlock = answers.length
    ? answers.map((a, i) => `${i + 1}. Q: ${sanitizeUserText(a.question, 200)}\n   A: ${sanitizeUserText(a.answer, 300)}`).join("\n")
    : "(まだ回答なし)";

  const res = await genaiClient().models.generateContent({
    model: env.designerModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `<user_goal>
${sanitizeUserText(goal, 300)}
</user_goal>

<answers>
${answerBlock}
</answers>

<state>
answers_count: ${answers.length}
</state>`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: GOAL_DESIGNER_SYSTEM_PROMPT,
      temperature: 0.4, // 質問の切り口には多少の幅がほしい
      responseMimeType: "application/json",
      responseSchema: GOAL_DESIGN_SCHEMA as any,
    },
  });

  const parsed = JSON.parse(res.text ?? "{}") as GoalDesign;

  // 3問答えたのに質問を返してくる場合があるため、アプリ側で打ち切る
  if (parsed.phase === "QUESTION" && answers.length >= 3 && !parsed.proposal) {
    return { ...parsed, model: env.designerModel };
  }
  return { ...parsed, model: env.designerModel };
}
