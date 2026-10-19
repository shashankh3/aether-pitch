"use client";
// AETHER PITCH — PlayerLock 360 (EA FC HyperMotion edition):
// radial speed dial with 30 km/h sprint threshold, stamina + last-pass chips,
// team crest, and player-focused AI insight.

import { Crosshair, Lock, Unlock, Zap } from "lucide-react";
import type { MatchEvent, MatchTick, PlayerTick, Team } from "@/lib/types";
import { CRESTS } from "@/components/Crests";

interface Props {
  tick: MatchTick | null;
  lockedId: string | null;
  onLock: (id: string | null) => void;
  events: MatchEvent[];
}

function findPlayer(tick: MatchTick | null, id: string | null): PlayerTick | null {
  if (!tick || !id) return null;
  return tick.players.find((p) => p.id === id) ?? null;
}

// polar arc helper for the speed dial
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = polar(cx, cy, r, a1);
  const e = polar(cx, cy, r, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}
const DIAL_START = 210; // degrees — dial sweeps 240deg
const DIAL_SWEEP = 240;
const SPRINT_KMH = 30;
const DIAL_MAX = 36;

function SpeedDial({ kmh, sprinting }: { kmh: number; sprinting: boolean }) {
  const frac = Math.max(0, Math.min(1, kmh / DIAL_MAX));
  const a1 = DIAL_START + DIAL_SWEEP * frac;
  const thr = DIAL_START + DIAL_SWEEP * (SPRINT_KMH / DIAL_MAX);
  const color = sprinting ? "#FF2A54" : kmh > 20 ? "#FFC24D" : "#00F0FF";
  const ticks = Array.from({ length: 13 }, (_, i) => DIAL_START + (DIAL_SWEEP * i) / 12);
  return (
    <div className="relative h-[104px] w-[118px] shrink-0">
      <svg viewBox="0 0 120 110" className="h-full w-full">
        {/* track */}
        <path d={arcPath(60, 58, 44, DIAL_START, DIAL_START + DIAL_SWEEP)} fill="none"
          stroke="rgba(148,163,184,0.18)" strokeWidth="9" strokeLinecap="round" />
        {/* colored ticks */}
        {ticks.map((a, i) => {
          const p1 = polar(60, 58, 52, a);
          const p2 = polar(60, 58, i % 3 === 0 ? 56 : 54, a);
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={a <= a1 ? color : "rgba(148,163,184,0.3)"} strokeWidth={i % 3 === 0 ? 2 : 1} />
          );
        })}
        {/* value arc */}
        {frac > 0.02 && (
          <path d={arcPath(60, 58, 44, DIAL_START, a1)} fill="none" stroke={color}
            strokeWidth="9" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        )}
        {/* sprint threshold tick */}
        <line
          x1={polar(60, 58, 36, thr).x} y1={polar(60, 58, 36, thr).y}
          x2={polar(60, 58, 58, thr).x} y2={polar(60, 58, 58, thr).y}
          stroke="#FF2A54" strokeWidth="2" strokeDasharray="3 2"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2.5">
        <span
          className={`font-tech text-[27px] font-bold leading-none ${
            sprinting ? "text-crimson text-glow-crimson animate-pulse-crimson rounded px-1" : "text-tactical text-glow-cyan"
          }`}
        >
          {kmh.toFixed(1)}
        </span>
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          km/h
        </span>
      </div>
    </div>
  );
}

export default function PlayerLock360({ tick, lockedId, onLock, events }: Props) {
  const player = findPlayer(tick, lockedId);
  const lastPass = events.find(
    (e) => e.type === "PASS" && e.player_id === lockedId && e.pdr != null
  );
  const sprinting = (player?.speed_kmh ?? 0) > SPRINT_KMH;
  const Crest = player ? CRESTS[player.team as Team] : null;

  return (
    <section className="relative shrink-0 border-t border-white/10 bg-gradient-to-b from-black/50 to-black/70 px-3 py-2.5">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-tactical/70 to-transparent" />
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-[0.28em] text-slate-300">
          <Crosshair size={13} className="text-tactical" /> PlayerLock 360
        </h2>
        {lockedId && (
          <button
            onClick={() => onLock(null)}
            className="flex items-center gap-1 px-1.5 py-0.5 font-tech text-[10px] font-bold uppercase tracking-widest text-slate-500 transition hover:text-crimson"
          >
            <Unlock size={11} /> Release
          </button>
        )}
      </div>

      {!player && (
        <p className="flex items-center gap-2 py-2 text-[12px] text-slate-500">
          <Lock size={13} className="text-slate-600" />
          Click any player on the pitch to lock the HyperMotion telemetry ring.
        </p>
      )}

      {player && Crest && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className="clip-chamfer flex h-11 w-11 items-center justify-center"
              style={{
                background:
                  player.team === "NLA"
                    ? "linear-gradient(135deg, rgba(255,42,84,0.35), rgba(255,42,84,0.08))"
                    : "linear-gradient(135deg, rgba(56,189,248,0.35), rgba(56,189,248,0.08))",
              }}
            >
              <span className={`font-tech text-xl font-bold ${player.team === "NLA" ? "text-crimson" : "text-sky-300"}`}>
                {player.number}
              </span>
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <Crest size={15} />
                <span className="truncate font-display text-[17px] font-bold uppercase tracking-wide text-white">
                  {player.name}
                </span>
              </div>
              <div className="font-tech text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {player.team} · {player.role} · Stamina {player.stamina.toFixed(0)}%
              </div>
            </div>
            <SpeedDial kmh={player.speed_kmh} sprinting={sprinting} />
          </div>

          {sprinting && (
            <div className="clip-skew flex items-center justify-center gap-1.5 bg-crimson/20 py-1">
              <Zap size={12} className="text-crimson" />
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-crimson">
                Sprint Flare — {player.speed_kmh.toFixed(1)} km/h
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            {[
              ["Last PDR", lastPass ? `${lastPass.pdr?.toFixed(0)}%` : "—", "text-slate-100"],
              ["Last ΔxT", lastPass && lastPass.delta_xt != null
                ? `${lastPass.delta_xt >= 0 ? "+" : ""}${lastPass.delta_xt.toFixed(2)}`
                : "—", "text-slate-100"],
              ["Stamina", `${player.stamina.toFixed(0)}%`, "text-pitch"],
            ].map(([k, v, c]) => (
              <div key={k} className="clip-chamfer border border-white/10 bg-white/[0.03] px-2 py-1.5">
                <div className="font-display text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {k}
                </div>
                <div className={`font-tech text-[14px] font-bold ${c}`}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
