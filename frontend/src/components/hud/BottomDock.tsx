"use client";
// AETHER PITCH v6.1 — a five-button fan dock. The full DVR, telestrator and
// God Mode decks are still here, but they open only when someone asks for
// them. Everything is one tap away; nothing crowds the match by default.

import { useEffect } from "react";
import {
  BarChart3, Crosshair, History, SlidersHorizontal, Sparkles, X,
} from "lucide-react";
import PlayerLock360 from "@/components/PlayerLock360";
import TelestratorDVRBar from "@/components/TelestratorDVRBar";
import PitchForgeDeck from "@/components/PitchForgeDeck";
import type {
  Insight, LangCode, MatchEvent, MatchTick, TelestratorState,
} from "@/lib/types";
import { useHud, type DockTool } from "@/lib/hudContext";
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
  lowerThird: Insight | null;
  sandboxActive: boolean;
  onToggleSandbox: () => void;
  lineScrubber?: React.ReactNode;
}

const TOOLS: { id: Exclude<DockTool, null>; label: string; icon: typeof Crosshair }[] = [
  { id: "player", label: "Players", icon: Crosshair },
  { id: "replay", label: "Replay", icon: History },
  { id: "moments", label: "Moments", icon: Sparkles },
];

export default function BottomDock(props: Props) {
  const {
    tick, busy, inject, isDvrPaused, dvrOffsetTicks, pausedClock, togglePause, scrub,
    telestrator, toggleTelestrator, autoSpotlight, lockedId, onLock, events, lang, insightLine,
    lowerThird, sandboxActive, onToggleSandbox, lineScrubber,
  } = props;
  const { dockTool, setDockTool, openControlCenter } = useHud();

  const player = tick?.players.find((p) => p.id === lockedId) ?? null;
  const momentLive = !!tick?.scenario || !!busy;

  // Click-outside closes an open dock popover. Escape is handled centrally.
  useEffect(() => {
    if (!dockTool) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-dock-popover]") || t.closest("[data-dock-trigger]")) return;
      setDockTool(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [dockTool, setDockTool]);

  const toggleTool = (id: Exclude<DockTool, null>) => {
    setDockTool((current) => (current === id ? null : id));
  };

  const lt = lowerThird?.stage_d_broadcast_overlay;
  const ltIsAlert =
    lt?.overlay_type === "CHAOS_OVERLOAD_ALERT" || lt?.overlay_type === "PRESSING_TRAP_ALERT";

  return (
    <div className="pointer-events-auto relative w-full">
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

      {/* ---------- player hologram ---------- */}
      {dockTool === "player" && (
        <div
          data-dock-popover
          className="panel-enter absolute bottom-full left-0 z-[35] mb-2 w-[min(360px,calc(100vw-16px))] sm:left-1/2 sm:-translate-x-1/2"
        >
          <div className="clip-ea panel-lux mb-1 flex items-center justify-between px-2.5 py-1.5">
            <span className="font-tech text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
              PlayerLock 360
            </span>
            <button
              onClick={() => setDockTool(null)}
              className="text-slate-500 transition hover:text-white"
              aria-label="Close player panel"
            >
              <X size={13} />
            </button>
          </div>
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

      {/* ---------- replay + telestrator ---------- */}
      {dockTool === "replay" && (
        <div data-dock-popover className="panel-enter absolute bottom-full left-0 right-0 z-[35] mb-2">
          <div className="clip-ea panel-lux p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <div>
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                  Replay & Telestrate
                </div>
                <div className="mt-0.5 font-tech text-[8.5px] uppercase tracking-[0.14em] text-slate-500">
                  15-second buffer · freeze, scrub, draw
                </div>
              </div>
              <button
                onClick={() => setDockTool(null)}
                className="shrink-0 text-slate-500 transition hover:text-white"
                aria-label="Close replay controls"
              >
                <X size={14} />
              </button>
            </div>
            <TelestratorDVRBar
              isDvrPaused={isDvrPaused}
              dvrOffsetTicks={dvrOffsetTicks}
              pausedClock={pausedClock}
              onTogglePause={togglePause}
              onScrub={scrub}
              telestrator={telestrator}
              onToggleTelestrator={toggleTelestrator}
              onToggleSpotlight={autoSpotlight}
              lineScrubber={lineScrubber}
            />

            {/* ---------- interactive what-if sandbox ---------- */}
            <button
              onClick={onToggleSandbox}
              aria-pressed={sandboxActive}
              className={cn(
                "clip-skew mt-1.5 flex w-full items-center justify-center gap-1.5 py-1.5 font-tech text-[9.5px] font-bold uppercase tracking-wider transition",
                sandboxActive
                  ? "bg-cyan-300/20 text-cyan-300"
                  : "bg-white/[0.06] text-slate-300 hover:bg-cyan-300/15 hover:text-cyan-300",
              )}
              title="Arm the interactive spatial what-if sandbox: drag any avatar and watch ΔxT and pitch control recalculate live"
            >
              <Crosshair size={12} />
              {sandboxActive ? "Sandbox armed — drag an avatar" : "What-If Sandbox · drag a player"}
            </button>
          </div>
        </div>
      )}

      {/* ---------- God Mode moments ---------- */}
      {dockTool === "moments" && (
        <div data-dock-popover className="panel-enter absolute bottom-full left-0 right-0 z-[35] mb-2">
          <div className="clip-ea panel-lux p-2">
            <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
              <div>
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                  God Mode moments
                </div>
                <div className="mt-0.5 font-tech text-[8.5px] uppercase tracking-[0.14em] text-slate-500">
                  Optional match scenarios · AI recaps
                </div>
              </div>
              <button
                onClick={() => setDockTool(null)}
                className="shrink-0 text-slate-500 transition hover:text-white"
                aria-label="Close moments"
              >
                <X size={14} />
              </button>
            </div>
            <PitchForgeDeck
              variant="deck"
              tick={tick}
              busy={busy}
              onInject={(name) => {
                inject(name);
                setDockTool(null);
              }}
            />
          </div>
        </div>
      )}

      {/* ---------- the calm dock ---------- */}
      <div className="clip-ea glass grid grid-cols-5 gap-1 p-1.5">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const selected = dockTool === tool.id;
          const hasPlayer = tool.id === "player" && !!player;
          return (
            <button
              key={tool.id}
              data-dock-trigger
              onClick={() => toggleTool(tool.id)}
              aria-expanded={selected}
              className={cn(
                "clip-skew relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 border px-1 py-1.5 font-tech text-[9.5px] font-bold uppercase tracking-[0.08em] transition",
                selected
                  ? "border-tactical/45 bg-tactical/15 text-tactical"
                  : "border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-white",
              )}
              title={
                tool.id === "player"
                  ? "PlayerLock 360 — roster, kit, speed, stamina and live voice"
                  : tool.id === "replay"
                    ? "Replay time-machine and telestrator"
                    : "God Mode match scenarios and recap"
              }
            >
              <Icon size={16} />
              {tool.label}
              {hasPlayer && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center bg-crimson px-1 font-tech text-[8px] font-bold text-white">
                  {player.shirt_number}
                </span>
              )}
              {tool.id === "moments" && momentLive && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 animate-breathe rounded-full bg-gold" />
              )}
            </button>
          );
        })}

        <button
          data-dock-trigger
          onClick={() => openControlCenter("stats")}
          className="clip-skew flex min-h-[48px] flex-col items-center justify-center gap-0.5 border border-white/[0.07] bg-white/[0.025] px-1 py-1.5 font-tech text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
          title="Match intelligence: possession, xT, pressing, player stats"
        >
          <BarChart3 size={16} />
          Stats
        </button>

        <button
          data-dock-trigger
          onClick={() => openControlCenter()}
          className="clip-skew flex min-h-[48px] flex-col items-center justify-center gap-0.5 border border-white/[0.07] bg-white/[0.025] px-1 py-1.5 font-tech text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 transition hover:border-tactical/30 hover:bg-tactical/10 hover:text-white"
          title="Open all controls"
        >
          <SlidersHorizontal size={16} />
          Controls
        </button>
      </div>
    </div>
  );
}
