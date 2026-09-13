"use client";

import { useState } from "react";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import s from "@/app/mypage/mypage.module.css";

export type Card = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

/** NEXT_PUBLIC_* はビルド時に文字列として埋め込まれるので、必ずリテラルで参照する */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

// loadStripe はモジュールスコープで1回だけ呼ぶ（再レンダーごとに Stripe.js を読み直さないため）。
// キー未設定ならそもそも読み込まない = ネットワークにも出さない。
const stripePromise: Promise<Stripe | null> | null = PUBLISHABLE_KEY
  ? loadStripe(PUBLISHABLE_KEY)
  : null;

const MOCK_MODE_TEXT =
  "テストモード: Stripeキーが未設定のため、ペナルティは実際には課金されず MOCKED として記録されます";

/** Stripe Elements のダークテーマ設定（globals.css の配色に合わせる） */
const APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "night",
  variables: {
    colorPrimary: "#6c8cff",
    colorBackground: "#151922",
    colorText: "#e8ecf3",
    colorTextSecondary: "#8e99ad",
    colorDanger: "#ff6b6b",
    borderRadius: "8px",
    fontFamily: 'ui-sans-serif, system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif',
  },
};

function TestCardHint() {
  return (
    <div className={s.testCard}>
      <span className={s.testCardLabel}>
        テスト用カード番号（Stripe テストモード専用。実在のカードではありません）
      </span>
      <span className={s.testCardNumber}>4242 4242 4242 4242</span>
      <span className={s.testCardLabel}>
        有効期限は未来の日付、CVCと郵便番号は任意の値で通ります。
      </span>
    </div>
  );
}

function MockNotice({ message }: { message?: string | null }) {
  return (
    <div className={s.notice}>
      <span className={s.noticeTitle}>テストモード（Stripe未接続）</span>
      <p className={s.noticeBody}>{MOCK_MODE_TEXT}</p>
      {message && <p className={s.noticeBody}>サーバーからの応答: {message}</p>}
    </div>
  );
}

/** Elements の内側でしか useStripe / useElements は使えないので、フォームを別コンポーネントに切る */
function CardForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        // 3Dセキュア等でリダイレクトが必要なときだけ遷移させる（テストカードでは遷移しない）
        redirect: "if_required",
        confirmParams: {
          return_url: typeof window !== "undefined" ? `${window.location.origin}/mypage` : undefined,
        },
      });
      if (error) throw new Error(error.message ?? "カードの登録に失敗しました");
      if (!setupIntent?.id) throw new Error("SetupIntent が取得できませんでした");

      // 本番では setup_intent.succeeded Webhook がこの保存を担う（confirm-setup のコメント参照）
      const r = await fetch("/api/stripe/confirm-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      await onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "カードの登録に失敗しました");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={s.elementsBox}>
      <PaymentElement options={{ layout: "tabs" }} />
      <TestCardHint />
      {err && <p className={s.error}>{err}</p>}
      <div className={s.actions}>
        <button type="submit" disabled={!stripe || busy}>
          {busy ? "登録中..." : "このカードを登録する"}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

export default function CardSetup({
  card,
  onUpdated,
}: {
  card: Card | null;
  onUpdated: () => void | Promise<void>;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [mockMessage, setMockMessage] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function begin() {
    setErr(null);
    setSaved(false);
    // publishable key が無いと Elements は初期化できない。課金もモックになるので同じ案内に倒す。
    if (!stripePromise) {
      setMock(true);
      setMockMessage("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY が未設定です");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/stripe/setup-intent", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      if (d.mock) {
        setMock(true);
        setMockMessage(d.message ?? null);
        return;
      }
      if (!d.clientSecret) throw new Error("clientSecret が返りませんでした");
      setClientSecret(d.clientSecret);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "カード登録を開始できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaved() {
    setClientSecret(null);
    setSaved(true);
    await onUpdated();
  }

  return (
    <div className={s.cardSetup}>
      {card ? (
        <div className={s.savedCard}>
          <span className={s.brand}>{card.brand}</span>
          <span className={s.cardNumber}>•••• {card.last4}</span>
          <span className={s.cardExp}>
            有効期限 {String(card.exp_month).padStart(2, "0")}/{card.exp_year}
          </span>
        </div>
      ) : (
        <p className={s.empty}>
          カードは未登録です。未達だったときのペナルティを実際に執行するには、カードの登録が必要です。
        </p>
      )}

      {saved && <p className={s.success}>カードを登録しました。</p>}

      {mock && <MockNotice message={mockMessage} />}
      {mock && !card && <TestCardHint />}

      {clientSecret && stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: APPEARANCE, locale: "ja" }}>
          <CardForm onSaved={handleSaved} onCancel={() => setClientSecret(null)} />
        </Elements>
      ) : (
        !mock && (
          <div className={s.actions}>
            <button onClick={begin} disabled={busy}>
              {busy ? "準備中..." : card ? "カードを変更する" : "カードを登録する"}
            </button>
            {err && <p className={s.error}>{err}</p>}
          </div>
        )
      )}
    </div>
  );
}
