"use client";
// AETHER PITCH — PitchForge "God Mode" deck: chamfered judge scenario buttons
// with live scenario countdown, scan-line sheen and activation glow.

import { Zap, ShieldAlert, Shuffle, Clapperboard, Loader2 } from "lucide-react";
import type { MatchTick } from "@/lib/types";

interface Props {
  tick: MatchTick | null;
  busy: string | null;
  onInject: (name: string) => void;
}

const SCENARIOS = [
  {
    id: "chaos_counter",
    label: "33km/h Chaos Counter",
    detail: "⚡ 3v2 overload · line-breaking pass · AI cam swoop",
    icon: <Zap size={16} />,
    accent: "#FF1E56",
    duration: 16,
  },
  {
    id: "high_press_turnover",
    label: "High-Press Trap",
    detail: "🎯 52 m line · forced turnover outside the box",
    icon: <ShieldAlert size={16} />,
    accent: "#FFC24D",
    duration: 14,
  },
  {
    id: "tactical_inversion",
    label: "Invert Right Fullback",
    detail: "📐 60 s inversion · reshapes control polygons",
    icon: <Shuffle size={16} />,
    accent: "#00F0FF",
    duration: 60,
  },
  {
    id: "halftime_recap",
    label: "Studio Match Recap",
    detail: "🎬 top-3 causal inflections · 4 languages",
    icon: <Clapperboard size={16} />,
    accent: "#00FF85",
    duration: 0,
  },
];

export default function PitchForgeDeck({ tick, busy, onInject }: Props) {
  const active = tick?.scenario ?? null;
  const left = tick?.scenario_left ?? null;

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
            className={`clip-chamfer group relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 py-2.5 text-left transition disabled:opacity-60 ${
              isActive ? "bg-white/[0.06]" : "border border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
            style={
              isActive
                ? { border: `1px solid ${s.accent}`, boxShadow: `0 0 22px ${s.accent}44, inset 0 0 18px ${s.accent}22` }
                : undefined
            }
            title={s.detail}
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
                className="block truncate font-display text-[15px] font-bold uppercase leading-tight tracking-wide"
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
