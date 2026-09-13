"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 音声証跡の録音。MediaRecorder でブラウザ内で完結させる。
 * スマホの `<input type="file" accept="audio/*">` でも録音はできるが、
 * PCでは録音アプリが起動しないためデモが成立しない。
 */
export default function AudioRecorder({ onRecorded, disabled }: { onRecorded: (f: File) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari は audio/webm を出せないので、対応している形式を選ぶ
      const mimeType = ["audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        onRecorded(new File([blob], `proof.${type === "audio/mp4" ? "m4a" : "webm"}`, { type }));
      };
      rec.start();
      recRef.current = rec;
      setSeconds(0);
      setRecording(true);
    } catch (e: any) {
      setErr(
        e?.name === "NotAllowedError"
          ? "マイクの使用が許可されていません。ブラウザの設定から許可してください。"
          : "録音を開始できませんでした。",
      );
    }
  };

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <div>
      <button type="button" className="ghost" disabled={disabled} onClick={recording ? stop : start}>
        {recording ? `● 録音中 ${seconds}秒 — 停止して提出` : "🎙 録音して提出する"}
      </button>
      {err && <p className="voice-error">{err}</p>}
    </div>
  );
}
