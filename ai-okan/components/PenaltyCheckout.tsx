"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "./ui";

type State =
  | { status: "loading" }
  | { status: "unpaid"; url: string; qr: string | null; testMode: boolean }
  | { status: "paid" }
  | { status: "error"; message: string };

const POLL_MS = 3000;

/**
 * 期限切れ画面に出す罰金の支払い欄。
 * PC のデモではスマホで QR を読んで払い、PC 側はポーリングで支払い完了に切り替わる。
 */
export function PenaltyCheckout({ commitmentId, amount }: { commitmentId: string; amount: number }) {
  const [state, setState] = useState<State>({ status: "loading" });
  // 増やすと支払い画面を作り直す（セッションの期限切れ・エラーからの再試行）
  const [attempt, setAttempt] = useState(0);
  const [paying, setPaying] = useState(false);

  async function payWithTestCard() {
    setPaying(true);
    try {
      const res = await fetch("/api/penalty/test-pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commitmentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "テスト決済に失敗しました");
      setState({ status: "paid" });
    } catch (cause) {
      setState({ status: "error", message: cause instanceof Error ? cause.message : "テスト決済に失敗しました" });
    } finally {
      setPaying(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/penalty/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ commitmentId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "支払い画面を用意できませんでした");
        if (json.status === "paid") {
          if (!cancelled) setState({ status: "paid" });
          return;
        }
        const qr = await QRCode.toDataURL(json.url, { margin: 1, width: 320 }).catch(() => null);
        if (!cancelled) setState({ status: "unpaid", url: json.url, qr, testMode: Boolean(json.testMode) });
      } catch (cause) {
        if (!cancelled) {
          setState({ status: "error", message: cause instanceof Error ? cause.message : "支払い画面を用意できませんでした" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commitmentId, attempt]);

  useEffect(() => {
    if (state.status !== "unpaid") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/penalty/checkout?commitmentId=${encodeURIComponent(commitmentId)}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (json?.status === "paid") setState({ status: "paid" });
      else if (json?.status === "expired") setAttempt((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [state.status, commitmentId]);

  const yen = `¥${amount.toLocaleString()}`;

  if (state.status === "loading") {
    return <p aria-live="polite" className="text-muted">支払い画面を用意しています…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm font-bold text-danger">{state.message}</p>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>もう一度試す</Button>
      </div>
    );
  }

  if (state.status === "paid") {
    return (
      <div aria-live="polite" className="mx-auto max-w-md rounded-xl border-2 border-ok bg-white p-5 font-bold text-ok">
        ✓ 罰金 {yen} の支払いを確認しました
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border-2 border-danger bg-white p-6 text-left">
      <p className="font-bold">罰金 {yen} を払ってな</p>
      <div className="flex flex-wrap items-center gap-6">
        {state.qr && (
          // Locally generated QR data URL; do not send payment URLs to an image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.qr} alt="支払い画面のQRコード" width={160} height={160} className="rounded-lg border border-line" />
        )}
        <div className="min-w-48 flex-1 space-y-3">
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-danger px-7 py-2.5 font-bold text-white transition hover:bg-accent-soft"
          >
            支払い画面を開く
          </a>
          <p className="text-xs text-muted">スマホで QR を読んでも払えます。支払いが終わるとこの画面も切り替わります。</p>
        </div>
      </div>
      {state.testMode && (
        <div className="space-y-3 rounded-lg bg-bg-soft px-4 py-3">
          <Button variant="secondary" onClick={payWithTestCard} disabled={paying}>
            {paying ? "決済しています…" : "テストカードで支払う（デモ用）"}
          </Button>
          <p className="text-xs text-muted">
            テストモード：ボタンを押すと Stripe のテストカード（Visa）で決済します。実際には請求されません。
            支払い画面から払う場合はカード番号 4242 4242 4242 4242、有効期限は未来の日付、CVC は任意の3桁。
          </p>
        </div>
      )}
    </div>
  );
}
