"use client";

import { useEffect, useRef, useState } from "react";

let unsupportedNoticeShown = false;

/**
 * Web Speech API による音声入力ボタン。
 * サーバー側の音声認識（Speech-to-Text API）を使わずブラウザ内で完結させることで、
 * 音声データのアップロードもコストも発生しない。Chrome / Edge / Safari で動作する。
 * 非対応ブラウザでは一度だけ案内を表示し、キーボード入力にフォールバックする。
 */
export default function VoiceInput({
  onResult,
  label = "音声入力",
}: {
  onResult: (text: string) => void;
  label?: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [showUnsupported, setShowUnsupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const recRef = useRef<any>(null);
  const resultRef = useRef(onResult);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  resultRef.current = onResult;

  const stopMeter = (resetVolume = true) => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    if (resetVolume) setVolume(0);
  };

  const startMeter = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    streamRef.current = stream;
    audioContextRef.current = context;

    const measure = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      setVolume(Math.min(1, average / 90));
      animationRef.current = requestAnimationFrame(measure);
    };
    measure();
  };

  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      let wasShown = unsupportedNoticeShown;
      try {
        wasShown = wasShown || sessionStorage.getItem("commitpay-voice-unsupported") === "1";
        if (!wasShown) sessionStorage.setItem("commitpay-voice-unsupported", "1");
      } catch {
        // sessionStorage が使えない場合も、このページ内では一度だけ表示する
      }
      if (!wasShown) {
        unsupportedNoticeShown = true;
        setShowUnsupported(true);
      }
      return;
    }
    setSupported(true);

    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText) resultRef.current(finalText);
    };
    rec.onerror = (event: { error: string }) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("マイクを利用できません。ブラウザのサイト設定でマイクを許可して、もう一度お試しください。");
      } else if (event.error === "no-speech") {
        setError("聞き取れませんでした。周囲の音を確認して、もう一度お試しください。");
      } else if (event.error !== "aborted") {
        setError("音声入力でエラーが発生しました。もう一度お試しください。");
      }
      setListening(false);
      setInterim("");
      stopMeter();
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      stopMeter();
    };

    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {}
      stopMeter(false);
    };
    // 音声認識インスタンスはマウント中に一度だけ作る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (supported === null) return null;
  if (!supported) {
    return showUnsupported ? <span className="voice-error">このブラウザは音声入力に非対応です</span> : null;
  }

  const toggle = async () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      stopMeter();
    } else {
      setError(null);
      try {
        await startMeter();
        rec.start();
        setListening(true);
      } catch (caught) {
        stopMeter();
        const denied = caught instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(caught.name);
        setError(denied
          ? "マイクが拒否されています。ブラウザのサイト設定からマイクを許可してください。"
          : "音声入力を開始できませんでした。もう一度お試しください。");
      }
    }
  };

  return (
    <span className="voice-input">
      <span className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="ghost mic"
          data-listening={listening}
          onClick={toggle}
          title={label}
          aria-label={listening ? "音声入力を停止" : label}
        >
          {listening ? "● 録音中 停止" : "🎤 " + label}
        </button>
        {listening && (
          <span className="volume-meter" aria-hidden="true">
            <span style={{ width: `${Math.max(5, volume * 100)}%` }} />
          </span>
        )}
        {interim && <span className="muted voice-interim">{interim}</span>}
      </span>
      {error && <span className="voice-error" role="alert">{error}</span>}
    </span>
  );
}
