import type { AppState } from "./types";

const KEY = "ai-okan-state-v1";

export const EMPTY: AppState = {
  step: 0,
  profile: null,
  engine: null,
  contract: null,
  promiseReply: null,
  promiseEngine: null,
};

function readLocal(): AppState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as AppState) } : EMPTY;
  } catch {
    // 壊れたローカル状態は使わない
    return EMPTY;
  }
}

function writeLocal(state: AppState): AppState {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 保存できなくても画面は進める */
  }
  return state;
}

/**
 * サーバーに保存された状態を正とし、読めないときは端末に残した控えを使う。
 * ページをまたいでも同じ状態を見られるようにするため、各ページの入口で呼ぶ。
 */
export async function loadState(): Promise<AppState> {
  try {
    const res = await fetch("/api/okan", { cache: "no-store" });
    if (!res.ok) throw new Error("server state unavailable");
    const json = await res.json();
    if (json.state) return writeLocal({ ...EMPTY, ...json.state });
  } catch {
    /* サーバーが落ちていても、控えがあれば続きから進められる */
  }
  return readLocal();
}

/** サーバーへの保存は /api/okan の POST 側が行う。ここは端末の控えを更新する */
export function patch(next: Partial<AppState>): AppState {
  return writeLocal({ ...readLocal(), ...next });
}

export async function reset(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 消せなくても支障はない */
  }
  await fetch("/api/okan", { method: "DELETE" }).catch(() => undefined);
}

/** 画面の並び。ステップ表示はURLから決まる */
export const STEP_PATHS = ["/ingest", "/dossier", "/promise", "/watch"] as const;
