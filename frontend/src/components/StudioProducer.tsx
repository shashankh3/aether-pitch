"use client";
// AETHER PITCH — "The 12th Man" autonomous studio producer: AI lower-third
// overlays, causal explainability and instant match recap modal.

import { Clapperboard, Film, Mic, X, Zap } from "lucide-react";
import type { Insight, Recap } from "@/lib/types";

interface Props {
  latest: Insight | null;
  recap: Recap | null;
  onCloseRecap: () => void;
}

export default function StudioProducer({ latest, recap, onCloseRecap }: Props) {
  return (
    <>
      {/* Persistent Co-Pilot card, pinned as a broadcast overlay */}
      <section className="glass absolute bottom-3 left-4 z-20 w-[400px] border-l-2 border-pitch/70 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.24em] text-slate-300">
            <Clapperboard size={13} className="text-pitch" /> The 12th Man · Co-Pilot
          </h2>
          {latest && (
            <span className="max-w-[130px] truncate font-tech text-[9.5px] font-semibold uppercase text-slate-600" title={latest.model}>
              {latest.model}
            </span>
          )}
        </div>
        {latest && (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="clip-skew mt-0.5 shrink-0 bg-crimson/20 px-1.5 py-0.5 font-tech text-[9.5px] font-bold uppercase tracking-wider text-crimson">
                {latest.stage_d_broadcast_overlay.overlay_type.replace(/_/g, " ")}
              </span>
              <p className="text-[12.5px] font-bold leading-snug text-slate-100">
                {latest.stage_c_explainability.moment_headline}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-amber-300/90">
              <Zap size={10} />
              {latest.stage_c_explainability.tactical_catalyst}
            </div>
          </div>
        )}
        {!latest && (
          <p className="text-[11px] text-slate-500">
            Watching the entropy curve… lower-thirds fire automatically on threshold breach.
          </p>
        )}
      </section>

      {/* Instant studio recap modal */}
      {recap && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm">
          <div className="glass scroll-slim max-h-full w-[560px] overflow-y-auto rounded-xl border-tactical/30 p-5 shadow-2xl animate-slide-up">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold tracking-[0.25em] text-pitch">
                  <Film size={11} /> STUDIO MATCH RECAP · {recap.timecode}
                </div>
                <h3 className="text-lg font-bold leading-snug text-slate-100">{recap.title}</h3>
                <div className="mt-1 font-mono text-[11px] text-slate-400">
                  NLA {recap.score.NLA} — {recap.score.MCS} MCS
                </div>
              </div>
              <button
                onClick={onCloseRecap}
                className="rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <ol className="space-y-3">
              {recap.items.map((item, i) => (
                <li key={i} className="glass-soft rounded-lg p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-tactical/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tactical">
                      {i + 1} · {item.clock}
                    </span>
                    <span className="text-[12px] font-bold text-slate-100">{item.headline}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-start gap-2 border-t border-white/10 pt-3">
              <Mic size={12} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-[11px] italic leading-relaxed text-amber-200/90" dir="rtl">
                  {recap.translations.ar}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  ES: {recap.translations.es}
                </p>
                <p className="text-[10px] text-slate-500">HI: {recap.translations.hi}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
