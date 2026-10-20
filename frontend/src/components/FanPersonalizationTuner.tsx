"use client";

import { useState } from "react";
import { SlidersHorizontal, X, Target, Users, Languages, Heart } from "lucide-react";
import type {
  ClubBias, LangCode, MetricFocus, PersonaModeV5, PersonalizationState,
} from "@/lib/types";
import { LANG_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  state: PersonalizationState;
  onChange: (next: PersonalizationState) => void;
}

const PERSONAS: { id: PersonaModeV5; label: string }[] = [
  { id: "ANALYST_HUD", label: "Analyst" },
  { id: "CASUAL_STORY", label: "Casual Fan" },
  { id: "TWINCAST_SPLIT", label: "TwinCast" },
];

const METRICS: { id: MetricFocus; label: string; detail: string }[] = [
  { id: "ALL", label: "All Metrics", detail: "Full broadcast layer" },
  { id: "SPEED_VELOCITY", label: "Speed", detail: "Sprint >30 · ball · shot" },
  { id: "PASS_QUALITY", label: "Pass Quality", detail: "PDR · space · xT" },
  { id: "EXPECTED_THREAT_XT", label: "xT", detail: "Threat grid · ghost lane" },
  { id: "CHAOS_PRESSING", label: "Chaos", detail: "PPDA · press · lasers" },
];

const CLUBS: { id: ClubBias; label: string }[] = [
  { id: "NEUTRAL", label: "Neutral" },
  { id: "NLA_LOYALIST", label: "NLA Lens" },
  { id: "MCS_LOYALIST", label: "MCS Lens" },
];

export default function FanPersonalizationTuner({ state, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const activeMetric = METRICS.find((m) => m.id === state.metric_focus);
  const update = <K extends keyof PersonalizationState>(key: K, value: PersonalizationState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "clip-ea flex w-full items-center justify-between border px-2 py-1.5 backdrop-blur-xl transition",
          open
            ? "border-tactical/50 bg-tactical/15 text-tactical"
            : "border-white/15 bg-slate-950/85 text-slate-300 hover:text-white"
        )}
        title="Fan Personalization Tuner — persona, single-metric lock, club lens, language"
      >
        <span className="flex items-center gap-1.5 font-tech text-[10px] font-bold uppercase tracking-wider">
          <SlidersHorizontal size={12} /> Fan Tuner
        </span>
        <span className="flex items-center gap-1">
          {state.metric_focus !== "ALL" && (
            <span className="bg-pitch/20 px-1 py-0.5 font-tech text-[8px] font-bold text-pitch">
              {activeMetric?.label.toUpperCase()}
            </span>
          )}
          {state.favorite_club_bias !== "NEUTRAL" && (
            <span className="bg-crimson/20 px-1 py-0.5 font-tech text-[8px] font-bold text-crimson">
              {state.favorite_club_bias === "NLA_LOYALIST" ? "NLA" : "MCS"}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="fixed right-3 top-14 z-[60] w-[min(360px,calc(100vw-24px))] max-h-[calc(100vh-80px)] overflow-y-auto border border-tactical/30 bg-slate-950/95 p-3 shadow-[0_0_40px_rgba(0,240,255,0.12)] backdrop-blur-2xl scroll-slim">
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <div className="font-display text-[14px] font-bold uppercase tracking-[0.2em] text-white">
                Fan Personalization
              </div>
              <div className="font-tech text-[9px] uppercase tracking-[0.22em] text-tactical">
                Stage E · live fan runtime
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-white">
              <X size={15} />
            </button>
          </div>

          <div className="mb-2">
            <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
              <Users size={10} /> Persona Mode
            </div>
            <div className="grid grid-cols-3 gap-1">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => update("persona_mode", p.id)}
                  className={cn(
                    "clip-skew py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider transition",
                    state.persona_mode === p.id
                      ? "bg-tactical/20 text-tactical"
                      : "bg-white/[0.03] text-slate-500 hover:text-slate-200"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
              <Target size={10} /> Single-Metric Focus · filters 3D tags
            </div>
            <div className="space-y-1">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => update("metric_focus", m.id)}
                  className={cn(
                    "flex w-full items-center justify-between border px-2 py-1 text-left transition",
                    state.metric_focus === m.id
                      ? "border-pitch/50 bg-pitch/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                  )}
                >
                  <span>
                    <span className={cn(
                      "block font-tech text-[10px] font-bold uppercase tracking-wider",
                      state.metric_focus === m.id ? "text-pitch" : "text-slate-300"
                    )}>
                      {m.label}
                    </span>
                    <span className="block font-tech text-[8.5px] text-slate-500">{m.detail}</span>
                  </span>
                  <span className={cn(
                    "h-2 w-2 rounded-full",
                    state.metric_focus === m.id ? "animate-breathe bg-pitch" : "bg-slate-700"
                  )} />
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
              <Heart size={10} /> Favorite Club Bias
            </div>
            <div className="grid grid-cols-3 gap-1">
              {CLUBS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => update("favorite_club_bias", c.id)}
                  className={cn(
                    "clip-skew py-1 font-tech text-[9px] font-bold uppercase tracking-wider transition",
                    state.favorite_club_bias === c.id
                      ? "bg-crimson/20 text-crimson"
                      : "bg-white/[0.03] text-slate-500 hover:text-slate-200"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
              <Languages size={10} /> Market Language
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(["en", "es", "ar", "hi"] as LangCode[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => update("market_language", lang)}
                  className={cn(
                    "py-1 font-tech text-[9px] font-bold uppercase tracking-wider transition",
                    state.market_language === lang
                      ? "bg-gold/20 text-gold"
                      : "bg-white/[0.03] text-slate-500 hover:text-slate-200"
                  )}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t border-white/10 pt-2 font-tech text-[8.5px] leading-relaxed text-slate-500">
            LOCKED PLAYER: {state.locked_player_id ?? "NONE"} · server payloads adapt live.
          </div>
        </div>
      )}
    </>
  );
}
