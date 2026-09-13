"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Watch } from "@/components/Watch";
import { load, reset, type State } from "@/lib/store";

export default function WatchPage() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const s = load();
    // 約束を結んでいないうちは監視するものがない
    if (!s.contract) router.replace(s.profile ? "/promise" : "/ingest");
    else setState(s);
  }, [router]);

  if (!state?.contract) return null;

  return (
    <Watch
      contract={state.contract}
      onReset={() => {
        reset();
        router.push("/");
      }}
    />
  );
}
