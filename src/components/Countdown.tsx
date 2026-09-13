"use client";

import { useEffect, useState } from "react";

type Props = {
  status: string;
  deadlineAt: string;
  graceExpiresAt: string | null;
  serverOffsetMs?: number;
};

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [
    days > 0 ? `${days}日` : null,
    days > 0 || hours > 0 ? `${hours}時間` : null,
    `${minutes}分`,
    `${seconds}秒`,
  ].filter(Boolean).join(" ");
}

export default function Countdown({ status, deadlineAt, graceExpiresAt, serverOffsetMs = 0 }: Props) {
  const target = status === "GRACE" ? graceExpiresAt : status === "ACTIVE" ? deadlineAt : null;
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);

  useEffect(() => {
    const update = () => setNow(Date.now() + serverOffsetMs);
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [serverOffsetMs, target]);

  if (!target) return null;

  const remaining = Date.parse(target) - now;
  if (remaining <= 0) {
    return <div className="countdown countdown-expired">ワーカーの実行待ち</div>;
  }

  const urgency = remaining < 10 * 60 * 1_000
    ? "countdown-danger"
    : remaining < 60 * 60 * 1_000
      ? "countdown-warning"
      : "";

  return (
    <div className={`countdown ${urgency}`} aria-live="polite">
      <span>{status === "GRACE" ? "課金まで" : "締切まで"}</span>
      <strong>{formatRemaining(remaining)}</strong>
    </div>
  );
}
