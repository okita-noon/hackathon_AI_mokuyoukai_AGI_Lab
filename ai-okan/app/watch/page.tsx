"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
  const urlContract = useMemo(
    () => contractFromParams(new URLSearchParams(params.toString())),
    [params],
  );
  const [storedContract, setStoredContract] = useState<Contract | null>(null);

  useEffect(() => {
    // まずURLの引数を見る。無ければ保存された状態から拾う
    if (urlContract) return;
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      // 約束を結んでいないうちは監視するものがない
      if (!s.contract) router.replace(s.profile ? "/promise" : "/ingest");
      else setStoredContract(s.contract);
    });
    return () => {
      alive = false;
    };
  }, [router, urlContract]);

  const contract = urlContract ?? storedContract;

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
