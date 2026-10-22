"use client";
// AETHER PITCH v6.2 — Fan Personalization panel. Rendered in the Control
// Center's Fan tab: persona mode, single-metric focus, favorite club lens.
// v6.2 adds the inclusive-broadcast controls: cognitive telemetry density
// presets and the colorblind-safe high-contrast palette.

import { Target, Users, Heart, Brain, Eye, Sparkles } from "lucide-react";
import type {
  ClubBias, CognitiveDensity, MetricFocus, PersonaModeV5, PersonalizationState,
} from "@/lib/types";
import { COGNITIVE_DENSITY_META } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useHud } from "@/lib/hudContext";
import { MetricLabel } from "@/components/hud/MetricLabel";

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

export const FAN_DENSITIES: CognitiveDensity[] = [
  "CASUAL_STORYTELLER",
  "FANTASY_HUNTER",
  "PRO_TACTICAL_DIRECTOR",
];

interface Props {
  state: PersonalizationState;
  onChange: (next: PersonalizationState) => void;
  colorblindSafe?: boolean;
  onToggleColorblind?: (next: boolean) => void;
}

export default function FanPersonalizationPanel({
    state, onChange, colorblindSafe = false, onToggleColorblind,
  }: Props) {
    const { plainLanguage } = useHud();
  const update = <K extends keyof PersonalizationState>(key: K, value: PersonalizationState[K]) => {
    onChange({ ...state, [key]: value });
  };
  const density = state.cognitive_density ?? "PRO_TACTICAL_DIRECTOR";

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

      <div className="mb-2" role="group" aria-label="How much detail you see">
        <div className="mb-1 flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          <Brain size={10} /> <MetricLabel label="Cognitive Telemetry Density" plain={plainLanguage} />
        </div>
        <div className="space-y-1">
          {FAN_DENSITIES.map((id) => {
            const meta = COGNITIVE_DENSITY_META[id];
            return (
              <button
                key={id}
                onClick={() => update("cognitive_density", id)}
                aria-pressed={density === id}
                className={cn(
                  "flex w-full items-center justify-between border px-2 py-1 text-left transition",
                  density === id
                    ? "border-pitch/50 bg-pitch/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                )}
              >
                <span>
                  <span className={cn(
                    "block font-tech text-[10px] font-bold uppercase tracking-wider",
                    density === id ? "text-pitch" : "text-slate-300"
                  )}>
                    {meta.label}
                  </span>
                  <span className="block font-tech text-[8.5px] text-slate-500">{meta.detail}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    density === id ? "animate-breathe bg-pitch" : "bg-slate-700"
                  )}
                />
              </button>
            );
          })}
        </div>
        <p className="mt-1 font-tech text-[8px] leading-relaxed text-slate-600">
          {COGNITIVE_DENSITY_META[density].jargon
            ? "Full analyst telemetry: xT, PDR, PPDA, ghost-pass deltas and Voronoi traps."
            : COGNITIVE_DENSITY_META[density].rawNumbers
              ? "Player-first numbers: speed milestones, stamina burn and individual ΔxT."
              : "Plain-language callouts. Complex grid numbers are hidden."}
        </p>
      </div>

      {onToggleColorblind && (
        <div className="mb-2" role="group" aria-label="Accessibility palette">
          <button
            onClick={() => onToggleColorblind(!colorblindSafe)}
            aria-pressed={colorblindSafe}
            className={cn(
              "flex w-full items-center justify-between border px-2 py-1.5 text-left transition",
              colorblindSafe
                ? "border-cyan-300/50 bg-cyan-300/10"
                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            )}
            title="Shift the 3D tactical overlays and HUD status pills to a high-contrast deuteranopia/protanopia-safe palette"
          >
            <span className="flex items-center gap-2">
              <Eye size={12} className={colorblindSafe ? "text-cyan-300" : "text-slate-500"} />
              <span>
                <span className={cn(
                  "block font-tech text-[9.5px] font-bold uppercase tracking-wider",
                  colorblindSafe ? "text-cyan-300" : "text-slate-300"
                )}>
                  Colorblind-Safe Palette
                </span>
                <span className="block font-tech text-[8.5px] text-slate-500">
                  Deuteranopia / Protanopia · cyan vs amber vs magenta
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span
                className="h-3 w-3 border border-white/20"
                style={{ background: colorblindSafe ? "#00E5FF" : "#FF1E56" }}
              />
              <span
                className="h-3 w-3 border border-white/20"
                style={{ background: colorblindSafe ? "#FFB300" : "#00FF85" }}
              />
              <span
                className={cn(
                  "clip-skew ml-1 px-1.5 py-0.5 font-tech text-[8px] font-bold uppercase tracking-wider",
                  colorblindSafe ? "bg-cyan-300/20 text-cyan-300" : "bg-white/10 text-slate-500"
                )}
              >
                {colorblindSafe ? "ON" : "OFF"}
              </span>
            </span>
          </button>
        </div>
      )}

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
        <span className="flex items-center gap-1">
          <Sparkles size={9} /> DENSITY: {COGNITIVE_DENSITY_META[density].label.toUpperCase()}
        </span>
        <br />
        LOCKED PLAYER: {state.locked_player_id ?? "NONE"} · server payloads adapt live.
      </div>
    </div>
  );
}
