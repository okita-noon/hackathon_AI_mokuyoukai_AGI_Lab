"use client";

import { useCallback, useEffect, useState } from "react";
import Onboarding from "./Onboarding";
import CommitmentCard, { type Commitment } from "./CommitmentCard";

export default function Home() {
  const [items, setItems] = useState<Commitment[] | null>(null);
  const [user, setUser] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  // クライアント時計のズレでカウントダウンが狂うのを防ぐ（レスポンスの Date ヘッダを基準にする）
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/commitments");
      const serverDate = r.headers.get("date");
      if (serverDate) setServerOffsetMs(new Date(serverDate).getTime() - Date.now());
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setItems(d.commitments);
      setUser(d.user);
    } catch (e: any) {
      setErr(e.message);
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (items === null) return <p className="muted">読み込み中...</p>;

  // 初回（コミットメントが0件）は必ずオンボーディングから始める
  const showOnboarding = creating || items.length === 0;

  if (showOnboarding) {
    // 支払先が設定済みなら、2回目以降は目標入力から始める
    const initialStep = user?.payout_destination ? 3 : 0;
    return (
      <Onboarding
        initialStep={initialStep}
        onDone={() => { setCreating(false); load(); }}
        onCancel={items.length > 0 ? () => setCreating(false) : undefined}
      />
    );
  }

  return (
    <>
      {err && <div className="card error">{err}</div>}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <span className="muted">信頼スコア {Number(user?.trust_score ?? 0).toFixed(2)}</span>
        <button onClick={() => setCreating(true)}>新しい目標を立てる</button>
      </div>
      {items.map((c) => (
        <CommitmentCard key={c.id} c={c} onDone={load} serverOffsetMs={serverOffsetMs} />
      ))}
    </>
  );
}
