"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PromiseForm } from "@/components/PromiseForm";
import { ErrorNote } from "@/components/ErrorNote";
import { loadState, patch } from "@/lib/store";
import { contractToParams } from "@/lib/handoff";
import type { AppState, Promise as Contract } from "@/lib/types";

export default function PromisePage() {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      if (!s.profile) router.replace("/ingest");
      else setState(s);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  async function makePromise(contract: Contract) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "promise", promise: contract }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "約束を結べませんでした");
      // サーバーが約束を保存できた場合はそのid付きの内容を使う
      const agreed: Contract = json.contract ?? contract;
      setState(
        patch({
          contract: agreed,
          promiseReply: json.okan,
          promiseEngine: json.engine,
          step: 4,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "約束を保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  return (
    <div className="space-y-6">
      <ErrorNote message={error} />
      <PromiseForm
        busy={busy}
        reply={state.promiseReply}
        engine={state.promiseEngine}
        onSubmit={makePromise}
        onNext={() =>
          router.push(
            state.contract ? `/watch?${contractToParams(state.contract)}` : "/watch",
          )
        }
      />
    </div>
  );
}
