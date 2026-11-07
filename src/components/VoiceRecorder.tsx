"use client";

import { useEffect, useState } from "react";

const MAX_VOICE_SECONDS = 30;

export default function VoiceRecorder({ onChange }: { onChange: (b: Blob | null) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);

  useEffect(() => {
    if (rec && secs >= MAX_VOICE_SECONDS) rec.stop();
  }, [rec, secs]);

  const start = async () => {
    setErr(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("Voice notes aren't supported on this browser. A written thank-you works too.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType.split(";")[0] || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        onChange(blob);
        setRec(null);
      };
      setSecs(0);
      r.start();
      setRec(r);
    } catch {
      setErr("Couldn't use the microphone. A written thank-you works too.");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-sunrise-50 p-3 text-sm">
      {rec ? (
        <button type="button" onClick={() => rec.stop()} className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white">
          ⏹ Stop recording ({MAX_VOICE_SECONDS - secs}s left)
        </button>
      ) : url ? (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls src={url} className="h-10 max-w-full" />
          <button
            type="button"
            onClick={() => {
              setUrl(null);
              onChange(null);
            }}
            className="underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <button type="button" onClick={start} className="rounded-lg bg-white px-3 py-2 font-semibold">
          🎙️ Record a voice note (up to {MAX_VOICE_SECONDS}s)
        </button>
      )}
      {err && <p>{err}</p>}
    </div>
  );
}
