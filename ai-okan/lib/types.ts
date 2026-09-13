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
};

export type Promise = {
  goal: string;
  deadline: string;
  evidence: string;
  penalty: number;
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
export type Engine = "gemini" | "openai" | "demo";
