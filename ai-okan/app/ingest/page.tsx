"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ingest } from "@/components/Ingest";
import { ErrorNote } from "@/components/ErrorNote";
import { patch } from "@/lib/store";

export default function IngestPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buildProfile(extra: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "profile", extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "見立てを作成できませんでした");
      patch({ profile: json.profile, engine: json.engine, step: 2, contract: null, promiseReply: null, promiseEngine: null });
      router.push("/dossier");
    } catch (e) {
      setError(e instanceof Error ? e.message : "見立てを作成できませんでした");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ErrorNote message={error} />
      <Ingest busy={busy} onDone={buildProfile} />
    </div>
  );
}
