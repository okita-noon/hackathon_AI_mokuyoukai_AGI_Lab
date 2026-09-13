import Link from "next/link";
import { confirmCheckoutSession } from "@/lib/backend/payment";

export const dynamic = "force-dynamic";

/** Stripe Checkout からの戻り先。ここでも Stripe に問い合わせて支払いを確定させる */
export default async function PenaltyPaidPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const result = sessionId ? await confirmCheckoutSession(sessionId).catch(() => null) : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-6 py-16 text-center">
      {result?.paid ? (
        <>
          <p className="text-sm font-bold tracking-widest text-muted">支払い完了</p>
          <p className="text-6xl font-bold tabular-nums">¥{result.amount.toLocaleString()}</p>
          <p className="text-lg font-bold">よう払た。お金より、約束の重さを覚えときや。</p>
        </>
      ) : (
        <>
          <p className="text-lg font-bold">支払いを確認できませんでした。</p>
          <p className="text-muted">決済が終わっていないか、リンクが正しくありません。</p>
        </>
      )}
      <Link href="/" className="inline-block font-bold text-accent underline">
        AIおかんに戻る
      </Link>
    </main>
  );
}
