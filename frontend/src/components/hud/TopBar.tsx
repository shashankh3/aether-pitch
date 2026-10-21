"use client";
// AETHER PITCH v6.1 — calm top bar: brand, connection, autopilot, one
// Controls button. Mode tabs and the full language switcher now live inside
// the Control Center so the default broadcast view stays uncluttered.

import {
  Eye, EyeOff, Languages, Maximize2, Minimize2, Play, Radio, SlidersHorizontal,
  Square, Trophy, Volume2, VolumeX,
} from "lucide-react";
import type { LangCode } from "@/lib/types";
import { LANG_LABELS } from "@/lib/types";
import { AUTOPILOT_TOTAL_SECONDS } from "@/components/JudgeAutopilotTour";
import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { useHud } from "@/lib/hudContext";
import { cn } from "@/lib/utils";

interface Props {
  connected: boolean;
  lang: LangCode;
  alphaMode: boolean;
  cinemaMode: boolean;
  onToggleCinema: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  autopilotActive: boolean;
  autopilotElapsed: number;
  autopilotStep: number;
  onToggleAutopilot: () => void;
  isSpeaking: boolean;
  isVoiceMuted: boolean;
  onToggleMute: () => void;
}

export default function TopBar({
  connected, lang, alphaMode, cinemaMode, onToggleCinema,
  isFullscreen, onToggleFullscreen, autopilotActive, autopilotElapsed, autopilotStep, onToggleAutopilot,
  isSpeaking, isVoiceMuted, onToggleMute,
}: Props) {
  const { controlCenterOpen, openControlCenter, palette } = useHud();
  const { fps, frameMs } = useRenderTelemetry();

  return (
    <header className="clip-ea panel-lux pointer-events-auto flex h-[52px] items-center gap-2 px-3">
      {/* brand + connection */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="clip-skew flex h-8 w-8 items-center justify-center bg-gradient-to-br from-violetdeep via-[#6d1250] to-crimson"
          style={{ boxShadow: "0 0 16px rgba(255,30,86,0.35)" }}
        >
          <Radio size={16} className="text-white" />
        </div>
        <div className="min-w-0 leading-none">
          <div className="truncate font-display text-[16px] font-bold uppercase tracking-[0.1em] text-white">
            AETHER<span className="text-tactical">PITCH</span>
          </div>
          <div className="mt-1 hidden items-center gap-1.5 sm:flex">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", connected ? "animate-breathe" : "bg-slate-600")}
              style={connected ? { background: palette.positive } : undefined}
            />
            <span className="font-tech text-[8.5px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Live 3D Broadcast · 10 Hz
            </span>
            <span
              className="border border-white/10 bg-black/40 px-1 py-px font-mono text-[8.5px] font-bold tabular-nums text-slate-300"
              title="Measured render frame rate and frame time from the requestAnimationFrame loop"
            >
              {fps > 0 ? `${fps} FPS` : "-- FPS"}
              <span className="ml-1 text-slate-500">{frameMs > 0 ? `${frameMs.toFixed(1)}ms` : ""}</span>
            </span>
          </div>
        </div>
      </div>

      {/* right control cluster */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          onClick={onToggleMute}
          aria-pressed={isVoiceMuted}
          className={cn(
            "clip-skew flex h-8 items-center gap-1 border px-2 transition",
            !isVoiceMuted && !isSpeaking && "border-white/10 bg-slate-950/75 text-slate-400 hover:border-tactical/40 hover:text-white",
          )}
          style={
            isVoiceMuted
              ? { borderColor: `${palette.warning}55`, background: `${palette.warning}18`, color: palette.warning }
              : isSpeaking
                ? { borderColor: `${palette.positive}55`, background: `${palette.positive}18`, color: palette.positive }
                : undefined
          }
          title={isVoiceMuted ? "Unmute AI broadcast voice" : "Mute AI broadcast voice"}
        >
          {isVoiceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {isSpeaking && !isVoiceMuted && (
            <span className="h-1.5 w-1.5 animate-breathe rounded-full" style={{ background: palette.positive }} />
          )}
          <span className="sr-only">{isVoiceMuted ? "Unmute AI voice" : "Mute AI voice"}</span>
        </button>

        <button
          onClick={() => openControlCenter("fan")}
          className="clip-skew hidden h-8 items-center gap-1.5 border border-white/10 bg-slate-950/75 px-2 font-tech text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:border-tactical/40 hover:text-white md:flex"
          title={`Commentary language: ${LANG_LABELS[lang]} — open Fan controls`}
          aria-label={`Commentary language ${LANG_LABELS[lang]} — open Fan controls`}
        >
          <Languages size={12} className="text-tactical" />
          {LANG_LABELS[lang]}
        </button>

        <button
          onClick={onToggleAutopilot}
          aria-pressed={autopilotActive}
          className={cn(
            "clip-skew flex h-8 items-center gap-1.5 border px-2 font-tech text-[10px] font-bold uppercase tracking-wider transition",
            autopilotActive
              ? "border-crimson/60 bg-crimson/15 text-crimson"
              : "animate-breathe border-gold/60 bg-gold/15 text-gold hover:bg-gold/25",
          )}
          title={`Run the ${AUTOPILOT_TOTAL_SECONDS}-second, 6-step judge autopilot demo`}
        >
          {autopilotActive ? <Square size={12} /> : <Play size={12} />}
          <span className="hidden lg:inline">
            {autopilotActive
              ? `Autopilot ${Math.max(1, autopilotStep + 1)}/6 · ${Math.ceil(AUTOPILOT_TOTAL_SECONDS - autopilotElapsed)}s`
              : `${AUTOPILOT_TOTAL_SECONDS}s Autopilot`}
          </span>
          <span className="sr-only lg:hidden">
            {autopilotActive ? "Stop autopilot" : "Start autopilot"}
          </span>
          <Trophy size={12} className="hidden lg:inline" />
        </button>

        <button
          onClick={() => openControlCenter()}
          aria-expanded={controlCenterOpen}
          aria-controls="control-center"
          aria-label="Open controls"
          className={cn(
            "clip-skew flex h-8 items-center gap-1.5 border px-2 font-tech text-[10px] font-bold uppercase tracking-wider transition",
            controlCenterOpen
              ? "border-tactical/50 bg-tactical/15 text-tactical"
              : "border-white/10 bg-slate-950/75 text-slate-300 hover:border-tactical/40 hover:text-white",
          )}
          title="Open all controls: cameras, stats, AI voices, fan, co-pilot, data"
        >
          <SlidersHorizontal size={13} />
          <span className="hidden md:inline">Controls</span>
        </button>

        <button
          onClick={onToggleCinema}
          disabled={alphaMode}
          aria-pressed={cinemaMode}
          className="clip-skew flex h-8 items-center border border-white/10 bg-slate-950/75 px-2 text-slate-400 hover:border-tactical/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          title="Clean broadcast feed (H)"
          aria-label="Enter clean broadcast feed"
        >
          {cinemaMode ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          onClick={onToggleFullscreen}
          className="clip-skew flex h-8 items-center border border-white/10 bg-slate-950/75 px-2 text-slate-400 hover:border-tactical/40 hover:text-white"
          title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </header>
  );
}
