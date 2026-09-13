type Judgement = {
  status: string;
  confidence_score: number | string;
  reasoning: string;
  suspicious_indicators: string[];
  detected_elements?: string[];
  appeal_recommended: boolean;
  agent?: string;
};

type Props = {
  judgement: Judgement;
  commitmentStatus: string;
  appealStatus: string | null;
};

const suspiciousLabels: Record<string, { label: string; description: string }> = {
  reused_image: { label: "使い回しの疑い", description: "過去の提出と同じ画像が検出されました" },
  exif_time_mismatch: { label: "撮影時刻の不一致", description: "撮影時刻が対象期間外です" },
  screen_capture: { label: "再撮影の疑い", description: "画面や紙を撮影した可能性があります" },
  synthetic_image: { label: "生成画像の疑い", description: "AI生成に特有の不整合が見られます" },
  metadata_absent: { label: "メタデータなし", description: "撮影情報が失われています" },
  prompt_injection_attempt: { label: "不正な指示の検出", description: "AIへの指示を埋め込む試みが検出されました" },
  off_topic: { label: "目標と無関係", description: "目標に関係のない画像です" },
};

const judgementLabels: Record<string, string> = {
  APPROVED: "達成",
  REJECTED: "未達成",
  UNCERTAIN: "判定不能",
};

const agentLabels: Record<string, string> = {
  judge: "一次判定AI",
  arbiter: "調停AI",
  system: "システム自動判定",
};

function ConfidenceGauge({ score }: { score: number | string }) {
  const numericScore = Number(score);
  const normalized = Number.isFinite(numericScore) ? Math.min(1, Math.max(0, numericScore)) : 0;
  const percent = Math.round(normalized * 100);

  return (
    <div className="confidence" aria-label={`AIの確信度 ${percent}%`}>
      <div className="confidence-head">
        <span>AIの確信度</span>
        <strong>{percent}%</strong>
      </div>
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${percent}%` }} />
        <div className="confidence-threshold" title="自動確定の閾値 75%" />
      </div>
      <div className="confidence-scale"><span>0%</span><span>自動確定 75%</span><span>100%</span></div>
    </div>
  );
}

function Timeline({ judgement, commitmentStatus, appealStatus }: Props) {
  const hasAppeal = Boolean(appealStatus) || judgement.agent === "arbiter";
  const finalStatuses = ["APPROVED", "PENALIZED", "FAILED_PAYMENT", "CANCELED"];
  const isFinal = finalStatuses.includes(commitmentStatus);
  const wasSubmitted = judgement.agent !== "system";
  const stages = [
    { label: "作成", detail: "コミットメントを登録", done: true },
    { label: "提出", detail: wasSubmitted ? "証拠画像を提出" : "期限までに証拠が未提出", done: wasSubmitted },
    {
      label: judgement.agent === "system" ? "自動判定" : "一次判定",
      detail: agentLabels[judgement.agent ?? "judge"] ?? "AI判定",
      done: true,
    },
    {
      label: "異議・調停",
      detail: hasAppeal ? `異議申し立て: ${appealStatus ?? "判定済み"}` : "必要な場合に申し立て可能",
      done: hasAppeal,
      optional: !hasAppeal,
    },
    {
      label: "執行・免責",
      detail: isFinal ? commitmentStatus : commitmentStatus === "GRACE" ? "猶予期間中（まだ課金されません）" : "判定確定後に反映",
      done: isFinal,
      current: commitmentStatus === "GRACE",
    },
  ];

  return (
    <div className="judgement-timeline" aria-label="判定タイムライン">
      {stages.map((stage) => (
        <div className={`timeline-step ${stage.done ? "done" : ""} ${stage.current ? "current" : ""}`} key={stage.label}>
          <span className="timeline-dot" aria-hidden="true" />
          <div>
            <strong>{stage.label}</strong>
            <span>{stage.detail}{stage.optional ? "（任意）" : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function JudgementDetails(props: Props) {
  const { judgement } = props;
  return (
    <div className="judgement-details">
      <div className="row">
        <span className={`badge ${judgement.status}`}>{judgementLabels[judgement.status] ?? judgement.status}</span>
        <span className="muted">{agentLabels[judgement.agent ?? "judge"] ?? "AI判定"}</span>
      </div>

      {judgement.status === "UNCERTAIN" && (
        <div className="uncertain-note">
          この時点では課金されません。内容を確認し、必要なら異議申し立てで調停AIの再判定を受けられます。
        </div>
      )}

      <p className="judgement-reason">{judgement.reasoning}</p>
      <ConfidenceGauge score={judgement.confidence_score} />

      {judgement.detected_elements && judgement.detected_elements.length > 0 && (
        <div className="detected-elements">
          <span className="muted">画像から確認できた要素</span>
          <div>{judgement.detected_elements.map((element) => <span className="tag" key={element}>{element}</span>)}</div>
        </div>
      )}

      {judgement.suspicious_indicators.length > 0 && (
        <div className="signals">
          <span className="muted">検出された注意シグナル</span>
          {judgement.suspicious_indicators.map((indicator) => {
            const copy = suspiciousLabels[indicator] ?? { label: indicator, description: "追加の確認が必要なシグナルです" };
            return (
              <div className="signal" key={indicator}>
                <strong>⚠ {copy.label}</strong>
                <span>{copy.description}</span>
              </div>
            );
          })}
        </div>
      )}

      <Timeline {...props} />
    </div>
  );
}
