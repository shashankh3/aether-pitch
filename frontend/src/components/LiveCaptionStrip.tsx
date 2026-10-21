"use client";

import { useSpeechController } from "@/hooks/useSpeechController";

const BAR_HEIGHTS = [8, 15, 11, 18, 7];

export default function LiveCaptionStrip() {
  const { activeText, isSpeaking, isVoiceMuted, lang } = useSpeechController();
  if (!activeText) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[82px] z-30 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="clip-chamfer flex max-w-[min(780px,92vw)] items-start gap-2.5 border border-white/15 bg-black/75 px-3 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <div className="mt-1 flex h-5 shrink-0 items-center gap-[2px]" aria-hidden="true">
          {BAR_HEIGHTS.map((height, i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-tactical ${isSpeaking ? "caption-bar" : "opacity-50"}`}
              style={{
                height,
                animationDelay: `${i * 0.11}s`,
                animationDuration: `${0.72 + (i % 3) * 0.12}s`,
              }}
            />
          ))}
        </div>
        <span className="clip-skew mt-0.5 shrink-0 bg-tactical/20 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-tactical">
          {lang.toUpperCase()}
        </span>
        <p
          className="text-[12.5px] font-medium leading-snug text-slate-100"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          {activeText}
        </p>
        <span className="mt-0.5 shrink-0 font-tech text-[8.5px] font-bold uppercase tracking-widest text-slate-500">
          CC {isVoiceMuted ? "· MUTED" : isSpeaking ? "· LIVE" : "· READY"}
        </span>
      </div>
    </div>
  );
}
