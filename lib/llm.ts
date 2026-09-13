import type { Engine } from "./types";

const TIMEOUT_MS = 25_000;

export function detectEngine(): Engine {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "demo";
}

export type ImageInput = { mimeType: string; base64: string };

type Args = {
  system: string;
  user: string;
  image?: ImageInput;
};

/**
 * JSONを返させる共通入口。
 * 失敗・タイムアウト・キー未設定はすべて null を返し、呼び出し側がデモ応答に落とす。
 * デモ本番でAPIが落ちても画面が止まらないようにするための設計。
 */
export async function generateJSON<T>(args: Args): Promise<{ data: T; engine: Engine } | null> {
  const engine = detectEngine();
  if (engine === "demo") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const raw =
      engine === "gemini"
        ? await callGemini(args, controller.signal)
        : await callOpenAI(args, controller.signal);
    const data = parseJSON<T>(raw);
    return data ? { data, engine } : null;
  } catch (e) {
    console.error("[llm] failed:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini({ system, user, image }: Args, signal: AbortSignal): Promise<string> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const parts: Record<string, unknown>[] = [{ text: user }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 1 },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

async function callOpenAI({ system, user, image }: Args, signal: AbortSignal): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const content: Record<string, unknown>[] = [{ type: "text", text: user }];
  if (image) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 1,
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

/** モデルが```json で包んできても拾えるようにする */
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
