import { GoogleGenAI } from "@google/genai";
import { env } from "../env";

// 1つのSDKで Gemini API(APIキー) と Vertex AI(ADC) を切り替える。
// ハッカソン初速は APIキー、本番/審査要件では USE_VERTEX=1 で Vertex AI に寄せる。
let _client: GoogleGenAI | null = null;

export function genaiClient(): GoogleGenAI {
  if (_client) return _client;
  if (env.useVertex) {
    _client = new GoogleGenAI({ vertexai: true, project: env.gcpProject, location: env.gcpLocation });
  } else {
    if (!env.googleApiKey) throw new Error("GOOGLE_API_KEY が未設定です（または USE_VERTEX=1 を指定）");
    _client = new GoogleGenAI({ apiKey: env.googleApiKey });
  }
  return _client;
}
