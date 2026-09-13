"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./PromiseHandbook.module.css";

type PromiseItem = {
  id: string;
  title: string;
  verification_rule: string;
  penalty_amount: number;
  deadline_at: string;
  status: string;
  proof_count: number;
  judgement_count: number;
  last_submission_at: string | null;
  judgement_status: string | null;
  confidence_score: string | number | null;
  reasoning: string | null;
};

type HandbookData = {
  user: { display_name: string };
  summary: {
    total: number;
    achieved: number;
    missed: number;
    active: number;
    decided: number;
    achievement_rate: number;
    proof_rate: number;
    average_confidence: number | null;
    protected_yen: number;
    paid_yen: number;
  };
  weekly: { label: string; achieved: number; missed: number }[];
  promises: PromiseItem[];
};

type Filter = "all" | "active" | "achieved" | "missed";

const ACTIVE = new Set(["ACTIVE", "SUBMITTED", "GRACE", "UNDER_REVIEW"]);
const LABELS: Record<string, string> = {
  ACTIVE: "進行中",
  SUBMITTED: "判定待ち",
  APPROVED: "達成",
  GRACE: "見守り中",
  UNDER_REVIEW: "確認中",
  PENALIZED: "未達",
  FAILED_PAYMENT: "未達",
  CANCELED: "中止",
};

const yen = new Intl.NumberFormat("ja-JP");
const date = new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className={s.meterWrap}>
      <div className={s.meterHead}><span>{label}</span><strong>{value}%</strong></div>
      <div className={s.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Trend({ data }: { data: HandbookData["weekly"] }) {
  const max = Math.max(1, ...data.map((item) => item.achieved + item.missed));
  return (
    <div className={s.trend} aria-label="直近6週間の判定結果">
      {data.map((item) => (
        <div className={s.trendColumn} key={item.label}>
          <div className={s.trendBars} title={`${item.label} 達成${item.achieved}件・未達${item.missed}件`}>
            <span className={s.trendEmpty} style={{ height: `${Math.max(4, (item.missed / max) * 74)}px` }} />
            <span className={s.trendDone} style={{ height: `${Math.max(4, (item.achieved / max) * 74)}px` }} />
          </div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function PromiseHandbook() {
  const [data, setData] = useState<HandbookData | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/handbook");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setData(body as HandbookData);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "手帳を読み込めませんでした");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === "active") return data.promises.filter((item) => ACTIVE.has(item.status));
    if (filter === "achieved") return data.promises.filter((item) => item.status === "APPROVED");
    if (filter === "missed") return data.promises.filter((item) => ["PENALIZED", "FAILED_PAYMENT"].includes(item.status));
    return data.promises;
  }, [data, filter]);

  if (error && !data) return <div className="card error">{error}<button className={s.retry} onClick={load}>再読み込み</button></div>;
  if (!data) return <div className={s.skeleton} aria-label="読み込み中"><span /><span /><span /></div>;

  const { summary } = data;
  const rate = summary.achievement_rate;
  const okanMessage = summary.total === 0
    ? "最初の約束、一緒に決めよか。小さく始めたらええねん。"
    : summary.active > 0
      ? `いま見守ってる約束は${summary.active}件。焦らんでええから、ひとつずつ片づけよ。`
      : rate >= 70
        ? `達成率${rate}%、よう続けてるやん。積み重ねはちゃんと残ってるで。`
        : "できなかった日も記録のうちや。次は続けられる大きさにしてみよ。";

  return (
    <div className={s.page}>
      {error && <div className="card error">{error}</div>}

      <section className={s.okanNote} aria-label="おかんからのひとこと">
        <span className={s.noteLabel}>おかんからのひとこと</span>
        <p>{okanMessage}</p>
      </section>

      <section className={s.hero} aria-labelledby="achievement-title">
        <div className={s.ring} style={{ "--rate": `${rate * 3.6}deg` } as React.CSSProperties}>
          <div><strong>{rate}</strong><span>%</span><small>達成率</small></div>
        </div>
        <div className={s.heroCopy}>
          <span className={s.eyebrow}>これまでの約束</span>
          <h2 id="achievement-title">{summary.achieved}件、守れました</h2>
          <p>判定済み {summary.decided}件中</p>
          <div className={s.legend}>
            <span><i className={s.dotDone} />達成 {summary.achieved}</span>
            <span><i className={s.dotMissed} />未達 {summary.missed}</span>
            <span><i className={s.dotActive} />進行中 {summary.active}</span>
          </div>
        </div>
      </section>

      <section className={s.metrics} aria-label="約束の詳細実績">
        <div className={s.metric}><span>守れた金額</span><strong>¥{yen.format(summary.protected_yen)}</strong><small>達成して回避</small></div>
        <div className={s.metric}><span>証跡提出率</span><strong>{summary.proof_rate}%</strong><small>記録を残した割合</small></div>
        <div className={s.metric}><span>AI判定確信度</span><strong>{summary.average_confidence ?? "—"}{summary.average_confidence !== null && "%"}</strong><small>平均スコア</small></div>
        <div className={s.metric}><span>ペナルティ</span><strong>¥{yen.format(summary.paid_yen)}</strong><small>執行済み総額</small></div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}><div><span>6週間の歩み</span><h2>がんばりの記録</h2></div><div className={s.miniLegend}><i className={s.dotDone} />達成 <i className={s.dotMissed} />未達</div></div>
        <div className={s.chartCard}><Trend data={data.weekly} /><Meter value={summary.proof_rate} label="証跡を残せた割合" /></div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}><div><span>約束一覧</span><h2>約束の記録</h2></div><strong className={s.count}>{visible.length}件</strong></div>
        <div className={s.filters} aria-label="約束を絞り込む">
          {([['all', 'すべて'], ['active', '進行中'], ['achieved', '達成'], ['missed', '未達']] as [Filter, string][]).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className={s.empty}><strong>ここにはまだ記録がありません</strong><p>新しい約束を作ると、この手帳に歩みが残ります。</p><Link href="/app">約束を作る</Link></div>
        ) : (
          <div className={s.promiseList}>
            {visible.map((item) => {
              const confidence = item.confidence_score === null ? null : Math.round(Number(item.confidence_score) * 100);
              return (
                <article className={s.promise} key={item.id}>
                  <div className={s.promiseTop}>
                    <span className={`${s.status} ${s[item.status] ?? ""}`}>{LABELS[item.status] ?? item.status}</span>
                    <time dateTime={item.deadline_at}>期限 {date.format(new Date(item.deadline_at))}</time>
                  </div>
                  <h3>{item.title}</h3>
                  <p className={s.rule}>{item.verification_rule}</p>
                  <dl>
                    <div><dt>証跡</dt><dd>{item.proof_count}件</dd></div>
                    <div><dt>AI判定</dt><dd>{item.judgement_count}回</dd></div>
                    <div><dt>確信度</dt><dd>{confidence === null ? "—" : `${confidence}%`}</dd></div>
                    <div><dt>約束額</dt><dd>¥{yen.format(item.penalty_amount)}</dd></div>
                  </dl>
                  {item.reasoning && <blockquote><span>おかんが気づいたこと</span>{item.reasoning}</blockquote>}
                  {ACTIVE.has(item.status) && <Link className={s.manage} href="/app">この約束を確認する <span aria-hidden="true">→</span></Link>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
