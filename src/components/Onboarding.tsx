"use client";

import { useEffect, useState } from "react";
import VoiceInput from "./VoiceInput";
import CardSetup, { type Card } from "./CardSetup";

type Question = { id: string; text: string; why: string; suggestions: string[] };
type PayoutDestination = "app" | "donation" | "friend";
type EvidenceType = "photo" | "video" | "audio" | "gps";
type TargetGeo = { lat: number; lng: number; radius_m: number; label: string } | null;

type Proposal = {
  title: string;
  verification_rule: string;
  checklist: string[];
  evidence_type: EvidenceType;
  suggested_penalty_amount: number;
  rationale: string;
};

const EVIDENCE_CHOICES: { key: EvidenceType; label: string; hint: string }[] = [
  { key: "photo", label: "写真", hint: "現物や画面を1枚で示す" },
  { key: "video", label: "動画", hint: "動作そのものを見せる" },
  { key: "audio", label: "音声", hint: "発話や演奏で示す" },
  { key: "gps", label: "位置情報", hint: "その場所にいたことを示す" },
];

const STEPS = ["ようこそ", "支払先", "カード", "目標", "ヒアリング", "条件", "金額"];

const PAYOUTS: { key: PayoutDestination; label: string; desc: string }[] = [
  { key: "app", label: "アプリに支払う", desc: "運営が受け取ります。いちばん手続きが少ない選択です。" },
  { key: "donation", label: "寄付する", desc: "選んだ団体に寄付されます。「捨てるくらいなら意味のある使い道に」という動機づけ。" },
  { key: "friend", label: "友人に渡す", desc: "指定した相手に渡ります。相手に知られることが最大の抑止力になります。" },
];

const CHARITIES = ["日本赤十字社", "国境なき医師団", "あしなが育英会", "国連WFP"];

const api = async (url: string, body: unknown) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
};

export default function Onboarding({
  onDone,
  onCancel,
  initialStep = 0,
}: {
  onDone: () => void;
  onCancel?: () => void;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [payout, setPayout] = useState<PayoutDestination | null>(null);
  const [charity, setCharity] = useState(CHARITIES[0]);
  const [friendName, setFriendName] = useState("");
  const [friendContact, setFriendContact] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [goal, setGoal] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const [rule, setRule] = useState("");
  const [title, setTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("photo");
  const [targetGeo, setTargetGeo] = useState<TargetGeo>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 24 * 3600 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );

  /** 目標をエージェントに投げる。質問が返れば step3、条件が返れば step4 へ */
  const ask = async (nextAnswers: { question: string; answer: string }[]) => {
    setErr(null);
    setBusy("AIが目標を分析しています...");
    try {
      const d = await api("/api/goals/design", { goal, answers: nextAnswers });
      if (d.phase === "PROPOSAL" && d.proposal) {
        setProposal(d.proposal);
        setTitle(d.proposal.title);
        setRule(d.proposal.verification_rule);
        setAmount(d.proposal.suggested_penalty_amount);
        // エージェントは screenshot を返すことがあるが、実体は写真と同じ扱い
        setEvidenceType(
          (["photo", "video", "audio", "gps"] as const).includes(d.proposal.evidence_type)
            ? d.proposal.evidence_type
            : "photo",
        );
        setStep(5);
      } else {
        setQuestions(d.questions ?? []);
        setDraft({});
        setStep(4);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const submitAnswers = () => {
    const merged = [
      ...answers,
      ...questions
        .filter((q) => draft[q.id]?.trim())
        .map((q) => ({ question: q.text, answer: draft[q.id].trim() })),
    ];
    setAnswers(merged);
    ask(merged);
  };

  const loadCard = async () => {
    try {
      const r = await fetch("/api/me");
      const d = await r.json();
      setCard(d.card ?? null);
    } catch {
      /* カード情報が取れなくても先へ進めるようにする */
    }
  };

  const savePayout = async () => {
    setErr(null);
    setBusy("保存中...");
    try {
      await api("/api/me/payout", {
        destination: payout,
        charity,
        name: friendName,
        contact: friendContact,
      });
      await loadCard();
      setStep(2);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const captureTarget = () => {
    if (!navigator.geolocation) return alert("この端末では位置情報を取得できません");
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTargetGeo((prev) => ({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radius_m: prev?.radius_m ?? 100,
          label: prev?.label ?? "",
        }));
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        alert("現在地を取得できませんでした。ブラウザの位置情報を許可してください。");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const create = async () => {
    setErr(null);
    setBusy("作成中...");
    try {
      await api("/api/commitments", {
        title,
        verification_rule: rule,
        penalty_amount: amount,
        deadline_at: new Date(deadline).toISOString(),
        evidence_type: evidenceType,
        target_geo: targetGeo,
      });
      onDone();
    } catch (e: any) {
      setErr(e.message);
      setBusy(null);
    }
  };

  return (
    <div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} data-state={i === step ? "current" : i < step ? "done" : "todo"}>
            <span className="steps-dot">{i < step ? "✓" : i + 1}</span>
            <span className="steps-label">{s}</span>
          </li>
        ))}
      </ol>

      {err && <div className="card error">{err}</div>}

      {/* ---- 0. ようこそ ---- */}
      {step === 0 && (
        <div className="card step-in">
          <h3>目標を「破れない約束」にする</h3>
          <ol className="howto">
            <li><b>目標を宣言する</b><span>話しかけるだけでOK。AIが質問しながら、判定できる条件に翻訳します。</span></li>
            <li><b>期限までに証拠を出す</b><span>写真を1枚アップロードすると、AIがその場で達成/未達成を判定します。</span></li>
            <li><b>未達なら自動でペナルティ</b><span>猶予24時間の間に異議を出せば、調停AIが再判定します。</span></li>
          </ol>
          <p className="muted">
            判定が「判定不能」で終わった場合は課金されません。疑わしいときはユーザーに有利に倒す設計です。
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={() => setStep(1)}>はじめる</button>
            {onCancel && <button className="ghost" onClick={onCancel}>あとで</button>}
          </div>
        </div>
      )}

      {/* ---- 1. 支払先 ---- */}
      {step === 1 && (
        <div className="card step-in">
          <h3>ペナルティは誰に渡しますか？</h3>
          <p className="muted">
            達成できなかったときの行き先です。あとからマイページで変更できます。
          </p>

          {PAYOUTS.map((p) => (
            <button
              type="button"
              key={p.key}
              className={"choice" + (payout === p.key ? " on" : "")}
              onClick={() => setPayout(p.key)}
            >
              <b>{p.label}</b>
              <span>{p.desc}</span>
            </button>
          ))}

          {payout === "donation" && (
            <>
              <label>寄付先</label>
              <div className="chips">
                {CHARITIES.map((c) => (
                  <button type="button" key={c} className={"chip" + (charity === c ? " on" : "")} onClick={() => setCharity(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}

          {payout === "friend" && (
            <>
              <div className="field-head">
                <label>渡す相手の名前</label>
                <VoiceInput onResult={(t) => setFriendName((p) => p + t)} label="話す" />
              </div>
              <input value={friendName} onChange={(e) => setFriendName(e.target.value)} placeholder="例: 田中さん" />
              <label>連絡先（任意）</label>
              <input value={friendContact} onChange={(e) => setFriendContact(e.target.value)} placeholder="メールアドレスやSNSのID" />
            </>
          )}

          {payout && payout !== "app" && (
            <p className="muted" style={{ fontSize: 12 }}>
              現時点では「誰に渡すか」の宣言のみを記録します。第三者への実際の送金は Stripe Connect の
              オンボーディングが必要なため、この段階では決済は運営アカウントに対して行われます。
            </p>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <button
              disabled={!!busy || !payout || (payout === "friend" && friendName.trim().length === 0)}
              onClick={savePayout}
            >
              {busy ?? "次へ"}
            </button>
            <button className="ghost" onClick={() => setStep(0)}>戻る</button>
          </div>
        </div>
      )}

      {/* ---- 2. カード設定 ---- */}
      {step === 2 && (
        <div className="card step-in">
          <h3>ペナルティ用のカード</h3>
          <p className="muted">
            未達だったときに、猶予期間の後で自動的に決済されます。登録は後回しにもできます。
          </p>
          <CardSetup card={card} onUpdated={loadCard} />
          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={() => setStep(3)}>{card ? "次へ" : "あとで登録して進む"}</button>
            <button className="ghost" onClick={() => setStep(1)}>戻る</button>
          </div>
        </div>
      )}

      {/* ---- 3. 目標入力 ---- */}
      {step === 3 && (
        <div className="card step-in">
          <h3>何を達成したいですか？</h3>
          <p className="muted">ざっくりで大丈夫です。ここから一緒に条件を詰めていきます。</p>
          <div className="field-head">
            <label>目標</label>
            <VoiceInput onResult={(t) => setGoal((p) => p + t)} label="話して入力" />
          </div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="例: 今週中に部屋を片付ける / 毎朝ランニングする / 積んでる本を1冊読む"
          />
          <div className="row" style={{ marginTop: 14 }}>
            <button disabled={goal.trim().length < 2 || !!busy} onClick={() => ask([])}>
              {busy ?? "AIに相談する"}
            </button>
            <button className="ghost" onClick={() => setStep(2)}>戻る</button>
          </div>
        </div>
      )}

      {/* ---- 2. ヒアリング ---- */}
      {step === 4 && (
        <div className="card step-in">
          <h3>いくつか教えてください</h3>
          <p className="muted">
            写真から判定できる条件にするための質問です。候補をタップするか、話して答えてください。
          </p>
          {questions.map((q) => (
            <div key={q.id} className="qcard">
              <div className="field-head">
                <label>{q.text}<span className="why">{q.why}</span></label>
                <VoiceInput onResult={(t) => setDraft((d) => ({ ...d, [q.id]: (d[q.id] ?? "") + t }))} label="話す" />
              </div>
              <div className="chips">
                {q.suggestions.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={"chip" + (draft[q.id] === s ? " on" : "")}
                    onClick={() => setDraft((d) => ({ ...d, [q.id]: s }))}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input
                value={draft[q.id] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                placeholder="自由に入力してもOK"
              />
            </div>
          ))}
          <div className="row" style={{ marginTop: 14 }}>
            <button disabled={!!busy || questions.every((q) => !draft[q.id]?.trim())} onClick={submitAnswers}>
              {busy ?? "回答する"}
            </button>
            <button className="ghost" disabled={!!busy} onClick={() => ask(answers)}>
              わからないので任せる
            </button>
          </div>
        </div>
      )}

      {/* ---- 3. 達成条件の確認 ---- */}
      {step === 5 && proposal && (
        <div className="card step-in">
          <h3>この条件で判定します</h3>
          <p className="muted">{proposal.rationale}</p>

          <label>目標</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />

          <label>達成条件（編集できます）</label>
          <textarea value={rule} onChange={(e) => setRule(e.target.value)} style={{ minHeight: 96 }} />

          <label>判定時にチェックされる項目</label>
          <ul className="checklist">
            {proposal.checklist.map((c) => <li key={c}>{c}</li>)}
          </ul>

          <label>おすすめの証跡</label>
          <div className="chips">
            {EVIDENCE_CHOICES.map((e) => (
              <button
                type="button"
                key={e.key}
                className={"chip" + (evidenceType === e.key ? " on" : "")}
                onClick={() => setEvidenceType(e.key)}
                title={e.hint}
              >
                {e.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            {EVIDENCE_CHOICES.find((e) => e.key === evidenceType)?.hint}
            <br />提出時は別の種類でも構いません。ここで決めるのは「初期表示される推奨」だけです。
          </p>

          {evidenceType === "gps" && (
            <div className="qcard">
              <label>目標地点</label>
              <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                判定したい場所で「現在地を目標地点にする」を押してください。提出時の座標との距離で判定します。
              </p>
              <div className="row">
                <button type="button" className="ghost" disabled={geoBusy} onClick={captureTarget}>
                  {geoBusy ? "取得中..." : "現在地を目標地点にする"}
                </button>
                {targetGeo && (
                  <span className="muted mono">
                    {targetGeo.lat.toFixed(5)}, {targetGeo.lng.toFixed(5)}
                  </span>
                )}
              </div>
              {targetGeo && (
                <>
                  <label>地点の名前（任意）</label>
                  <input
                    value={targetGeo.label}
                    onChange={(e) => setTargetGeo({ ...targetGeo, label: e.target.value })}
                    placeholder="例: 新宿のジム"
                  />
                  <label>許容半径</label>
                  <div className="chips">
                    {[50, 100, 300, 1000].map((r) => (
                      <button
                        type="button"
                        key={r}
                        className={"chip" + (targetGeo.radius_m === r ? " on" : "")}
                        onClick={() => setTargetGeo({ ...targetGeo, radius_m: r })}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <button
              onClick={() => setStep(6)}
              disabled={rule.trim().length < 5 || (evidenceType === "gps" && !targetGeo)}
            >
              この条件でいく
            </button>
            <button className="ghost" onClick={() => setStep(4)}>質問に答え直す</button>
          </div>
        </div>
      )}

      {/* ---- 4. ペナルティと期限 ---- */}
      {step === 6 && (
        <div className="card step-in">
          <h3>いくら賭けますか？</h3>
          <p className="muted">達成できなかったとき、猶予期間の後に自動で決済されます。</p>

          <label>ペナルティ額</label>
          <div className="chips">
            {[500, 1000, 3000, 5000, 10000].map((v) => (
              <button type="button" key={v} className={"chip" + (amount === v ? " on" : "")} onClick={() => setAmount(v)}>
                ¥{v.toLocaleString()}
              </button>
            ))}
          </div>
          <input type="number" min={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />

          <label>締切</label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />

          <div className="summary">
            <div><span>目標</span><b>{title}</b></div>
            <div><span>締切</span><b>{new Date(deadline).toLocaleString("ja-JP")}</b></div>
            <div><span>推奨の証跡</span><b>{EVIDENCE_CHOICES.find((e) => e.key === evidenceType)?.label}</b></div>
            <div><span>未達の場合</span><b className="bad">¥{amount.toLocaleString()} を自動決済</b></div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={create} disabled={!!busy}>{busy ?? "コミットする"}</button>
            <button className="ghost" disabled={!!busy} onClick={() => setStep(5)}>戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}
