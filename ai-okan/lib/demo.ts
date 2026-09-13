import type { Profile, Verdict } from "./types";

/**
 * APIキー未設定・API失敗時のフェイルセーフ応答。
 * data/usutaku.json の中身と辻褄が合うように書いてある。
 */
export const demoProfile: Profile = {
  headline: "あんた、AIの話しかしてへんな",
  traits: [
    {
      label: "AI一本で押し通す",
      evidence:
        "ChatGPTに出会うてからずっとやんか。SNSもYouTubeも書籍も、ぜんぶAIの話で通してるやろ。",
    },
    {
      label: "危機感で人を動かす",
      evidence:
        "「AIに仕事を奪われる」「導入した会社ではリストラも起きてる」て、何回も同じこと言うてるで。",
    },
    {
      label: "明日使える話に落とす",
      evidence:
        "課金プランやらデータ分析やら、手を動かせる話ばっかりや。理屈だけで終わらせてへんな。",
    },
  ],
  pattern:
    "新しい道具が出たら、まず自分で触って、すぐ人に教える側に回る。学生のころから手を挙げ続けてきたんが、そのまま続いてるわ。",
  weakness: "止まるのが下手やな。1日密着で自分でも過酷や言うてたやろ。",
  prediction: "このままやと、次の新しいAIが出た日も、真っ先に触って夜中まで解説を作ってるで。",
  okanLine: "よう走ってるわ。せやけど倒れたら、誰も教えられへんで。",
};

export const demoPromiseReply =
  "約束、聞いたで。自分で決めた目標やからな。取り組んだら、決めた証拠を見せてな。一緒に確認しよか。";

export const demoScold =
  "今回は約束を守れへんかったな。何が難しかったか、振り返ってみよか。これはデモやから実際のお金は動かへんで。次は取り組める大きさにして、もう一度始めよ。";

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
    okan: "このデモでは画像の中身を実際には判定してへんで。AIを設定したら、約束の条件と照らして確認するからな。",
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
