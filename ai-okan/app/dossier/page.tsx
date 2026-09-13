"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dossier } from "@/components/Dossier";
import { load, type State } from "@/lib/store";

export default function DossierPage() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const s = load();
    // 見立てがまだ無いなら、先に過去データを渡してもらう
    if (!s.profile) router.replace("/ingest");
    else setState(s);
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
