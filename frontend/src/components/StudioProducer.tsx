"use client";
// AETHER PITCH v2.0 — "The 12th Man" autonomous studio producer:
// compact AI director card in the right dock + instant studio recap modal
// + the camera_directive readout (what the AI cam is doing and why).

import { Clapperboard, Film, Mic, X, Zap, Camera } from "lucide-react";
import type { Insight, Recap } from "@/lib/types";

interface Props {
  latest: Insight | null;
  recap: Recap | null;
  onCloseRecap: () => void;
}

const CAM_LABELS: Record<string, string> = {
  ACTION_ZOOM: "Action Zoom",
  TACTICAL_DRONE: "Tactical Drone",
  PLAYER_LOCK_3RD_PERSON: "Pro Cam",
  TELE_BROADCAST: "Tele Cam",
};

export default function StudioProducer({ latest, recap, onCloseRecap }: Props) {
  const dir = latest?.camera_directive;
  return (
    <>
      <section className="clip-ea pointer-events-auto shrink-0 border border-white/15 bg-slate-950/78 px-3 py-2.5 backdrop-blur-xl">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.22em] text-slate-200">
            <Clapperboard size={12} className="text-pitch" /> The 12th Man
          </h2>
          {latest && (
            <span className="max-w-[120px] truncate font-tech text-[9px] uppercase text-slate-600" title={latest.model}>
              {latest.model}
            </span>
          )}
        </div>
        {dir && (
          <div className="clip-skew mb-1.5 flex items-center gap-1.5 bg-gold/10 px-2 py-0.5">
            <Camera size={10} className="text-gold" />
            <span className="font-tech text-[9.5px] font-bold uppercase tracking-wider text-gold">
              AI Cam → {CAM_LABELS[dir.recommended_mode] ?? dir.recommended_mode}
              {dir.cinematic_slow_mo ? " · SLO-MO" : ""} · {dir.ar_highlight_zone.replace(/_/g, " ")}
            </span>
          </div>
        )}
        {latest && (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="clip-skew mt-0.5 shrink-0 bg-crimson/20 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-crimson">
                {latest.stage_d_broadcast_overlay.overlay_type.replace(/_/g, " ")}
              </span>
              <p className="text-[12px] font-bold leading-snug text-slate-100">
                {latest.stage_c_explainability.moment_headline}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-amber-300/90">
              <Zap size={10} />
              {latest.stage_c_explainability.tactical_catalyst}
            </div>
          </div>
        )}
        {!latest && (
          <p className="text-[11px] text-slate-500">
            Watching the entropy curve… camera swoops + lower-thirds fire on threshold breach.
          </p>
        )}
      </section>

      {/* Instant studio recap modal */}
      {recap && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm">
          <div className="clip-ea scroll-slim max-h-full w-[560px] overflow-y-auto border border-tactical/30 bg-slate-950/95 p-5 shadow-2xl animate-slide-up">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-pitch">
                  <Film size={11} /> Studio Match Recap · {recap.timecode}
                </div>
                <h3 className="font-display text-[24px] font-bold leading-snug text-slate-100">{recap.title}</h3>
                <div className="mt-1 font-tech text-[12px] text-slate-400">
                  NLA {recap.score.NLA} — {recap.score.MCS} MCS
                </div>
              </div>
              <button
                onClick={onCloseRecap}
                className="p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <ol className="space-y-3">
              {recap.items.map((item, i) => (
                <li key={i} className="clip-chamfer border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="bg-tactical/15 px-1.5 py-0.5 font-tech text-[10px] font-bold text-tactical">
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
                <p className="mt-1 text-[10px] text-slate-500">ES: {recap.translations.es}</p>
                <p className="text-[10px] text-slate-500">HI: {recap.translations.hi}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
