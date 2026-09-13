"use client";

import { useCallback, useEffect, useState } from "react";
import CardSetup, { type Card } from "./CardSetup";
import s from "@/app/mypage/mypage.module.css";

type Me = {
  user: {
    id: string;
    email: string;
    display_name: string;
    // NUMERIC は pg から文字列で来る
    trust_score: string | number;
    stripe_customer_id: string | null;
    default_payment_method_id: string | null;
  };
  card: Card | null;
  stats: {
    total: number;
    approved: number;
    penalized: number;
    active: number;
    penalty_paid_yen: number;
  };
};

const yen = new Intl.NumberFormat("ja-JP");

function TrustGauge({ score }: { score: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <div className={s.gauge}>
      <div className={s.gaugeHead}>
        <span>信頼スコア</span>
        <strong className={s.gaugeValue}>{score.toFixed(2)}</strong>
      </div>
      <div
        className={s.gaugeTrack}
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="信頼スコア"
      >
        <div className={s.gaugeFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={s.gaugeScale}>
        <span>0.00 低い</span>
        <span>1.00 高い</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={[s.statValue, tone].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}

export default function MyPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMe(d as Me);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (err && !me) return <div className="card error">{err}</div>;
  if (!me) return <p className="muted">読み込み中...</p>;

  const { user, card, stats } = me;
  const score = Number(user.trust_score ?? 0);
  const initial = (user.display_name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      {err && <div className="card error">{err}</div>}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>プロフィール</h2>
        </div>
        <div className="card">
          <div className={s.profile}>
            <div className={s.identity}>
              <div className={s.avatar} aria-hidden="true">
                {initial}
              </div>
              <div>
                <p className={s.displayName}>{user.display_name}</p>
                <p className={s.email}>{user.email}</p>
              </div>
            </div>
            <TrustGauge score={score} />
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>実績</h2>
        </div>
        <div className={s.stats}>
          <Stat label="総コミットメント" value={`${stats.total}`} />
          <Stat label="達成" value={`${stats.approved}`} tone={s.statOk} />
          <Stat label="ペナルティ執行" value={`${stats.penalized}`} tone={s.statBad} />
          <Stat label="進行中" value={`${stats.active}`} tone={s.statAccent} />
          <Stat label="支払総額" value={`¥${yen.format(stats.penalty_paid_yen)}`} />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>カード設定</h2>
        </div>
        <div className="card">
          <CardSetup card={card} onUpdated={load} />
        </div>
      </section>
    </>
  );
}
