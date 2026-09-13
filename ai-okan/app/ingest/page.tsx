"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ingest } from "@/components/Ingest";
import { patch } from "@/lib/store";

export default function IngestPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function buildProfile(extra: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "profile", extra }),
      });
      const json = await res.json();
      patch({ profile: json.profile, engine: json.engine });
      router.push("/dossier");
    } catch {
      setBusy(false);
    }
  }

  return <Ingest busy={busy} onDone={buildProfile} />;
}
