import type { AppState } from "./types";

// v2 deliberately ignores the cache created by the old shared demo account.
const KEY = "ai-okan-state-v2";

export const EMPTY: AppState = {
  step: 0, profile: null, engine: null, contract: null,
  promiseReply: null, promiseEngine: null,
};

function readLocal(): AppState {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY };
    return { ...EMPTY, ...value };
  } catch {
    return { ...EMPTY };
  }
}

function writeLocal(state: AppState): AppState {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Private mode / quota. */ }
  return state;
}

/** An empty successful server response is authoritative; only an outage uses the cache. */
export async function loadState(): Promise<AppState> {
  try {
    const res = await fetch("/api/okan", { cache: "no-store" });
    if (!res.ok) throw new Error("server state unavailable");
    const json = await res.json();
    if (json.persisted === false) return readLocal();
    return writeLocal({ ...EMPTY, ...(json.state ?? {}) });
  } catch {
    return readLocal();
  }
}

export function patch(next: Partial<AppState>): AppState {
  return writeLocal({ ...readLocal(), ...next });
}

/** Do not claim a reset succeeded while a server copy can reappear on the next visit. */
export async function reset(): Promise<void> {
  const response = await fetch("/api/okan", { method: "DELETE" });
  if (!response.ok || (await response.json()).persisted === false) {
    throw new Error("保存した約束をリセットできませんでした。接続を確認して、もう一度お試しください。");
  }
  writeLocal({ ...EMPTY });
}

export const STEP_PATHS = ["/ingest", "/dossier", "/promise", "/watch"] as const;
