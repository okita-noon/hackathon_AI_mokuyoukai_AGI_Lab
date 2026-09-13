import type { Profile, Promise as Contract, Engine } from "./types";

/**
 * 画面をまたいで持ち回る状態。
 * サーバーには何も置かず、この端末のブラウザにだけ保存する。
 */
export type State = {
  profile: Profile | null;
  engine: Engine | null;
  contract: Contract | null;
  promiseReply: string | null;
  promiseEngine: Engine | null;
};

export const EMPTY: State = {
  profile: null,
  engine: null,
  contract: null,
  promiseReply: null,
  promiseEngine: null,
};

const KEY = "ai-okan-state-v1";

export function load(): State {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as State) } : EMPTY;
  } catch {
    // 壊れていたら初期状態で始める
    return EMPTY;
  }
}

export function patch(next: Partial<State>): State {
  const merged = { ...load(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* 保存できなくても画面は進める */
  }
  return merged;
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 消せなくても支障はない */
  }
}

/** 画面ごとの前提。満たしていなければ、その手前の画面へ戻す */
export const STEP_PATHS = ["/ingest", "/dossier", "/promise", "/watch"] as const;
