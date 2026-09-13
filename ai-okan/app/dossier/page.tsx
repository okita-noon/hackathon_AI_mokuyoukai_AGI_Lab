"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dossier } from "@/components/Dossier";
import { loadState } from "@/lib/store";
import type { AppState } from "@/lib/types";

export default function DossierPage() {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      // おかんが何も見ていない状態なら、先に過去データを見せてもらう
      if (!s.profile) router.replace("/ingest");
      else setState(s);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  if (!state?.profile) return null;

  return (
    <Dossier
      profile={state.profile}
      engine={state.engine}
      onNext={() => router.push("/promise")}
    />
  );
}
