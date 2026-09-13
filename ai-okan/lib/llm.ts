import { GoogleGenAI, type Part } from "@google/genai";
import { toParts, type MediaSource } from "./media";
import type { Engine } from "./types";

const TEXT_TIMEOUT_MS = 25_000;
/** 動画は「アップロード → 前処理 → 解析」と段階があり、テキストより桁で時間がかかる */
const MEDIA_TIMEOUT_MS = 120_000;

let googleClient: GoogleGenAI | null = null;

export function detectEngine(): Engine {
  if (process.env.USE_VERTEX === "1" && process.env.GOOGLE_CLOUD_PROJECT) return "vertex";
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "demo";
}

export type MediaInput = { mimeType: string; base64: string };

type Args = {
  system: string;
  user: string;
  /** 写真や、base64で届いた小さい動画 */
  media?: MediaInput[];
  /** GCSに直接上がった動画など、経路の判断が要るエビデンス */
  sources?: MediaSource[];
  /** Structured Output。指定するとモデルはこの形以外を返せない */
  schema?: Record<string, unknown>;
  /** 判定だけ上位モデルに寄せたいときに指定する（既定は共通モデル） */
  model?: string;
};

/**
 * 失敗を握りつぶさず、engine と error を必ず返す。
 * 「APIキー未設定のデモ応答」と「AIを呼んだが失敗した」を画面で区別するため。
 */
export type Generated<T> = { data: T | null; engine: Engine; error?: string };

export async function generateJSON<T>(args: Args): Promise<Generated<T>> {
  const engine = detectEngine();
  if (engine === "demo") return { data: null, engine };
  const hasMedia = Boolean(args.media?.length || args.sources?.length);
  try {
    const raw = await withTimeout(
      engine === "openai" ? callOpenAI(args) : callGoogle(args, engine),
      hasMedia ? MEDIA_TIMEOUT_MS : TEXT_TIMEOUT_MS,
    );
    const data = parseJSON<T>(raw);
    return data ? { data, engine } : { data: null, engine, error: "AIの返答を読み取れませんでした" };
  } catch (error) {
    console.error("[llm] failed:", error);
    return { data: null, engine, error: humanError(error) };
  }
}

/**
 * APIのエラーは長いJSONで返ってくる。そのまま画面に出しても何をすればいいか分からないので、
 * 対処が分かる一文に置き換える（詳細はサーバーのログに残している）。
 */
function humanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/RESOURCE_EXHAUSTED|"code":\s*429|quota/i.test(message)) {
    return "AIの利用上限に達しました（無料枠は1日20回まで）。しばらく待つか、課金を有効にしたキーで試してください";
  }
  if (/no longer available|"code":\s*404|NOT_FOUND/i.test(message)) {
    return "指定のモデルを使えません。モデル名の設定を確認してください";
  }
  if (/時間内|timed out|deadline/i.test(message)) {
    return "AIの応答が時間内に返りませんでした。もう少し短い動画で試してください";
  }
  if (/PERMISSION_DENIED|API key|UNAUTHENTICATED/i.test(message)) {
    return "AIの認証に失敗しました。APIキーの設定を確認してください";
  }
  return "AIの呼び出しに失敗しました";
}

export function client(engine: "vertex" | "gemini") {
  if (googleClient) return googleClient;
  googleClient = engine === "vertex"
    ? new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
      })
    : new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY });
  return googleClient;
}

async function callGoogle({ system, user, media, sources, schema, model }: Args, engine: "vertex" | "gemini") {
  const parts: Part[] = [];
  // エビデンスはテキストより前に置く。Gemini は動画を先に見たほうが指示に沿いやすい
  for (const source of sources ?? []) parts.push(...(await toParts(client(engine), engine, source)));
  for (const item of media ?? []) parts.push({ inlineData: { mimeType: item.mimeType, data: item.base64 } });
  parts.push({ text: user });

  const response = await client(engine).models.generateContent({
    model: model ?? process.env.DESIGNER_MODEL ?? process.env.GEMINI_MODEL ?? defaultModel(engine),
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      // 判定は毎回同じ動画で同じ結論になってほしいので温度を落とす
      temperature: schema ? 0 : 0.5,
      ...(schema ? { responseSchema: schema } : {}),
    },
  });
  return response.text ?? "";
}

/**
 * エンジンごとの既定モデル。
 *
 * Gemini API キー方式では 2.5 系が新規ユーザーに提供されなくなっており、
 * `gemini-2.5-flash` を指定すると 404（no longer available to new users）になる。
 * Vertex AI 側は既存プロジェクトの設定（JUDGE_MODEL / DESIGNER_MODEL）をそのまま使うため触らない。
 */
function defaultModel(engine: "vertex" | "gemini"): string {
  return engine === "vertex" ? "gemini-2.5-flash" : "gemini-3.6-flash";
}

async function callOpenAI({ system, user, media }: Args): Promise<string> {
  const content: Record<string, unknown>[] = [{ type: "text", text: user }];
  for (const item of media ?? []) {
    if (item.mimeType.startsWith("image/")) {
      content.push({ type: "image_url", image_url: { url: `data:${item.mimeType};base64,${item.base64}` } });
    }
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content }],
      response_format: { type: "json_object" },
      temperature: 0.5,
    }),
  });
  if (!response.ok) throw new Error(`openai ${response.status}: ${await response.text()}`);
  const json = await response.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function withTimeout<T>(request: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("AIの応答が時間内に返りませんでした")), ms);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
