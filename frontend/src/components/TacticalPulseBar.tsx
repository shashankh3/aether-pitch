"use client";
// AETHER PITCH v2.0 — top-center Tactical Pulse (Control vs Chaos):
// live waveform, numeric gauge, state chip, and a predictive counter-attack
// countdown badge that arms when chaos crosses the 0.68 threshold.

import type { Metrics } from "@/lib/types";

interface Props {
  metrics: Metrics | null;
}

const SEGS = 24;

function Sparkline({ history }: { history: number[] }) {
  const w = 190;
  const h = 34;
  const pts = history.length > 1
    ? history
        .map((v, i) => `${((i / (history.length - 1)) * w).toFixed(1)},${(h - Math.max(0, Math.min(1, v)) * (h - 4) - 2).toFixed(1)}`)
        .join(" ")
    : "";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id="chaosline-v2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="55%" stopColor="#00FF85" />
          <stop offset="100%" stopColor="#FF1E56" />
        </linearGradient>
      </defs>
      <line x1="0" y1={h * 0.32} x2={w} y2={h * 0.32} stroke="rgba(0,240,255,0.15)" strokeDasharray="3 4" />
      <line x1="0" y1={h * 0.68} x2={w} y2={h * 0.68} stroke="rgba(255,30,86,0.18)" strokeDasharray="3 4" />
      {pts && <polyline points={pts} fill="none" stroke="url(#chaosline-v2)" strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  );
}

export default function TacticalPulseBar({ metrics }: Props) {
  const chaos = metrics?.chaos_index ?? 0;
  const state = metrics?.chaos_state ?? "BALANCED RHYTHM";
  const critical = chaos > 0.68;
  const lit = Math.round(Math.max(0, Math.min(1, chaos)) * SEGS);
  // predictive counter-attack window: seconds of elevated-chaos runway left
  const runway = critical
    ? Math.max(0, Math.round((chaos - 0.68) * 45))
    : 0;

  return (
    <div
      className={`clip-ea pointer-events-auto w-full max-w-[520px] border border-white/15 bg-slate-950/80 px-3 py-2 backdrop-blur-xl ${
        critical ? "animate-pulse-crimson border-crimson/60" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          Tactical Pulse · Control vs Chaos
        </span>
        {critical ? (
          <span className="clip-skew animate-breathe bg-crimson/25 px-2 py-0.5 font-tech text-[10px] font-bold uppercase tracking-[0.14em] text-crimson">
            ⚡ Counter-Attack Window · {runway}s
          </span>
        ) : (
          <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-slate-600">
            Δ10s {((metrics?.delta_chaos ?? 0) >= 0 ? "+" : "") + (metrics?.delta_chaos ?? 0).toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div
          className={`font-tech text-[30px] font-bold leading-none ${
            critical ? "text-crimson text-glow-crimson" : "text-tactical text-glow-cyan"
          }`}
        >
          {chaos.toFixed(2)}
        </div>
        <Sparkline history={metrics?.chaos_history ?? []} />
        <div className="flex-1">
          <div className="flex h-[14px] gap-[2px]">
            {Array.from({ length: SEGS }).map((_, i) => {
              const on = i < lit;
              const f = i / (SEGS - 1);
              const color = f < 0.42 ? "#00F0FF" : f < 0.72 ? "#8B5CF6" : "#FF1E56";
              return (
                <div
                  key={i}
                  className="h-full flex-1 transition-all duration-200"
                  style={{
                    clipPath: "polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)",
                    background: on ? color : "rgba(148,163,184,0.12)",
                    boxShadow: on && f >= 0.72 ? `0 0 8px ${color}` : "none",
                  }}
                />
              );
            })}
          </div>
          <div
            className={`mt-1 inline-block clip-skew px-2 py-[1px] font-display text-[11px] font-bold uppercase tracking-[0.2em] ${
              critical
                ? "bg-crimson/25 text-crimson"
                : chaos < 0.4
                ? "bg-tactical/15 text-tactical"
                : "bg-pitch/15 text-pitch"
            }`}
          >
            {chaos.toFixed(2)} — {state}
          </div>
        </div>
      </div>
    </div>
  );
}
