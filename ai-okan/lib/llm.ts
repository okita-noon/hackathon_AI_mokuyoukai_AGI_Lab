import { GoogleGenAI } from "@google/genai";
import type { Engine } from "./types";

const TIMEOUT_MS = 25_000;
let googleClient: GoogleGenAI | null = null;

export function detectEngine(): Engine {
  if (process.env.USE_VERTEX === "1" && process.env.GOOGLE_CLOUD_PROJECT) return "vertex";
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "demo";
}

export type MediaInput = { mimeType: string; base64: string };

type Args = { system: string; user: string; media?: MediaInput[] };
export type JSONValidator<T> = (value: unknown) => T | null;

export async function generateJSON<T>(args: Args, validate: JSONValidator<T>): Promise<{ data: T; engine: Engine } | null> {
  const engine = detectEngine();
  if (engine === "demo") return null;
  try {
    const raw = await withTimeout((signal) =>
      engine === "vertex" || engine === "gemini" ? callGoogle(args, engine, signal) : callOpenAI(args, signal),
    );
    const parsed = parseJSON(raw);
    const data = parsed === null ? null : validate(parsed);
    return data ? { data, engine } : null;
  } catch (error) {
    // Provider errors can contain request/response bodies. Keep logs useful without retaining user data or secrets.
    console.error("[llm] request failed", { engine, reason: failureReason(error) });
    return null;
  }
}

function client(engine: "vertex" | "gemini") {
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

async function callGoogle({ system, user, media }: Args, engine: "vertex" | "gemini", abortSignal: AbortSignal) {
  const parts: Record<string, unknown>[] = [{ text: user }];
  for (const item of media ?? []) {
    parts.push({ inlineData: { mimeType: item.mimeType, data: item.base64 } });
  }
  const response = await client(engine).models.generateContent({
    model: process.env.DESIGNER_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.5, abortSignal },
  });
  return response.text ?? "";
}

async function callOpenAI({ system, user, media }: Args, abortSignal: AbortSignal): Promise<string> {
  const content: Record<string, unknown>[] = [{ type: "text", text: user }];
  for (const item of media ?? []) {
    if (item.mimeType.startsWith("image/")) {
      content.push({ type: "image_url", image_url: { url: `data:${item.mimeType};base64,${item.base64}` } });
    }
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal: abortSignal,
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content }],
      response_format: { type: "json_object" },
      temperature: 0.5,
    }),
  });
  if (!response.ok) throw new Error(`openai request failed (${response.status})`);
  const json = await response.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function withTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function parseJSON(raw: string): unknown | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function failureReason(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "aborted_or_timed_out";
  if (error instanceof Error && /timed out/i.test(error.message)) return "timed_out";
  return "provider_request_failed";
}
