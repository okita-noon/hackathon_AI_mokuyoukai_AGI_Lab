import { genaiClient } from "./client";
import { env, CONFIDENCE_THRESHOLD } from "../env";
import { JUDGEMENT_SCHEMA, type Judgement } from "./schema";
import { ARBITER_SYSTEM_PROMPT, JUDGE_SYSTEM_PROMPT, sanitizeUserText } from "./prompts";
import { isVideo, resolveMediaParts } from "./media";
import { formatBytes, formatDuration, videoSampling, type MediaMeta } from "../media";

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
  file?: { bytes?: Buffer; storageUri?: string | null; mimeType: string; meta?: MediaMeta | null } | null;
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
  if (i.file?.mimeType) {
    facts.push(`media_mime_type: ${i.file.mimeType}`);
    if (i.file.meta?.size_bytes) facts.push(`media_size: ${formatBytes(i.file.meta.size_bytes)}`);
  }
  if (i.file && isVideo(i.file.mimeType)) {
    // 動画は「どこまでを何コマで見たか」をモデルに明示する。
    // 切り詰めたことを伝えないと、映っていない後半を根拠に未達と判断しかねない。
    const s = videoSampling(i.file.meta);
    const meta = i.file.meta;
    facts.push(`video_duration: ${formatDuration(meta?.duration_sec)}`);
    if (meta?.width && meta?.height) facts.push(`video_resolution: ${meta.width}x${meta.height}`);
    facts.push(`video_sampled_fps: ${s.fps}`);
    facts.push(
      s.truncated
        ? `video_analyzed_range: 先頭 ${s.analyzedSeconds} 秒のみ（動画はこれより長い。解析範囲外の内容を根拠に未達と判断しないこと）`
        : `video_analyzed_range: 全編`,
    );
  }
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
 * 経路の分岐（Vertexのgs:// / Files API / inlineData）は ai/media.ts に集約している。
 * ファイルがあるはずなのに part が空になった場合は「証拠なし」で判定させず例外にする。
 */
async function evidenceParts(i: JudgeInput): Promise<any[]> {
  if (i.evidenceType === "gps" || !i.file) return [];
  const parts = await resolveMediaParts(i.file);
  if (!parts.length) throw new Error("証跡ファイルを判定AIに渡せませんでした。もう一度提出してください。");
  return parts;
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

export async function judgeProof(input: JudgeInput) {
  return call(env.judgeModel, JUDGE_SYSTEM_PROMPT, buildContext(input), await evidenceParts(input));
}

export async function arbitrate(input: JudgeInput & { firstJudgement: Judgement; appealText: string }) {
  const text = `${buildContext(input)}

<first_judgement>
${JSON.stringify(input.firstJudgement)}
</first_judgement>

<user_appeal>
${sanitizeUserText(input.appealText, 2000)}
</user_appeal>`;
  return call(env.arbiterModel, ARBITER_SYSTEM_PROMPT, text, await evidenceParts(input));
}
