"use client";
// AETHER PITCH — PitchForge "God Mode" deck: chamfered judge scenario buttons
// with live scenario countdown, scan-line sheen and activation glow.
// variant="dock" renders the compact segment embedded in the unified bottom
// dock; variant="deck" keeps the legacy standalone footer.

import { Zap, ShieldAlert, Shuffle, Clapperboard, Loader2, Radar } from "lucide-react";
import type { MatchTick, Metrics, PitchControlSplit } from "@/lib/types";

const SCENARIOS = [
  {
    id: "chaos_counter",
    label: "33km/h Chaos Counter",
    short: "Chaos Counter",
    detail: "⚡ 3v2 overload · line-breaking pass · AI cam swoop",
    icon: <Zap size={16} />,
    accent: "#FF1E56",
    duration: 16,
  },
  {
    id: "high_press_turnover",
    label: "High-Press Trap",
    short: "Press Trap",
    detail: "🎯 52 m line · forced turnover outside the box",
    icon: <ShieldAlert size={16} />,
    accent: "#FFC24D",
    duration: 14,
  },
  {
    id: "tactical_inversion",
    label: "Invert Right Fullback",
    short: "Inversion",
    detail: "📐 60 s inversion · reshapes control polygons",
    icon: <Shuffle size={16} />,
    accent: "#00F0FF",
    duration: 60,
  },
  {
    id: "halftime_recap",
    label: "Studio Match Recap",
    short: "Recap",
    detail: "🎬 top-3 causal inflections · 4 languages",
    icon: <Clapperboard size={16} />,
    accent: "#00FF85",
    duration: 0,
  },
];

interface Props {
  tick: MatchTick | null;
  busy: string | null;
  onInject: (name: string) => void;
  /** "deck": legacy standalone footer · "dock": compact segment of the unified bottom dock */
  variant?: "deck" | "dock";
}

export default function PitchForgeDeck({ tick, busy, onInject, variant = "deck" }: Props) {
  const active = tick?.scenario ?? null;
  const left = tick?.scenario_left ?? null;

  if (variant === "dock") {
    return (
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="God-Mode scenario injector">
        {SCENARIOS.map((s, i) => {
          const isActive = active === s.id;
          const isBusy = busy === s.id;
          const progress =
            isActive && s.duration > 0 && left != null
              ? Math.max(0, Math.min(1, left / s.duration))
              : 0;
          return (
            <button
              key={s.id}
              onClick={() => onInject(s.id)}
              disabled={!!busy}
              aria-label={`${s.label} (key ${i + 1})`}
              title={`${s.detail} · shortcut ${i + 1}`}
              className={`clip-skew relative flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden border px-2 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider transition disabled:opacity-60 ${
                isActive ? "text-white" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"
              }`}
              style={
                isActive
                  ? { background: `${s.accent}30`, border: `1px solid ${s.accent}`, color: s.accent, boxShadow: `0 0 14px ${s.accent}44` }
                  : undefined
              }
            >
              {/* countdown drain */}
              {isActive && s.duration > 0 && (
                <span
                  className="absolute bottom-0 left-0 h-[3px] transition-all duration-300"
                  style={{ width: `${progress * 100}%`, background: s.accent, boxShadow: `0 0 8px ${s.accent}` }}
                />
              )}
              <span className="relative z-10 shrink-0">
                {isBusy ? <Loader2 size={12} className="animate-spin" /> : s.icon}
              </span>
              <span className="relative z-10 hidden truncate min-[1440px]:inline">{s.short}</span>
              <kbd className="relative z-10 hidden border border-white/15 px-1 py-px text-[8px] text-slate-500 min-[1440px]:inline">
                {i + 1}
              </kbd>
              {isActive && s.duration > 0 && (
                <span className="relative z-10 font-tech text-[10px]" style={{ color: s.accent }}>
                  {Math.ceil(left ?? 0)}s
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <footer className="relative z-20 flex min-h-[70px] shrink-0 items-center gap-2 border-t border-white/10 bg-gradient-to-b from-[#0A101C] to-[#070B13] px-3">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-pitch/50 to-transparent" />
      <div className="mr-1 hidden shrink-0 leading-none 2xl:block">
        <div className="font-display text-[14px] font-bold uppercase tracking-[0.2em] text-pitch">
          Pitch<span className="text-white">Forge</span>
        </div>
        <div className="mt-1 font-tech text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          God-Mode Injector
        </div>
      </div>
      {SCENARIOS.map((s) => {
        const isActive = active === s.id;
        const isBusy = busy === s.id;
        const progress =
          isActive && s.duration > 0 && left != null
            ? Math.max(0, Math.min(1, left / s.duration))
            : 0;
        return (
          <button
            key={s.id}
            onClick={() => onInject(s.id)}
            disabled={!!busy}
            aria-label={s.label}
            title={s.detail}
            className={`clip-chamfer group relative flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden px-3 py-2.5 text-left transition disabled:opacity-60 md:justify-start ${
              isActive ? "bg-white/[0.06]" : "border border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
            style={
              isActive
                ? { border: `1px solid ${s.accent}`, boxShadow: `0 0 22px ${s.accent}44, inset 0 0 18px ${s.accent}22` }
                : undefined
            }
          >
            {/* left accent rail */}
            <span
              className="absolute inset-y-0 left-0 w-[4px]"
              style={{ background: s.accent, boxShadow: `0 0 10px ${s.accent}` }}
            />
            {isActive && (
              <span
                className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                style={{ animation: "sheen 2.4s ease-in-out infinite" }}
              />
            )}
            {/* countdown drain */}
            {isActive && s.duration > 0 && (
              <span
                className="absolute bottom-0 left-0 h-[3px] transition-all duration-300"
                style={{ width: `${progress * 100}%`, background: s.accent, boxShadow: `0 0 8px ${s.accent}` }}
              />
            )}
            <span className="relative z-10 shrink-0" style={{ color: isActive ? s.accent : "#94A3B8" }}>
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : s.icon}
            </span>
            <span className="relative z-10 min-w-0">
              <span
                className="hidden truncate font-display text-[15px] font-bold uppercase leading-tight tracking-wide sm:block"
                style={{ color: isActive ? s.accent : "#E2E8F0" }}
              >
                {s.label}
              </span>
              <span className="hidden truncate font-tech text-[9.5px] uppercase tracking-[0.14em] text-slate-500 2xl:block">
                {s.detail}
              </span>
            </span>
            {isActive && s.duration > 0 && (
              <span className="relative z-10 ml-auto font-tech text-[11px] font-bold" style={{ color: s.accent }}>
                {Math.ceil(left ?? 0)}s
              </span>
            )}
          </button>
        );
      })}
    </footer>
  );
}

/* ------------------------------------------------------- spatial ownership */

interface ControlBarProps {
  metrics: Metrics | null;
  tick?: MatchTick | null;
}

/**
 * Live Spatial Pitch Control Bar — the territory split computed by Stage B
 * across the 16x12 xT grid (proximity + velocity weighted influence).
 */
export function SpatialPitchControlBar({ metrics }: ControlBarProps) {
  const split: PitchControlSplit = metrics?.pitch_control_split ?? {
    nla_territory_pct: 50,
    mcs_territory_pct: 50,
    neutral_pct: 0,
  };
  const nla = Math.max(0, Math.min(100, split.nla_territory_pct ?? 50));
  const mcs = Math.max(0, Math.min(100, split.mcs_territory_pct ?? 50));
  const neutral = Math.max(0, Math.min(100, split.neutral_pct ?? 0));
  const lead = nla - mcs;
  const leader = lead >= 0 ? "NLA" : "MCS";

  return (
    <div className="clip-chamfer border border-white/10 bg-black/25 p-2" aria-label="Spatial pitch control">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          <Radar size={11} className="text-tactical" /> Spatial Pitch Control
        </span>
        <span className="font-tech text-[8.5px] uppercase tracking-wider text-slate-500">
          16×12 xT grid
        </span>
      </div>

      <div className="flex h-5 overflow-hidden border border-white/10">
        <div
          className="flex items-center justify-center bg-gradient-to-r from-crimson/90 to-crimson/60 transition-all duration-300"
          style={{ width: `${nla}%` }}
        >
          <span className="font-tech text-[9px] font-bold text-white">NLA {nla.toFixed(0)}%</span>
        </div>
        <div
          className="flex items-center justify-center bg-white/[0.07] transition-all duration-300"
          style={{ width: `${neutral}%` }}
          title="Contested / neutral territory"
        >
          {neutral >= 8 && (
            <span className="font-tech text-[8px] text-slate-500">{neutral.toFixed(0)}%</span>
          )}
        </div>
        <div
          className="flex items-center justify-center bg-gradient-to-r from-tactical/60 to-tactical/90 transition-all duration-300"
          style={{ width: `${mcs}%` }}
        >
          <span className="font-tech text-[9px] font-bold text-white">MCS {mcs.toFixed(0)}%</span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between font-tech text-[8.5px] uppercase tracking-wider text-slate-500">
        <span>
          {leader} leads by {Math.abs(lead).toFixed(1)} pts
        </span>
        <span>{metrics?.chaos_state?.toLowerCase() ?? "—"}</span>
      </div>
    </div>
  );
}
