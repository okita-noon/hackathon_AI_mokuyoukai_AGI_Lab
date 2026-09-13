import type { Profile, Verdict } from "./types";

/**
 * APIキー未設定・API失敗時のフェイルセーフ応答。
 * data/past-self.json の中身と辻褄が合うように書いてある。
 */
export const demoProfile: Profile = {
  headline: "あんた、またそれか",
  traits: [
    {
      label: "入会だけが得意",
      evidence: "2025年1月にジム入会して20か月で来店11回。2026年1月のヨガも3回で退会してる。",
    },
    {
      label: "開始日を未来にずらす",
      evidence: "「来週から本気出す」「GW明けから」「9月は仕切り直し」。同じ投稿を2年で7回やってる。",
    },
    {
      label: "道具から入る",
      evidence: "GRIT・先延ばしをなくす技術・習慣が10割を購入。8月14日「積んでる」と返事してる。",
    },
  ],
  pattern:
    "宣言 → 3日から2週間だけ続く → 忙しさを理由に中断 → 環境やツールのせいにして買い物 → 仕切り直し宣言。これを2年で4周してる。",
  weakness: "誰にも見られてない期間が3日続いたら折れる。",
  prediction: "このままやと来年の元日にも「今年こそ痩せる」って同じ文章を書くで。",
  okanLine: "やる気がないんちゃう。見張りがおらんだけや。",
};

export const demoPromiseReply =
  "はいはい、聞いたで。せやけどあんた、去年の1月も同じこと言うてたやんか。今回はごまかしきかんように写真で出してもらうからな。約束や。";

export const demoScold =
  "ほれ見てみ。期限すぎてもうたやんか。忙しかった? 去年の5月もそう言うてたで。あんたは意志が弱いんやない、見張りがおらんかっただけや。罰金はきっちり払い。ほんで明日、もっぺん約束しにおいで。次は隣で見とったる。";

export const demoVerdicts: Record<Verdict["verdict"], Verdict> = {
  ok: {
    verdict: "ok",
    whatISee: "トレーニング機材と、撮影時刻が写り込んだ屋内の様子。",
    okan: "お、ちゃんと行ったんやな。えらい。言うとくけど、おかんは驚いてるで。この調子で明日も出しや。",
    score: 82,
  },
  suspicious: {
    verdict: "suspicious",
    whatISee: "屋内の風景。約束の内容と直接つながる要素が確認できない。",
    okan: "これでごまかせると思たんか。おかんはあんたの写真フォルダの中身まで知ってんねんで。撮り直し。",
    score: 24,
  },
  ng: {
    verdict: "ng",
    whatISee: "約束したエビデンスに該当するものが写っていない。",
    okan: "ちゃうやろ。これのどこが証拠やねん。出せへんのやったら、やってへんのと一緒や。",
    score: 8,
  },
};

/** デモモードでも毎回同じにならんように、画像サイズで判定を散らす */
export function demoVerdictFor(seed: number): Verdict {
  const keys: Verdict["verdict"][] = ["ok", "suspicious", "ng"];
  return demoVerdicts[keys[seed % keys.length]];
}
