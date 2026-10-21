"use client";
// AETHER PITCH v6.0 — unified bottom dock, one bar for every live control:
// [player chip → hologram popover] · [DVR + telestrator] · [God-Mode
// scenarios] · [pipeline chip → payload popover]. The broadcast lower-third
// floats above the dock exactly as before.

import { useEffect } from "react";
import { Crosshair } from "lucide-react";
import PlayerLock360 from "@/components/PlayerLock360";
import TelestratorDVRBar from "@/components/TelestratorDVRBar";
import PitchForgeDeck from "@/components/PitchForgeDeck";
import { PipelineChip, PipelinePanel } from "@/components/PipelineInspector";
import type {
  EngineStatus, Insight, LangCode, MatchEvent, MatchTick, Pipeline,
  TelestratorState,
} from "@/lib/types";
import { useHud } from "@/lib/hudContext";
import { cn } from "@/lib/utils";

interface Props {
  tick: MatchTick | null;
  busy: string | null;
  inject: (name: string) => void;
  isDvrPaused: boolean;
  dvrOffsetTicks: number;
  pausedClock: string | null;
  togglePause: () => void;
  scrub: (offsetTicks: number) => void;
  telestrator: TelestratorState;
  toggleTelestrator: (key: keyof Omit<TelestratorState, "customTacticalArrows" | "spotlightPlayerIds">) => void;
  autoSpotlight: () => void;
  lockedId: string | null;
  onLock: (id: string | null) => void;
  events: MatchEvent[];
  lang: LangCode;
  insightLine: string | null;
  pipeline: Pipeline | null;
  connected: boolean;
  status: EngineStatus;
  lowerThird: Insight | null;
}

export default function BottomDock(props: Props) {
  const {
    tick, busy, inject, isDvrPaused, dvrOffsetTicks, pausedClock, togglePause, scrub,
    telestrator, toggleTelestrator, autoSpotlight, lockedId, onLock, events, lang, insightLine,
    pipeline, connected, status, lowerThird,
  } = props;
  const { playerPanelOpen, setPlayerPanelOpen, pipelinePanelOpen, setPipelinePanelOpen } = useHud();

  const player = tick?.players.find((p) => p.id === lockedId) ?? null;

  // click-outside closes the dock popovers (Escape handled in HudProvider)
  useEffect(() => {
    if (!playerPanelOpen && !pipelinePanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-dock-popover]") || t.closest("[data-dock-trigger]")) return;
      setPlayerPanelOpen(false);
      setPipelinePanelOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [playerPanelOpen, pipelinePanelOpen, setPlayerPanelOpen, setPipelinePanelOpen]);

  const lt = lowerThird?.stage_d_broadcast_overlay;
  const ltIsAlert =
    lt?.overlay_type === "CHAOS_OVERLOAD_ALERT" || lt?.overlay_type === "PRESSING_TRAP_ALERT";

  return (
    <div className="pointer-events-auto relative">
      {/* ---------- player hologram popover ---------- */}
      {playerPanelOpen && (
        <div data-dock-popover className="panel-enter absolute bottom-full left-0 z-[35] mb-2 hidden xl:block">
          <PlayerLock360
            tick={tick}
            lockedId={lockedId}
            onLock={onLock}
            events={events}
            lang={lang}
            insightLine={insightLine}
          />
        </div>
      )}

      {/* ---------- pipeline payload popover ---------- */}
      {pipelinePanelOpen && (
        <div
          data-dock-popover
          className="panel-enter absolute bottom-full right-0 z-[35] mb-2 hidden w-[min(880px,calc(100vw-40px))] xl:block"
        >
          <PipelinePanel pipeline={pipeline} />
        </div>
      )}

      {/* ---------- broadcast lower-third ---------- */}
      {lt && lowerThird && (
        <div
          key={lowerThird.id}
          role="status"
          aria-live="polite"
          className="animate-lower-in pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 flex w-[min(640px,90vw)] -translate-x-1/2 items-stretch"
        >
          <div
            className="flex w-[54px] shrink-0 flex-col items-center justify-center py-2"
            style={{
              background: ltIsAlert ? "#FF1E56" : "#00F0FF",
              clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
            }}
          >
            <span className="font-display text-[15px] font-extrabold uppercase leading-none text-black/85">
              {lt.timecode}
            </span>
            <span className="mt-0.5 font-tech text-[8px] font-bold uppercase tracking-[0.2em] text-black/70">
              Pulse
            </span>
          </div>
          <div
            className="min-w-0 flex-1 px-4 py-2"
            style={{
              background: "linear-gradient(100deg, rgba(5,8,14,0.96) 0%, rgba(10,16,28,0.86) 100%)",
              borderTop: `2px solid ${ltIsAlert ? "#FF1E56" : "#00F0FF"}`,
            }}
          >
            <div
              className="truncate font-display text-[21px] font-bold uppercase italic leading-tight tracking-wide text-white"
              style={{ textShadow: ltIsAlert ? "0 0 18px rgba(255,30,86,0.55)" : "0 0 18px rgba(0,240,255,0.4)" }}
            >
              {lt.lower_third_title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-tech text-[12px] font-semibold tracking-[0.08em] text-slate-300">
              <span className="stripes-dark h-3.5 w-10" />
              {lt.lower_third_subtitle}
            </div>
          </div>
        </div>
      )}

      {/* ---------- the dock bar ---------- */}
      <div className="clip-ea glass flex items-center gap-1.5 p-1.5">
        {/* player chip → hologram popover */}
        <button
          data-dock-trigger
          onClick={() => setPlayerPanelOpen((o) => !o)}
          aria-expanded={playerPanelOpen}
          className={cn(
            "hidden min-w-0 shrink-0 items-center gap-2 border px-2 py-1 text-left transition xl:flex",
            playerPanelOpen
              ? "border-tactical/50 bg-tactical/15"
              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
          )}
          title="PlayerLock 360 — roster, kit, speed dial, stamina, Live Voice"
        >
          {player ? (
            <>
              <span
                className={cn(
                  "clip-skew flex h-7 w-8 shrink-0 items-center justify-center font-tech text-[13px] font-bold text-white",
                  player.team === "NLA" ? "bg-crimson/50" : "bg-tactical/40",
                )}
              >
                {player.shirt_number}
              </span>
              <span className="min-w-0 leading-none">
                <span className="block max-w-[110px] truncate font-display text-[13px] font-bold uppercase tracking-wide text-white">
                  {player.name}
                </span>
                <span className="font-tech text-[9px] uppercase tracking-wider text-slate-500">
                  {player.team} · {player.speed_kmh.toFixed(1)} km/h
                </span>
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Crosshair size={13} className="text-tactical" /> Lock Player
            </span>
          )}
        </button>

        <span className="hidden h-6 w-px shrink-0 bg-white/10 xl:block" />

        {/* DVR time-machine + telestrator */}
        <TelestratorDVRBar
          isDvrPaused={isDvrPaused}
          dvrOffsetTicks={dvrOffsetTicks}
          pausedClock={pausedClock}
          onTogglePause={togglePause}
          onScrub={scrub}
          telestrator={telestrator}
          onToggleTelestrator={toggleTelestrator}
          onToggleSpotlight={autoSpotlight}
        />

        <span className="hidden h-6 w-px shrink-0 bg-white/10 min-[1440px]:block" />

        {/* God-Mode scenarios */}
        <PitchForgeDeck variant="dock" tick={tick} busy={busy} onInject={inject} />

        <span className="h-6 w-px shrink-0 bg-white/10" />

        {/* pipeline status chip → payload popover */}
        <PipelineChip
          pipeline={pipeline}
          connected={connected}
          status={status}
          open={pipelinePanelOpen}
          onToggle={() => setPipelinePanelOpen((o) => !o)}
        />
      </div>
    </div>
  );
}
