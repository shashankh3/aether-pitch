"use client";
// AETHER PITCH v3.0 — TelestratorDVRBar
// 15-second circular DVR time-machine + telestrator quick actions, docked
// above the PitchForge deck. The scrubber tick markers show exactly where
// high-chaos spikes / 30+ km/h sprint bursts occurred on the timeline.

import { Pause, Play, Focus, BrickWall, Hexagon, Ghost } from "lucide-react";
import type { TelestratorState } from "@/lib/types";
import { telemetry } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

interface Props {
  isDvrPaused: boolean;
  dvrOffsetTicks: number;
  onTogglePause: () => void;
  onScrub: (offsetTicks: number) => void;
  telestrator: TelestratorState;
  onToggleTelestrator: (key: keyof Omit<TelestratorState, "customTacticalArrows" | "spotlightPlayerIds">) => void;
  onToggleSpotlight: () => void;
}

const MAX_BACK = -150; // -15.0 s at 10 Hz

export default function TelestratorDVRBar({
  isDvrPaused, dvrOffsetTicks, onTogglePause, onScrub, telestrator, onToggleTelestrator, onToggleSpotlight,
}: Props) {
  const history = telemetry.history;
  const secondsAgo = Math.abs(Math.min(0, dvrOffsetTicks)) / 10;

  // timeline markers: high-chaos spikes + sprint bursts recorded in the buffer
  const markers = history
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => s.isMarker)
    .slice(-24);

  return (
    <div className="clip-ea pointer-events-auto border border-white/15 bg-slate-950/85 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePause}
          className={cn(
            "clip-skew flex items-center gap-1.5 px-2.5 py-1 font-tech text-[11px] font-bold uppercase tracking-wider transition",
            isDvrPaused ? "bg-gold/25 text-gold" : "bg-crimson/20 text-crimson hover:bg-crimson/35"
          )}
        >
          {isDvrPaused ? <Play size={12} /> : <Pause size={12} />}
          {isDvrPaused ? "Resume Live" : "Freeze & Telestrate"}
        </button>

        {/* time-machine scrubber */}
        <div className="relative min-w-0 flex-1 px-1">
          <div className="pointer-events-none absolute inset-x-1 top-0 h-1.5">
            {markers.map(({ i, s }) => (
              <span
                key={s.seq}
                className="absolute top-0 h-1.5 w-[2px] bg-crimson/80"
                style={{ left: `${(i / Math.max(1, history.length - 1)) * 100}%` }}
                title={`${s.clock} · spike/sprint`}
              />
            ))}
          </div>
          <input
            type="range"
            min={MAX_BACK}
            max={0}
            step={1}
            value={dvrOffsetTicks}
            onChange={(e) => onScrub(parseInt(e.target.value, 10))}
            className="w-full accent-tactical"
            aria-label="DVR time-machine scrubber"
          />
          <div className="flex justify-between font-tech text-[8.5px] uppercase tracking-[0.18em] text-slate-500">
            <span>-15.0s</span>
            <span className={isDvrPaused ? "text-gold" : "text-pitch"}>
              {isDvrPaused ? `⏸ DVR ${secondsAgo.toFixed(1)}s · ${history[history.length - 1 + Math.round(dvrOffsetTicks)]?.clock ?? "--:--"}` : "● LIVE STREAM"}
            </span>
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {/* telestrator quick actions */}
      <div className="mt-1.5 flex gap-1.5 border-t border-white/10 pt-1.5">
        <button
          onClick={onToggleSpotlight}
          className={cn(
            "clip-skew flex flex-1 items-center justify-center gap-1 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider transition",
            telestrator.spotlightPlayerIds.length > 0
              ? "bg-gold/20 text-gold"
              : "bg-white/[0.03] text-slate-500 hover:text-slate-300"
          )}
          title="Spotlight Key Players (carrier + nearest presser + ghost receiver; click any 3D player to toggle their beam)"
        >
          <Focus size={12} />
          <span className="hidden lg:inline">Spotlight Key Players</span>
        </button>
        {([
          { key: "showOffsideLaserWall" as const, label: "3D Offside / Line Wall", icon: <BrickWall size={12} /> },
          { key: "showCompactnessPolygon" as const, label: "Defensive Block Mesh", icon: <Hexagon size={12} /> },
          { key: "animateGhostReplay" as const, label: "Replay Ghost Pass", icon: <Ghost size={12} /> },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => onToggleTelestrator(t.key)}
            className={cn(
              "clip-skew flex flex-1 items-center justify-center gap-1 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider transition",
              telestrator[t.key] ? "bg-gold/20 text-gold" : "bg-white/[0.03] text-slate-500 hover:text-slate-300"
            )}
            title={t.label}
          >
            {t.icon}
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
