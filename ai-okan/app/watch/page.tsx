"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Watch } from "@/components/Watch";
import { loadState, reset } from "@/lib/store";
import type { AppState } from "@/lib/types";

export default function WatchPage() {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      // 約束を結んでいないうちは監視するものがない
      if (!s.contract) router.replace(s.profile ? "/promise" : "/ingest");
      else setState(s);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  if (!state?.contract) return null;

  return (
    <Watch
      contract={state.contract}
      onReset={async () => {
        await reset();
        router.push("/");
      }}
    />
  );
}
