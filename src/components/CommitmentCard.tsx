"use client";

import { useRef, useState } from "react";
import VoiceInput from "./VoiceInput";
import Countdown from "./Countdown";
import JudgementDetails from "./JudgementDetails";
import AudioRecorder from "./AudioRecorder";

export type Judgement = {
  status: string;
  confidence_score: string | number;
  reasoning: string;
  detected_elements?: string[];
  suspicious_indicators?: string[];
  appeal_recommended: boolean;
  agent?: string;
};
export type Commitment = {
  id: string;
  title: string;
  verification_rule: string;
  penalty_amount: number;
  deadline_at: string;
  grace_expires_at: string | null;
  status: string;
  /** AIが推奨した種類。提出時に別の種類を選んでもよい */
  recommended_evidence_type: "photo" | "video" | "audio" | "gps";
  target_geo: { lat: number; lng: number; radius_m: number; label?: string | null } | null;
  last_judgement: Judgement | null;
  appeal_status: string | null;
};

type EvidenceKey = "photo" | "video" | "audio" | "gps";

const EVIDENCE: Record<EvidenceKey, { label: string; accept: string; hint: string }> = {
  photo: { label: "写真", accept: "image/*", hint: "カメラで撮影するか、写真を選んでください" },
  video: { label: "動画", accept: "video/*", hint: "動作が最初から最後まで写るように撮影してください" },
  audio: { label: "音声", accept: "audio/*", hint: "その場で録音するか、音声ファイルを選べます" },
  gps: { label: "位置情報", accept: "", hint: "いまいる場所の座標を送ります" },
};
const EVIDENCE_KEYS: EvidenceKey[] = ["photo", "video", "audio", "gps"];

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "進行中",
  APPROVED: "達成",
  GRACE: "猶予期間中",
  UNDER_REVIEW: "審理中",
  PENALIZED: "ペナルティ執行済み",
  FAILED_PAYMENT: "決済失敗",
};

export default function CommitmentCard({
  c,
  onDone,
  serverOffsetMs = 0,
}: {
  c: Commitment;
  onDone: () => void;
  serverOffsetMs?: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Judgement | null>(null);
  const [note, setNote] = useState("");
  const [appeal, setAppeal] = useState("");
  const [showAppeal, setShowAppeal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const j = result ?? c.last_judgement;

  // 推奨を初期値にするが、ユーザーは自由に切り替えられる
  const [mode, setMode] = useState<EvidenceKey>(c.recommended_evidence_type ?? "photo");
  const [attachGeo, setAttachGeo] = useState(false);
  const evidence = EVIDENCE[mode];

  /** 現在地を取る。拒否・失敗時は null を返し、提出自体は止めない */
  const getGeo = (): Promise<{ lat: number; lng: number; accuracy_m: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
    return d;
  };

  const submitProof = async (file: File) => {
    try {
      let geo = null;
      if (attachGeo) {
        setBusy("現在地を取得しています...");
        geo = await getGeo();
      }
      setBusy(`${evidence.label}をアップロード中...`);
      const t = await post(`/api/commitments/${c.id}/proof/upload-url`, { mimeType: file.type });
      await fetch(t.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      setBusy(`AIが${evidence.label}を解析しています...`);
      const d = await post(`/api/commitments/${c.id}/proof`, {
        storage_uri: t.storageUri,
        mime_type: file.type,
        evidence_type: mode,
        note,
        geo,
      });
      setResult(d.judgement);
      onDone();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  /** 位置情報はファイルを伴わない。ブラウザから座標を取り、距離判定はサーバーが行う */
  const submitLocation = () => {
    if (!navigator.geolocation) return alert("この端末では位置情報を取得できません");
    setBusy("現在地を取得しています...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setBusy("AIが位置情報を確認しています...");
          const d = await post(`/api/commitments/${c.id}/proof`, {
            note,
            evidence_type: "gps",
            geo: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: Math.round(pos.coords.accuracy),
            },
          });
          setResult(d.judgement);
          onDone();
        } catch (e: any) {
          alert(e.message);
        } finally {
          setBusy(null);
        }
      },
      (e) => {
        setBusy(null);
        alert(
          e.code === e.PERMISSION_DENIED
            ? "位置情報の使用が許可されていません。ブラウザの設定から許可してください。"
            : "現在地を取得できませんでした。",
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{c.title}</strong>
        <span className={`badge ${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
      </div>

      <div className="meta">
        <span>¥{c.penalty_amount.toLocaleString()}</span>
      </div>

      <Countdown
        status={c.status}
        deadlineAt={c.deadline_at}
        graceExpiresAt={c.grace_expires_at}
        serverOffsetMs={serverOffsetMs}
      />

      <p className="muted rule">{c.verification_rule}</p>

      {j && (
        <div className="judgement">
          <JudgementDetails
            judgement={{ ...j, suspicious_indicators: j.suspicious_indicators ?? [] }}
            commitmentStatus={c.status}
            appealStatus={c.appeal_status}
          />
        </div>
      )}

      {["ACTIVE", "GRACE"].includes(c.status) && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={evidence.accept}
            {...(mode === "photo" || mode === "video" ? { capture: "environment" as const } : {})}
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && submitProof(e.target.files[0])}
          />
          <label style={{ marginTop: 14 }}>証跡を提出する</label>
          <div className="chips">
            {EVIDENCE_KEYS.map((k) => (
              <button
                type="button"
                key={k}
                className={"chip" + (mode === k ? " on" : "")}
                onClick={() => setMode(k)}
              >
                {EVIDENCE[k].label}
                {k === c.recommended_evidence_type && " ・推奨"}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 0, marginBottom: 0, fontSize: 12 }}>
            {evidence.hint}
            {c.target_geo && (
              <> 目標地点{c.target_geo.label ? `「${c.target_geo.label}」` : ""}から {c.target_geo.radius_m}m 以内が条件です。</>
            )}
            <br />
            推奨と違う種類でも提出できます。それだけで未達にはならず、条件を確認できない場合はAIが
            「何があれば判定できるか」を返します。
          </p>

          {mode !== "gps" && (
            <label className="toggle">
              <input type="checkbox" checked={attachGeo} onChange={(e) => setAttachGeo(e.target.checked)} />
              現在地も一緒に送る
            </label>
          )}
          <div className="field-head" style={{ marginTop: 12 }}>
            <label>補足（任意）</label>
            <VoiceInput onResult={(t) => setNote((p) => p + t)} label="話す" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 3セット終えた直後に撮影しました" />
          <div className="row" style={{ marginTop: 10 }}>
            {mode === "gps" ? (
              <button disabled={!!busy} onClick={submitLocation}>{busy ?? "📍 現在地を送信する"}</button>
            ) : mode === "audio" ? (
              <>
                <AudioRecorder disabled={!!busy} onRecorded={submitProof} />
                <button className="ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                  {busy ?? "ファイルを選ぶ"}
                </button>
              </>
            ) : (
              <button disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy ?? `${evidence.label}を提出する`}
              </button>
            )}
            {c.status === "GRACE" && !c.appeal_status && !showAppeal && (
              <button className="ghost" disabled={!!busy} onClick={() => setShowAppeal(true)}>異議を申し立てる</button>
            )}
          </div>
        </>
      )}

      {showAppeal && c.status === "GRACE" && !c.appeal_status && (
        <>
          <div className="field-head" style={{ marginTop: 12 }}>
            <label>判定に納得できない理由</label>
            <VoiceInput onResult={(t) => setAppeal((p) => p + t)} label="話す" />
          </div>
          <textarea value={appeal} onChange={(e) => setAppeal(e.target.value)} placeholder="証拠のどこを見てほしいかを書いてください" />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="ghost"
              disabled={!!busy || appeal.trim().length < 5}
              onClick={async () => {
                setBusy("調停AIが審理しています...");
                try {
                  const d = await post(`/api/commitments/${c.id}/appeal`, { statement: appeal });
                  setResult(d.judgement ?? null);
                  setShowAppeal(false);
                  onDone();
                } catch (e: any) {
                  alert(e.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy ?? "調停AIに再判定してもらう"}
            </button>
          </div>
        </>
      )}

      {c.appeal_status && (
        <p className="muted" style={{ marginTop: 10 }}>
          異議申し立て: {{ PENDING: "審理中", UPHELD: "認められました（免責）", DISMISSED: "認められませんでした" }[c.appeal_status]}
        </p>
      )}
    </div>
  );
}
