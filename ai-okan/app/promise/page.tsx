"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PromiseForm } from "@/components/PromiseForm";
import { load, patch, type State } from "@/lib/store";
import type { Promise as Contract } from "@/lib/types";

export default function PromisePage() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = load();
    if (!s.profile) router.replace("/ingest");
    else setState(s);
  }, [router]);

  async function makePromise(contract: Contract) {
    setBusy(true);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "promise", promise: contract }),
      });
      const json = await res.json();
      setState(
        patch({ contract, promiseReply: json.okan, promiseEngine: json.engine }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  return (
    <PromiseForm
      busy={busy}
      reply={state.promiseReply}
      engine={state.promiseEngine}
      onSubmit={makePromise}
      onNext={() => router.push("/watch")}
    />
  );
}
