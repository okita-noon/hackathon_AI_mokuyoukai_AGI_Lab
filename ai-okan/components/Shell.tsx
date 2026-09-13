"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StepDots } from "./ui";
import { STEP_PATHS } from "@/lib/store";

/** 全ページ共通の枠。いま何ステップ目かはURLから決める */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const step = STEP_PATHS.indexOf(pathname as (typeof STEP_PATHS)[number]) + 1;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:py-14">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent pb-4">
        <Link href="/" className="text-left">
          <p className="text-xl font-bold">AIおかん</p>
          <p className="text-xs text-muted">自分以上に自分を知っているAI</p>
        </Link>
        {step > 0 && <StepDots step={step} />}
      </div>

      {children}

      <footer className="mt-16 border-t border-line pt-6 text-xs text-muted">
        <p>ハッカソン20260913 / AI木曜会 × AGI Lab</p>
        <p className="mt-1">
          約束と判定結果はサーバーに保存します。AI利用時は入力内容と提出した証拠をAIサービスに送信します。写真・動画そのものはアプリのDBに保存しません。
        </p>
        <p className="mt-2">体験用デモです。罰金は記録のみで、実際の課金・送金はありません。</p>
      </footer>
    </main>
  );
}
