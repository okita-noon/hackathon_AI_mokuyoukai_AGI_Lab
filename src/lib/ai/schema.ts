import { Type } from "@google/genai";

/** ③ Structured Output 定義: モデルにこの形以外を返させない */
export const JUDGEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ["APPROVED", "REJECTED", "UNCERTAIN"] },
    confidence_score: { type: Type.NUMBER },
    reasoning: { type: Type.STRING, description: "判定理由。日本語200字以内。" },
    detected_elements: { type: Type.ARRAY, items: { type: Type.STRING } },
    suspicious_indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
    appeal_recommended: { type: Type.BOOLEAN },
  },
  required: [
    "status",
    "confidence_score",
    "reasoning",
    "detected_elements",
    "suspicious_indicators",
    "appeal_recommended",
  ],
  propertyOrdering: [
    "status",
    "confidence_score",
    "reasoning",
    "detected_elements",
    "suspicious_indicators",
    "appeal_recommended",
  ],
} as const;

export type Judgement = {
  status: "APPROVED" | "REJECTED" | "UNCERTAIN";
  confidence_score: number;
  reasoning: string;
  detected_elements: string[];
  suspicious_indicators: string[];
  appeal_recommended: boolean;
};

/**
 * 目標設計エージェントの出力。
 * phase=QUESTION なら追加ヒアリング、phase=PROPOSAL なら定量的な達成条件の提案。
 */
export const GOAL_DESIGN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    phase: { type: Type.STRING, enum: ["QUESTION", "PROPOSAL"] },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING, description: "ユーザーへの質問。1文。" },
          why: { type: Type.STRING, description: "なぜ聞くのか。20字以内。" },
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "タップで選べる回答候補を2〜4個。",
          },
        },
        required: ["id", "text", "why", "suggestions"],
      },
    },
    proposal: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        verification_rule: { type: Type.STRING, description: "判定AIがそのまま使う達成条件。" },
        checklist: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "判定時に1つずつ照合される観測可能な条件。",
        },
        evidence_type: { type: Type.STRING, enum: ["photo", "screenshot", "video"] },
        suggested_penalty_amount: { type: Type.NUMBER },
        rationale: { type: Type.STRING, description: "なぜこの条件にしたか。80字以内。" },
      },
      required: ["title", "verification_rule", "checklist", "evidence_type", "suggested_penalty_amount", "rationale"],
    },
  },
  required: ["phase"],
} as const;

export type GoalDesign = {
  phase: "QUESTION" | "PROPOSAL";
  questions?: { id: string; text: string; why: string; suggestions: string[] }[];
  proposal?: {
    title: string;
    verification_rule: string;
    checklist: string[];
    evidence_type: "photo" | "screenshot" | "video";
    suggested_penalty_amount: number;
    rationale: string;
  };
};
