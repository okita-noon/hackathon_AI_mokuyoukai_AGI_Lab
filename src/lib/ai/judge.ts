import { genaiClient } from "./client";
import { env, CONFIDENCE_THRESHOLD } from "../env";
import { JUDGEMENT_SCHEMA, type Judgement } from "./schema";
import { ARBITER_SYSTEM_PROMPT, JUDGE_SYSTEM_PROMPT, sanitizeUserText } from "./prompts";

export type EvidenceType = "photo" | "video" | "audio" | "gps";

export type Geo = { lat: number; lng: number; accuracy_m?: number | null; distance_m?: number | null };

export type JudgeInput = {
  /** 実際に提出された証跡の種類 */
  evidenceType: EvidenceType;
  /** 目標作成時にAIが推奨した種類。提出がこれと違っていても、それだけを理由に不達にはしない */
  recommendedEvidenceType?: EvidenceType | null;
  verificationRule: string;
  deadlineAt: Date;
  submittedAt: Date;
  note?: string | null;
  exif?: Record<string, unknown>;
  duplicateHashMatch: boolean;
  trustScore: number;
  /** 位置情報のみの提出ではファイルがない */
  file?: { bytes?: Buffer; storageUri?: string; mimeType: string } | null;
  geo?: Geo | null;
  targetGeo?: { lat: number; lng: number; radius_m: number; label?: string } | null;
};

export type JudgeResult = Judgement & {
  model: string;
  promptTokens: number | null;
  candidatesTokens: number | null;
  latencyMs: number;
  raw: unknown;
};

const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  photo: "写真",
  video: "動画",
  audio: "音声",
  gps: "位置情報",
};

function buildContext(i: JudgeInput) {
  // ユーザー由来の文字列は必ずタグで囲い、機械的な事実（締切・ハッシュ一致・距離）はタグ外に置く
  const facts = [
    `submitted_evidence_type: ${i.evidenceType}`,
    `recommended_evidence_type: ${i.recommendedEvidenceType ?? "(指定なし)"}`,
    `deadline_at: ${i.deadlineAt.toISOString()}`,
    `submitted_at: ${i.submittedAt.toISOString()}`,
    `exif: ${JSON.stringify(i.exif ?? {})}`,
    `duplicate_hash_match: ${i.duplicateHashMatch}`,
    `user_trust_score: ${i.trustScore}`,
  ];
  if (i.targetGeo) {
    facts.push(`target_location: ${JSON.stringify(i.targetGeo)}`);
  }
  if (i.geo) {
    facts.push(`submitted_location: ${JSON.stringify({ lat: i.geo.lat, lng: i.geo.lng, accuracy_m: i.geo.accuracy_m ?? null })}`);
    if (i.geo.distance_m != null) {
      // 距離はサーバーで計算済み。モデルに緯度経度の計算をさせない
      facts.push(`distance_to_target_m: ${i.geo.distance_m}  (サーバーが計算済み。この値を信頼すること)`);
    }
  }

  return `<verification_rule>
${sanitizeUserText(i.verificationRule, 1000)}
</verification_rule>

<user_note>
${sanitizeUserText(i.note ?? "(なし)", 500)}
</user_note>

<facts>
${facts.join("\n")}
</facts>

提出された${EVIDENCE_LABEL[i.evidenceType]}を判定し、指定のJSONスキーマで出力してください。`;
}

/**
 * 証跡をモデルに渡す part を組み立てる。
 * 動画・音声は数十MBになり得るので Cloud Run のメモリに載せず、Vertex AI に
 * gs:// URI をそのまま渡す（fileData）。画像は inlineData で送る。
 */
function evidenceParts(i: JudgeInput): any[] {
  if (i.evidenceType === "gps" || !i.file) return [];
  const { bytes, storageUri, mimeType } = i.file;
  if (storageUri?.startsWith("gs://") && env.useVertex) {
    return [{ fileData: { fileUri: storageUri, mimeType } }];
  }
  if (!bytes) return [];
  return [{ inlineData: { mimeType, data: bytes.toString("base64") } }];
}

async function call(model: string, systemInstruction: string, text: string, parts: any[]): Promise<JudgeResult> {
  const started = Date.now();
  const res = await genaiClient().models.generateContent({
    model,
    contents: [{ role: "user", parts: [...parts, { text }] }],
    config: {
      systemInstruction,
      temperature: 0, // 判定は再現性を優先
      responseMimeType: "application/json",
      responseSchema: JUDGEMENT_SCHEMA as any,
    },
  });

  const parsed = JSON.parse(res.text ?? "{}") as Judgement;
  const usage = res.usageMetadata;

  return {
    ...normalize(parsed),
    model,
    promptTokens: usage?.promptTokenCount ?? null,
    candidatesTokens: usage?.candidatesTokenCount ?? null,
    latencyMs: Date.now() - started,
    raw: parsed,
  };
}

/**
 * モデル出力を信用しすぎないための後処理。
 * スキーマで型は守られても「確信度0.3でAPPROVED」のような矛盾は起こり得るので、
 * 金銭に触れる判断はアプリ側の閾値で必ず一段落とす。
 */
function normalize(j: Judgement): Judgement {
  const confidence = Math.min(1, Math.max(0, Number(j.confidence_score) || 0));
  let status = j.status;
  if (status !== "UNCERTAIN" && confidence < CONFIDENCE_THRESHOLD) status = "UNCERTAIN";
  const suspicious = j.suspicious_indicators ?? [];
  // 不正シグナルがある状態での APPROVED は自動承認させない
  if (status === "APPROVED" && suspicious.length > 0) status = "UNCERTAIN";
  return {
    status,
    confidence_score: confidence,
    reasoning: j.reasoning ?? "",
    detected_elements: j.detected_elements ?? [],
    suspicious_indicators: suspicious,
    appeal_recommended: status !== "APPROVED" ? true : Boolean(j.appeal_recommended),
  };
}

export function judgeProof(input: JudgeInput) {
  return call(env.judgeModel, JUDGE_SYSTEM_PROMPT, buildContext(input), evidenceParts(input));
}

export function arbitrate(input: JudgeInput & { firstJudgement: Judgement; appealText: string }) {
  const text = `${buildContext(input)}

<first_judgement>
${JSON.stringify(input.firstJudgement)}
</first_judgement>

<user_appeal>
${sanitizeUserText(input.appealText, 2000)}
</user_appeal>`;
  return call(env.arbiterModel, ARBITER_SYSTEM_PROMPT, text, evidenceParts(input));
}
