"use client";
// AETHER PITCH v6.1 — Fan Personalization panel. Rendered in the Control
// Center's Fan tab: persona mode, single-metric focus, favorite club lens.
// The market-language selector sits directly above it in the same tab.

import { Target, Users, Heart } from "lucide-react";
import type {
  ClubBias, MetricFocus, PersonaModeV5, PersonalizationState,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const FAN_PERSONAS: { id: PersonaModeV5; label: string }[] = [
  { id: "ANALYST_HUD", label: "Analyst" },
  { id: "CASUAL_STORY", label: "Casual Fan" },
  { id: "TWINCAST_SPLIT", label: "TwinCast" },
];

export const FAN_METRICS: { id: MetricFocus; label: string; detail: string }[] = [
  { id: "ALL", label: "All Metrics", detail: "Full broadcast layer" },
  { id: "SPEED_VELOCITY", label: "Speed", detail: "Sprint >30 · ball · shot" },
  { id: "PASS_QUALITY", label: "Pass Quality", detail: "PDR · space · xT" },
  { id: "EXPECTED_THREAT_XT", label: "xT", detail: "Threat grid · ghost lane" },
  { id: "CHAOS_PRESSING", label: "Chaos", detail: "PPDA · press · lasers" },
];

export const FAN_CLUBS: { id: ClubBias; label: string }[] = [
  { id: "NEUTRAL", label: "Neutral" },
  { id: "NLA_LOYALIST", label: "NLA Lens" },
  { id: "MCS_LOYALIST", label: "MCS Lens" },
];

interface Props {
  state: PersonalizationState;
  onChange: (next: PersonalizationState) => void;
}

export default function FanPersonalizationPanel({ state, onChange }: Props) {
  const update = <K extends keyof PersonalizationState>(key: K, value: PersonalizationState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div className="panel-enter p-3">
      <div className="mb-2" role="group" aria-label="Persona mode">
        <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          <Users size={10} /> Persona Mode
        </div>
        <div className="grid grid-cols-3 gap-1">
          {FAN_PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => update("persona_mode", p.id)}
              aria-pressed={state.persona_mode === p.id}
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

      <div className="mb-2" role="group" aria-label="Single metric focus">
        <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          <Target size={10} /> Single-Metric Focus · filters 3D tags
        </div>
        <div className="space-y-1">
          {FAN_METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => update("metric_focus", m.id)}
              aria-pressed={state.metric_focus === m.id}
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
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 rounded-full",
                  state.metric_focus === m.id ? "animate-breathe bg-pitch" : "bg-slate-700"
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Favorite club bias">
        <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          <Heart size={10} /> Favorite Club Bias
        </div>
        <div className="grid grid-cols-3 gap-1">
          {FAN_CLUBS.map((c) => (
            <button
              key={c.id}
              onClick={() => update("favorite_club_bias", c.id)}
              aria-pressed={state.favorite_club_bias === c.id}
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

      <div className="mt-2 border-t border-white/10 pt-2 font-tech text-[8.5px] leading-relaxed text-slate-500">
        LOCKED PLAYER: {state.locked_player_id ?? "NONE"} · server payloads adapt live.
      </div>
    </div>
  );
}
