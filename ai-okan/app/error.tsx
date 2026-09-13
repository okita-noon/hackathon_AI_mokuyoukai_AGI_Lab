"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="space-y-5 py-12">
      <h1 className="text-2xl font-bold">画面を表示できませんでした</h1>
      <p>一時的な問題の可能性があります。保存済みの約束はそのままに、もう一度読み込めます。</p>
      <button onClick={retry} className="rounded-xl bg-accent px-6 py-3 font-bold text-white">もう一度読み込む</button>
      <p><Link href="/" className="underline">スタートページへ戻る</Link></p>
    </section>
  );
}
