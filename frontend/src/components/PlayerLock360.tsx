"use client";
// AETHER PITCH v2.0 — PlayerLock 360: collectible-card style
// telemetry hologram card. Quick-roster strip + 3D pitch click-to-lock,
// kit silhouette with signature-trait hex badge, radial speedometer with 30 km/h
// overdrive zone, stamina / PDR / ΔxT chips and localized live voice synthesis.

import { useMemo } from "react";
import { Crosshair, Lock, Unlock, Volume2, Flame } from "lucide-react";
import type { LangCode, MatchEvent, MatchTick, PlayerTick, Team } from "@/lib/types";
import { SPEECH_LOCALES } from "@/lib/types";
import { CRESTS } from "@/components/Crests";
import { useSpeechController } from "@/hooks/useSpeechController";
import { clamp } from "@/lib/utils";

const SPRINT_KMH = 30;
const DIAL_MAX = 36;
const DIAL_START = 210;
const DIAL_SWEEP = 240;

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

function SpeedDial({ kmh, sprinting }: { kmh: number; sprinting: boolean }) {
  const frac = clamp(kmh / DIAL_MAX, 0, 1);
  const a1 = DIAL_START + DIAL_SWEEP * frac;
  const thr = DIAL_START + DIAL_SWEEP * (SPRINT_KMH / DIAL_MAX);
  const color = sprinting ? "#FF1E56" : kmh > 20 ? "#FFC24D" : "#00F0FF";
  return (
    <div className="relative h-[96px] w-[104px] shrink-0">
      <svg viewBox="0 0 110 100" className="h-full w-full">
        <path d={arcPath(55, 52, 40, DIAL_START, DIAL_START + DIAL_SWEEP)} fill="none"
          stroke="rgba(148,163,184,0.18)" strokeWidth="8" strokeLinecap="round" />
        {Array.from({ length: 13 }, (_, i) => DIAL_START + (DIAL_SWEEP * i) / 12).map((a, i) => {
          const p1 = polar(55, 52, 48, a);
          const p2 = polar(55, 52, i % 3 === 0 ? 52 : 50, a);
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={a <= a1 ? color : "rgba(148,163,184,0.3)"} strokeWidth={i % 3 === 0 ? 2 : 1} />
          );
        })}
        {frac > 0.02 && (
          <path d={arcPath(55, 52, 40, DIAL_START, a1)} fill="none" stroke={color}
            strokeWidth="8" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        )}
        <line
          x1={polar(55, 52, 33, thr).x} y1={polar(55, 52, 33, thr).y}
          x2={polar(55, 52, 52, thr).x} y2={polar(55, 52, 52, thr).y}
          stroke="#FF1E56" strokeWidth="2" strokeDasharray="3 2"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className={`font-tech text-[24px] font-bold leading-none ${sprinting ? "text-crimson text-glow-crimson" : "text-tactical text-glow-cyan"}`}>
          {kmh.toFixed(1)}
        </span>
        <span className="font-display text-[8.5px] font-semibold uppercase tracking-[0.3em] text-slate-500">km/h</span>
      </div>
    </div>
  );
}

function KitSilhouette({ player }: { player: PlayerTick }) {
  const isNLA = player.team === "NLA";
  const primary = player.role === "GK" ? (isNLA ? "#D9F99D" : "#FDE047") : isNLA ? "#E11D48" : "#00E5FF";
  const shorts = isNLA ? "#7F0F26" : "#0A1A2F";
  return (
    <svg viewBox="0 0 100 96" className="h-[92px] w-[96px] shrink-0 drop-shadow-[0_4px_14px_rgba(0,0,0,0.6)]">
      {/* kit jersey */}
      <path d="M30 6 L42 0 Q50 6 58 0 L70 6 L86 16 L78 32 L70 28 V60 H30 V28 L22 32 L14 16 Z" fill={primary} stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <path d="M42 0 Q50 6 58 0 L56 8 Q50 12 44 8 Z" fill={shorts} />
      <text x="50" y="44" textAnchor="middle" fill="#fff" fontSize="26" fontFamily="'Teko', 'Arial Narrow', sans-serif" fontWeight="700">{player.shirt_number}</text>
      {/* shorts + socks */}
      <rect x="30" y="60" width="40" height="14" fill={shorts} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <rect x="32" y="74" width="15" height="20" fill={primary} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
      <rect x="53" y="74" width="15" height="20" fill={primary} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
    </svg>
  );
}

function HexBadge({ badge }: { badge: string }) {
  const color = badge === "INTERCEPT" ? "#FF1E56" : badge === "INCISIVE_PASS" ? "#00F0FF" : "#FFC24D";
  return (
    <div className="relative flex h-[44px] w-[44px] items-center justify-center" title={`Signature trait ${badge}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0">
        <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" fill={`${color}22`} stroke={color} strokeWidth="2" />
      </svg>
      <span className="font-tech text-[8px] font-bold leading-tight" style={{ color }}>
        {badge.replace("_", " ")}
      </span>
    </div>
  );
}

interface Props {
  tick: MatchTick | null;
  lockedId: string | null;
  onLock: (id: string | null) => void;
  events: MatchEvent[];
  lang: LangCode;
  insightLine: string | null;
}

export default function PlayerLock360({ tick, lockedId, onLock, events, lang, insightLine }: Props) {
  const player = tick?.players.find((p) => p.id === lockedId) ?? null;
  const lastPass = events.find((e) => e.type === "PASS" && e.player_id === lockedId && e.pdr != null);
  const sprinting = (player?.speed_kmh ?? 0) > SPRINT_KMH;
  const Crest = player ? CRESTS[player.team as Team] : null;
  const { speakInsight } = useSpeechController();

  const roster = useMemo(() => tick?.players ?? [], [tick?.players]);

  const relevantInsight = player && insightLine?.toLowerCase().includes(player.name.toLowerCase())
    ? insightLine
    : null;

  const speak = () => {
    if (!player) return;
    const text =
      relevantInsight && relevantInsight.length > 0
        ? relevantInsight
        : `${player.name}, ${player.team} ${player.role}, currently at ${player.speed_kmh.toFixed(1)} kilometres per hour, ${(player.distance_m / 1000).toFixed(2)} kilometres covered, top speed ${player.top_speed_kmh.toFixed(1)}, stamina ${Math.round(player.stamina)} percent.`;
    speakInsight(text, lang);
  };

  return (
    <section className="pointer-events-auto w-[352px]">
      {/* quick-roster strip */}
      <div className="clip-ea mb-1.5 flex flex-wrap gap-[3px] border border-white/10 bg-slate-950/80 p-1 backdrop-blur-xl">
        {roster.map((p) => (
          <button
            key={p.id}
            onClick={() => onLock(p.id)}
            className={`clip-skew h-6 w-7 font-tech text-[10px] font-bold leading-none transition ${
              lockedId === p.id
                ? p.team === "NLA" ? "bg-crimson/40 text-white" : "bg-tactical/40 text-white"
                : p.team === "NLA"
                ? "bg-crimson/15 text-crimson/80 hover:bg-crimson/30"
                : "bg-tactical/10 text-tactical/80 hover:bg-tactical/25"
            }`}
            title={`${p.name} · ${p.role}`}
          >
            {p.shirt_number}
          </button>
        ))}
      </div>

      <div className="clip-ea metal-edge p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[14px] font-bold uppercase tracking-[0.24em] text-slate-200">
            <Crosshair size={13} className="text-tactical" /> PlayerLock 360
          </h2>
          <div className="flex items-center gap-1">
            {player && (
              <button
                onClick={speak}
                className="flex items-center gap-1 bg-gold/15 px-1.5 py-0.5 font-tech text-[10px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/30"
                title={`Speak tactical commentary (${SPEECH_LOCALES[lang]})`}
              >
                <Volume2 size={12} /> Live Voice
              </button>
            )}
            {lockedId && (
              <button
                onClick={() => onLock(null)}
                className="flex items-center gap-1 px-1.5 py-0.5 font-tech text-[10px] font-bold uppercase tracking-wider text-slate-500 transition hover:text-crimson"
              >
                <Unlock size={11} />
              </button>
            )}
          </div>
        </div>

        {!player && (
          <p className="flex items-center gap-2 py-2 text-[12px] text-slate-500">
            <Lock size={13} className="text-slate-600" />
            Click any 3D avatar — or pick from the roster — to lock the biomechanical telemetry hologram.
          </p>
        )}

        {player && Crest && (
          <div>
            <div className="flex items-center gap-2">
              <KitSilhouette player={player} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Crest size={16} />
                  <span className="truncate font-display text-[21px] font-bold uppercase leading-tight tracking-wide text-white">
                    {player.name}
                  </span>
                </div>
                <div className="font-tech text-[10.5px] uppercase tracking-[0.18em] text-slate-400">
                  {player.team} · {player.role} · #{player.shirt_number}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {(player.playstyle_badge || (sprinting && "RAPID")) && (
                    <HexBadge badge={player.playstyle_badge ?? "RAPID"} />
                  )}
                  {sprinting && (
                    <span className="flex items-center gap-1 bg-crimson/20 px-1.5 py-0.5 font-tech text-[10px] font-bold text-crimson">
                      <Flame size={11} /> OVERDRIVE
                    </span>
                  )}
                </div>
              </div>
              <SpeedDial kmh={player.speed_kmh} sprinting={sprinting} />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                ["PDR", lastPass ? `${lastPass.pdr?.toFixed(0)}%` : "—", "text-white"],
                ["ΔxT", lastPass && lastPass.delta_xt != null
                  ? `${lastPass.delta_xt >= 0 ? "+" : ""}${lastPass.delta_xt.toFixed(2)}`
                  : "—", "text-pitch"],
                ["Stamina", `${player.stamina.toFixed(0)}%`, "text-gold"],
                ["DISTANCE", `${(player.distance_m / 1000).toFixed(2)} km`, "text-tactical"],
                ["TOP SPEED", `${player.top_speed_kmh.toFixed(1)} km/h`, "text-crimson"],
                ["SPRINT DIST", `${(player.sprint_distance_m / 1000).toFixed(2)} km`, "text-pitch"],
              ].map(([k, v, c]) => (
                <div key={k} className="clip-chamfer border border-white/10 bg-white/[0.04] px-2 py-1">
                  <div className="font-display text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">{k}</div>
                  <div className={`font-tech text-[15px] font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>

            {/* stamina depletion bar */}
            <div className="mt-1.5">
              <div className="h-[6px] overflow-hidden bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-gold via-pitch to-pitch transition-all"
                  style={{ width: `${player.stamina}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
