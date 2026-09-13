"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Watch } from "@/components/Watch";
import { loadState, reset } from "@/lib/store";
import { contractFromParams } from "@/lib/handoff";
import type { Promise as Contract } from "@/lib/types";

export default function WatchPage() {
  return (
    <Suspense fallback={null}>
      <WatchScreen />
    </Suspense>
  );
}

function WatchScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [contract, setContract] = useState<Contract | null>(null);

  useEffect(() => {
    // まずURLの引数を見る。無ければ保存された状態から拾う
    const fromUrl = contractFromParams(new URLSearchParams(params.toString()));
    if (fromUrl) {
      setContract(fromUrl);
      return;
    }
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      // 約束を結んでいないうちは監視するものがない
      if (!s.contract) router.replace(s.profile ? "/promise" : "/ingest");
      else setContract(s.contract);
    });
    return () => {
      alive = false;
    };
  }, [params, router]);

  if (!contract) return null;

  return (
    <Watch
      contract={contract}
      onReset={async () => {
        await reset();
        router.push("/");
      }}
    />
  );
}
