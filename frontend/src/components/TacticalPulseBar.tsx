"use client";
// AETHER PITCH — top broadcast bar, EA Sports FC presentation:
// channel bug · skewed scorebug with crests · segmented CHAOS power bar ·
// state chip · persona / language / HoloPitch tilt controls.

import { Radio, Heart, Users, Layers, Boxes } from "lucide-react";
import type { LangCode, MatchTick, Metrics, PersonaMode, Team } from "@/lib/types";
import { NLACrest, MCSCrest } from "@/components/Crests";

interface Props {
  tick: MatchTick | null;
  metrics: Metrics | null;
  connected: boolean;
  tilt: boolean;
  onToggleTilt: () => void;
  persona: PersonaMode;
  onPersona: (p: PersonaMode) => void;
  lang: LangCode;
  onLang: (l: LangCode) => void;
}

const SEGS = 26;

function ChaosPowerBar({ value, state }: { value: number; state: string }) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * SEGS);
  const critical = value > 0.68;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="hidden shrink-0 flex-col lg:flex">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Control <span className="text-slate-600">vs</span> Chaos
        </span>
        <div className="flex items-end gap-1.5">
          <span
            className={`font-tech text-[26px] font-bold leading-none ${
              critical ? "text-crimson text-glow-crimson" : "text-tactical text-glow-cyan"
            }`}
          >
            {value.toFixed(2)}
          </span>
        </div>
      </div>
      {/* segmented meter — cyan (control) -> violet -> crimson (chaos) */}
      <div className={`relative flex min-w-0 flex-1 flex-col gap-1 ${critical ? "animate-pulse-crimson" : ""}`}>
        <div className="flex h-[16px] gap-[2px]">
          {Array.from({ length: SEGS }).map((_, i) => {
            const on = i < lit;
            const f = i / (SEGS - 1);
            const color =
              f < 0.42 ? "#00F0FF" : f < 0.72 ? "#8B5CF6" : "#FF2A54";
            return (
              <div
                key={i}
                className="h-full flex-1 transition-all duration-200"
                style={{
                  clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
                  background: on
                    ? color
                    : "rgba(148,163,184,0.12)",
                  boxShadow: on
                    ? i >= SEGS * 0.72
                      ? `0 0 8px ${color}`
                      : `0 0 5px ${color}66`
                    : "none",
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-600">
            Structured
          </span>
          <span
            className={`clip-skew px-2 py-[1px] font-display text-[10px] font-bold uppercase tracking-[0.18em] ${
              critical
                ? "bg-crimson/20 text-crimson"
                : value < 0.4
                ? "bg-tactical/15 text-tactical"
                : "bg-pitch/15 text-pitch"
            }`}
          >
            {state}
          </span>
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-600">
            Chaos
          </span>
        </div>
      </div>
    </div>
  );
}

function TeamSide({ team, score, pos }: { team: Team; score: number; pos: boolean }) {
  const isNLA = team === "NLA";
  return (
    <div className="flex items-stretch">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 ${isNLA ? "" : "flex-row-reverse"}`}
        style={{
          background: isNLA
            ? "linear-gradient(180deg, rgba(255,42,84,0.22), rgba(255,42,84,0.05))"
            : "linear-gradient(180deg, rgba(56,189,248,0.22), rgba(56,189,248,0.05))",
        }}
      >
        {isNLA ? <NLACrest size={24} /> : <MCSCrest size={24} />}
        <div className={`leading-none ${isNLA ? "text-left" : "text-right"}`}>
          <div className="font-display text-[15px] font-bold uppercase tracking-wide text-slate-100">
            {team}
          </div>
          <div className="font-tech text-[8.5px] uppercase tracking-[0.18em] text-slate-400">
            {isNLA ? "North London" : "Man Cityscape"}
          </div>
        </div>
      </div>
      <div
        className={`relative flex w-[44px] items-center justify-center bg-black/50 font-tech text-[27px] font-bold leading-none text-white ${
          isNLA ? "border-r border-white/15" : "border-l border-white/15"
        }`}
      >
        {score}
        {pos && (
          <span
            className={`absolute -bottom-[1px] h-[3px] w-7 rounded-full ${
              isNLA ? "bg-crimson" : "bg-sky-400"
            }`}
            style={{ boxShadow: `0 0 8px ${isNLA ? "#FF2A54" : "#38BDF8"}` }}
            title="In possession"
          />
        )}
      </div>
    </div>
  );
}

const PERSONAS: { id: PersonaMode; label: string; icon: React.ReactNode }[] = [
  { id: "analyst", label: "Analyst", icon: <Users size={13} /> },
  { id: "casual", label: "Fan", icon: <Heart size={13} /> },
  { id: "split", label: "TwinCast", icon: <Layers size={13} /> },
];

export default function TacticalPulseBar({
  tick, metrics, connected, tilt, onToggleTilt, persona, onPersona, lang, onLang,
}: Props) {
  const chaos = metrics?.chaos_index ?? 0;
  const state = metrics?.chaos_state ?? "BALANCED RHYTHM";

  return (
    <header className="relative z-20 flex h-[76px] shrink-0 items-center gap-3 border-b border-white/10 bg-gradient-to-b from-[#0A101C] to-[#070B13] px-4">
      {/* ambient accent line */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-tactical/60 via-violet-500/50 to-crimson/60" />

      {/* channel bug */}
      <div className="flex items-center gap-2.5 pr-1">
        <div
          className="clip-skew flex h-10 w-10 items-center justify-center bg-gradient-to-br from-violetdeep via-[#6d1250] to-crimson"
          style={{ boxShadow: "0 0 16px rgba(255,42,84,0.35)" }}
        >
          <Radio size={19} className="text-white" />
        </div>
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold uppercase tracking-[0.14em] text-white">
            AETHER<span className="text-tactical">PITCH</span>
          </div>
          <div className="mt-[3px] flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-crimson animate-breathe" : "bg-slate-600"}`} />
            <span className="font-tech text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Live Studio
            </span>
          </div>
        </div>
      </div>

      {/* scorebug */}
      <div
        className="clip-skew flex shrink-0 items-stretch border border-white/10 bg-[#0B111C]/90"
        style={{ boxShadow: "0 6px 22px rgba(0,0,0,0.55)" }}
      >
        <div className="w-[6px] shrink-0 stripes-crimson" />
        <TeamSide team="NLA" score={tick?.score.NLA ?? 0} pos={tick?.possession === "NLA"} />
        <div className="flex flex-col items-center justify-center bg-black/60 px-2">
          <span className="font-tech text-[16px] font-bold leading-none tracking-widest text-pitch">
            {tick?.clock ?? "--:--"}
          </span>
          <span className="font-display text-[8px] font-semibold uppercase tracking-[0.3em] text-slate-500">
            2nd Half
          </span>
        </div>
        <TeamSide team="MCS" score={tick?.score.MCS ?? 0} pos={tick?.possession === "MCS"} />
        <div className="w-[6px] shrink-0 bg-gradient-to-b from-sky-400 to-sky-600" />
      </div>

      <ChaosPowerBar value={chaos} state={state} />

      {/* controls */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex overflow-hidden border border-white/10">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPersona(p.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 font-display text-[12px] font-semibold uppercase tracking-wider transition ${
                persona === p.id
                  ? "bg-tactical/20 text-tactical"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden border border-white/10">
          {(["en", "es", "ar", "hi"] as LangCode[]).map((l) => (
            <button
              key={l}
              onClick={() => onLang(l)}
              className={`px-2 py-1.5 font-tech text-[11px] font-bold tracking-wider transition ${
                lang === l ? "bg-pitch/20 text-pitch" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={onToggleTilt}
          className={`flex items-center gap-1.5 border border-white/10 px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider transition ${
            tilt
              ? "bg-pitch/15 text-pitch"
              : "text-slate-300 hover:bg-white/5"
          }`}
          title="Toggle 2D / 2.5D HoloPitch isometric tilt"
        >
          <Boxes size={14} />
          {tilt ? "2.5D Holo" : "2D Flat"}
        </button>
      </div>
    </header>
  );
}
