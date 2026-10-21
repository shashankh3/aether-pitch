"use client";
// AETHER PITCH v6.1 — TelestratorDVRBar
// 15-second circular DVR time-machine + telestrator quick actions, surfaced
// from the bottom Replay button. The scrubber tick markers show exactly where
// high-chaos spikes / 30+ km/h sprint bursts occurred on the timeline.
// Tool labels stay visible and form a 2×2 grid on phones.

import { Pause, Play, Focus, BrickWall, Hexagon, Ghost } from "lucide-react";
import type { TelestratorState } from "@/lib/types";
import { telemetry } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

interface ToolsProps {
  telestrator: TelestratorState;
  onToggleTelestrator: (key: keyof Omit<TelestratorState, "customTacticalArrows" | "spotlightPlayerIds">) => void;
  onToggleSpotlight: () => void;
}

export function TelestratorTools({ telestrator, onToggleTelestrator, onToggleSpotlight }: ToolsProps) {
  const tools = [
    {
      key: "spotlight" as const,
      label: "Spotlight",
      icon: <Focus size={12} />,
      active: telestrator.spotlightPlayerIds.length > 0,
      onClick: onToggleSpotlight,
      title: "Spotlight Key Players (carrier + nearest presser + ghost receiver; click any 3D player to toggle their beam)",
    },
    {
      key: "showOffsideLaserWall" as const,
      label: "Offside Wall",
      icon: <BrickWall size={12} />,
      active: telestrator.showOffsideLaserWall,
      onClick: () => onToggleTelestrator("showOffsideLaserWall"),
      title: "3D Offside / Line Wall",
    },
    {
      key: "showCompactnessPolygon" as const,
      label: "Block Mesh",
      icon: <Hexagon size={12} />,
      active: telestrator.showCompactnessPolygon,
      onClick: () => onToggleTelestrator("showCompactnessPolygon"),
      title: "Defensive Block Mesh",
    },
    {
      key: "animateGhostReplay" as const,
      label: "Ghost Pass",
      icon: <Ghost size={12} />,
      active: telestrator.animateGhostReplay,
      onClick: () => onToggleTelestrator("animateGhostReplay"),
      title: "Replay Ghost Pass",
    },
  ];
  return (
    <>
      {tools.map((t) => (
        <button
          key={t.key}
          onClick={t.onClick}
          className={cn(
            "clip-skew flex flex-1 items-center justify-center gap-1 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider transition",
            t.active ? "bg-gold/20 text-gold" : "bg-white/[0.03] text-slate-500 hover:text-slate-300"
          )}
          title={t.title}
          aria-pressed={t.active}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </>
  );
}

interface Props extends ToolsProps {
  isDvrPaused: boolean;
  dvrOffsetTicks: number;
  pausedClock?: string | null;
  onTogglePause: () => void;
  onScrub: (offsetTicks: number) => void;
}

const MAX_BACK = -150; // -15.0 s at 10 Hz

export default function TelestratorDVRBar({
  isDvrPaused, dvrOffsetTicks, pausedClock, onTogglePause, onScrub, telestrator,
  onToggleTelestrator, onToggleSpotlight,
}: Props) {
  const history = telemetry.history;
  const secondsAgo = Math.abs(Math.min(0, dvrOffsetTicks)) / 10;
  const snapshotClock = telemetry.snapshotAt(dvrOffsetTicks)?.clock ?? "--:--";
  const ghost = telemetry.ghost;
  const actualXt = ghost?.actual_delta_xt ?? null;
  const ghostXt = ghost?.delta_xt ?? null;
  const netXt = ghost?.net_xt_gain
    ?? (actualXt != null && ghostXt != null ? ghostXt - actualXt : null);
  const signed = (value: number | null, digits = 2) =>
    value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

  // timeline markers: high-chaos spikes + sprint bursts recorded in the buffer
  const markers = history
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => s.isMarker)
    .slice(-24);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {/* transport + time-machine scrubber */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePause}
          className={cn(
            "clip-skew flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 font-tech text-[11px] font-bold uppercase tracking-wider transition",
            isDvrPaused ? "bg-gold/25 text-gold" : "bg-crimson/20 text-crimson hover:bg-crimson/35"
          )}
          title={isDvrPaused ? "Resume the live 10Hz stream" : "Freeze the feed and telestrate"}
        >
          {isDvrPaused ? <Play size={12} /> : <Pause size={12} />}
          {isDvrPaused ? "Resume Live" : "Freeze"}
        </button>

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
              {isDvrPaused
                ? `⏸ DVR ${secondsAgo.toFixed(1)}s · ${pausedClock ?? snapshotClock}`
                : "● LIVE STREAM"}
            </span>
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {ghost && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border border-gold/25 bg-gold/[0.06] px-2 py-1">
          <span className="flex items-center gap-1 font-tech text-[9px] font-bold uppercase tracking-wider text-gold">
            <Ghost size={11} /> Ghost pass
          </span>
          <span className="font-tech text-[9px] uppercase tracking-wider text-slate-400">
            Actual <b className="text-slate-100">{signed(actualXt)} xT</b>
          </span>
          <span className="text-gold">→</span>
          <span className="font-tech text-[9px] uppercase tracking-wider text-slate-400">
            Ghost <b className="text-gold">{signed(ghostXt)} xT</b>
          </span>
          <span className="clip-skew bg-gold/15 px-1.5 py-0.5 font-tech text-[9px] font-bold text-gold">
            NET {signed(netXt)} xT
          </span>
          {ghost.completion_probability != null && (
            <span className="font-tech text-[9px] text-slate-400">
              {ghost.completion_probability.toFixed(0)}% COMP
            </span>
          )}
          <button
            onClick={() => onToggleTelestrator("animateGhostReplay")}
            className={cn(
              "ml-auto clip-skew px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider transition",
              telestrator.animateGhostReplay
                ? "bg-gold/25 text-gold"
                : "bg-white/[0.06] text-slate-400 hover:text-gold",
            )}
            aria-pressed={telestrator.animateGhostReplay}
          >
            {telestrator.animateGhostReplay ? "Counterfactual ON" : "Play counterfactual"}
          </button>
        </div>
      )}

      {/* telestrator quick actions — visible in the Replay popover, 2×2 on phones */}
      <div className="mt-1 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-1.5 sm:flex">
        <TelestratorTools
          telestrator={telestrator}
          onToggleTelestrator={onToggleTelestrator}
          onToggleSpotlight={onToggleSpotlight}
        />
      </div>
    </div>
  );
}
