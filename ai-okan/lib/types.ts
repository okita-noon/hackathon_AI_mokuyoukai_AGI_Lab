export type Trait = { label: string; evidence: string };

export type Profile = {
  headline: string;
  traits: Trait[];
  pattern: string;
  weakness: string;
  prediction: string;
  okanLine: string;
};

export type Verdict = {
  verdict: "ok" | "ng" | "suspicious";
  whatISee: string;
  okan: string;
  score: number;
  /** 動画で数えられた完了回数。回数が条件でない、または数えられなかったときは null */
  counted?: number | null;
  /** 約束の文面から読み取った必要回数。counted と突き合わせて画面に出す */
  required?: number | null;
};

export type Promise = {
  id?: string;
  goal: string;
  deadline: string;
  deadlineAt?: string;
  evidence: string;
  penalty: number;
  status?: "ACTIVE" | "APPROVED" | "REJECTED" | "UNCERTAIN" | "PENALIZED";
};

export type Source = {
  id: string;
  label: string;
  note: string;
  count: number;
  items: { date: string; text: string }[];
};

export type PastSelf = { owner: string; sources: Source[] };

/** AIが実際に呼ばれたのか、フェイルセーフで返したのかを画面に出すための印 */
export type Engine = "vertex" | "gemini" | "openai" | "demo";

export type AppState = {
  step: number;
  profile: Profile | null;
  engine: Engine | null;
  contract: Promise | null;
  promiseReply: string | null;
  promiseEngine: Engine | null;
};
