"use client";

import { useEffect, useRef, useState } from "react";
import VoiceInput from "@/components/VoiceInput";
import { readMediaMeta, uploadWithProgress } from "@/lib/browser-media";

type Judgement = {
  status: string;
  confidence_score: number;
  reasoning: string;
  suspicious_indicators: string[];
  detected_elements?: string[];
  appeal_recommended: boolean;
  agent?: string;
};
type Commitment = {
  id: string;
  title: string;
  verification_rule: string;
  penalty_amount: number;
  deadline_at: string;
  grace_expires_at: string | null;
  status: string;
  last_judgement: Judgement | null;
  appeal_status: string | null;
};

const api = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
};

export default function Dashboard() {
  const [items, setItems] = useState<Commitment[]>([]);
  const [user, setUser] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const d = await api("/api/commitments");
    setItems(d.commitments);
    setUser(d.user);
  };
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  return (
    <>
      {err && <div className="card" style={{ color: "var(--bad)" }}>{err}</div>}
      <h2>新しいコミットメント</h2>
      <CreateForm onDone={load} />
      <h2>
        あなたのコミットメント {user && <span className="muted">/ 信頼スコア {Number(user.trust_score).toFixed(2)}</span>}
      </h2>
      {items.length === 0 && <p className="muted">まだありません。</p>}
      {items.map((c) => (
        <Row key={c.id} c={c} onDone={load} />
      ))}
      <h2>ワーカー</h2>
      <TickButton onDone={load} />
    </>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [rule, setRule] = useState("");
  const defaultDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
  const append = (setter: (f: (p: string) => string) => void) => (t: string) =>
    setter((prev) => (prev ? prev + t : t));

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget as HTMLFormElement);
        setBusy(true);
        try {
          await api("/api/commitments", {
            method: "POST",
            body: JSON.stringify({
              title,
              verification_rule: rule,
              penalty_amount: Number(f.get("amount")),
              deadline_at: new Date(String(f.get("deadline"))).toISOString(),
            }),
          });
          setTitle("");
          setRule("");
          onDone();
        } catch (err: any) {
          alert(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field-head">
        <label>目標</label>
        <VoiceInput onResult={append(setTitle)} label="話して入力" />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="今日ジムで筋トレする" />

      <div className="field-head">
        <label>達成条件（AIがこの条件で判定します）</label>
        <VoiceInput onResult={append(setRule)} label="話して入力" />
      </div>
      <textarea
        value={rule}
        onChange={(e) => setRule(e.target.value)}
        required
        placeholder="ジムのトレーニング機材が写っており、本人がトレーニングウェアを着用していること。スクリーンショットや他人の写真は不可。"
      />

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>ペナルティ額（円）</label>
          <input name="amount" type="number" min={100} defaultValue={1000} required />
        </div>
        <div style={{ flex: 1 }}>
          <label>締切</label>
          <input name="deadline" type="datetime-local" defaultValue={defaultDeadline} required />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button disabled={busy}>{busy ? "作成中..." : "コミットする"}</button>
      </div>
    </form>
  );
}

function Row({ c, onDone }: { c: Commitment; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Judgement | null>(null);
  const [appeal, setAppeal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const j = result ?? c.last_judgement;

  const [note, setNote] = useState("");

  const submitProof = async (file: File) => {
    setBusy("証拠をアップロード中...");
    try {
      // 0. 動画・音声は尺と解像度を測ってから送る（解析範囲の決定に使う）
      const mediaMeta = await readMediaMeta(file);
      // 1. 署名付きURLを払い出し
      const t = await api(`/api/commitments/${c.id}/proof/upload-url`, {
        method: "POST",
        body: JSON.stringify({ mimeType: file.type }),
      });
      // 2. 本体を直接PUT（GCS or ローカル）
      await uploadWithProgress(t.uploadUrl, file, (percent) => setBusy(`証拠をアップロード中... ${percent}%`));
      // 3. 判定
      setBusy("Geminiが判定中...");
      const d = await api(`/api/commitments/${c.id}/proof`, {
        method: "POST",
        body: JSON.stringify({ storage_uri: t.storageUri, mime_type: file.type, note, media_meta: mediaMeta }),
      });
      setResult(d.judgement);
      onDone();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{c.title}</strong>
        <span className={`badge ${c.status}`}>{c.status}</span>
      </div>
      <p className="muted" style={{ margin: "8px 0" }}>{c.verification_rule}</p>
      <div className="muted">
        ¥{c.penalty_amount.toLocaleString()} / 締切 {new Date(c.deadline_at).toLocaleString("ja-JP")}
        {c.grace_expires_at && ` / 猶予期限 ${new Date(c.grace_expires_at).toLocaleString("ja-JP")}`}
      </div>

      {j && (
        <>
          <hr />
          <div className="row">
            <span className={`badge ${j.status}`}>{j.status}</span>
            <span className="mono muted">
              confidence {Number(j.confidence_score).toFixed(2)}
              {j.agent === "arbiter" && " · 調停AI"}
            </span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>{j.reasoning}</p>
          {j.detected_elements?.map((d) => <span className="tag" key={d}>{d}</span>)}
          {j.suspicious_indicators?.map((d) => <span className="tag bad" key={d}>⚠ {d}</span>)}
        </>
      )}

      {["ACTIVE", "GRACE"].includes(c.status) && (
        <>
          <hr />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && submitProof(e.target.files[0])}
          />
          <div className="field-head">
            <label>補足コメント（任意）</label>
            <VoiceInput onResult={(t) => setNote((p) => (p ? p + t : t))} label="話して入力" />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 3セット終えた直後にジムで撮影しました" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy ?? "証拠を提出"}
            </button>
          </div>
        </>
      )}

      {c.status === "GRACE" && !c.appeal_status && (
        <>
          <div className="field-head">
            <label>異議申し立て（調停AIが再判定します）</label>
            <VoiceInput onResult={(t) => setAppeal((p) => (p ? p + t : t))} label="話して入力" />
          </div>
          <textarea value={appeal} onChange={(e) => setAppeal(e.target.value)} placeholder="判定に納得できない理由を書いてください" />
          <div style={{ marginTop: 8 }}>
            <button
              className="ghost"
              disabled={busy !== null || appeal.length < 5}
              onClick={async () => {
                setBusy("調停AIが審理中...");
                try {
                  const d = await api(`/api/commitments/${c.id}/appeal`, {
                    method: "POST",
                    body: JSON.stringify({ statement: appeal }),
                  });
                  setResult(d.judgement ?? null);
                  onDone();
                } catch (e: any) {
                  alert(e.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy ?? "異議を申し立てる"}
            </button>
          </div>
        </>
      )}
      {c.appeal_status && <div className="muted" style={{ marginTop: 8 }}>異議申し立て: {c.appeal_status}</div>}
    </div>
  );
}

function TickButton({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState<any>(null);
  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>
        本番では Cloud Scheduler が5分おきに <span className="mono">/api/cron/tick</span> を叩きます。デモでは手動実行できます。
      </p>
      <button
        className="ghost"
        onClick={async () => {
          const d = await api("/api/cron/tick?secret=" + encodeURIComponent(process.env.NEXT_PUBLIC_CRON_SECRET ?? "dev-secret"));
          setOut(d);
          onDone();
        }}
      >
        ワーカーを1回実行
      </button>
      {out && <pre className="mono" style={{ overflowX: "auto" }}>{JSON.stringify(out, null, 2)}</pre>}
    </div>
  );
}
