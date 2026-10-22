"use client";

import { memo } from "react";
import {
  BookOpen, Command, Eye, EyeOff, Languages, Maximize2, Minimize2, Play,
  SlidersHorizontal, Square, Trophy, Volume2, VolumeX,
} from "lucide-react";
import type { LangCode } from "@/lib/types";
import { LANG_LABELS } from "@/lib/types";
import { AUTOPILOT_TOTAL_SECONDS } from "@/components/JudgeAutopilotTour";
import AetherMark from "@/components/hud/AetherMark";
import { useRenderTelemetry } from "@/hooks/useRenderTelemetry";
import { useHud, type HudMode } from "@/lib/hudContext";
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
  onOpenGlossary: () => void;
  onOpenCommandPalette: () => void;
}

const MODE_CHIP: Record<HudMode, { label: string; tone: "green" | "cyan" | "gold" }> = {
  live: { label: "Live feed", tone: "green" },
  analysis: { label: "Analysis", tone: "cyan" },
  studio: { label: "Studio", tone: "gold" },
};

function TopBar({
  connected, lang, alphaMode, cinemaMode, onToggleCinema,
  isFullscreen, onToggleFullscreen, autopilotActive, autopilotElapsed, autopilotStep, onToggleAutopilot,
  isSpeaking, isVoiceMuted, onToggleMute, onOpenGlossary, onOpenCommandPalette,
}: Props) {
  const { controlCenterOpen, openControlCenter, palette, plainLanguage, setPlainLanguage, hudMode } = useHud();
  const { fps, frameMs } = useRenderTelemetry();
  const mode = MODE_CHIP[hudMode];
  const progress = autopilotActive
    ? Math.min(100, Math.max(0, (autopilotElapsed / AUTOPILOT_TOTAL_SECONDS) * 100))
    : 0;

  return (
    <header className="clip-ea panel-lux pointer-events-auto relative flex h-[52px] items-center gap-2 overflow-hidden px-2 sm:px-2.5">
      <div className="hud-sheen" aria-hidden />

      <div className="relative z-[3] flex min-w-0 items-center gap-2.5">
        <AetherMark
          size={30}
          className="hidden shrink-0 drop-shadow-[0_0_14px_rgba(0,240,255,0.45)] sm:block"
        />
        <AetherMark
          size={25}
          className="shrink-0 drop-shadow-[0_0_12px_rgba(0,240,255,0.4)] sm:hidden"
        />

        <div className="min-w-0 leading-none max-[359px]:hidden">
          <div className="truncate font-brand text-[10px] uppercase leading-none tracking-[0.08em] text-white sm:text-[12px] sm:tracking-[0.16em]">
            AETHER<span className="text-tactical">PITCH</span>
          </div>
          <div className="mt-1 hidden items-center gap-1.5 sm:flex">
            <span
              className={cn("hud-status-dot", connected ? "text-pitch" : "text-gold")}
              aria-hidden
            />
            <span className="font-tech text-[8px] font-semibold uppercase tracking-[0.26em] text-slate-400">
              {connected ? "Pipeline live" : "Edge fallback"}
            </span>
            <span className="hud-chip !px-1.5 !py-0.5 !tracking-[0.1em]">
              <span className="tabular-nums">{fps > 0 ? fps : "--"}</span> FPS
              <span className="hidden text-slate-600 md:inline">
                {frameMs > 0 ? `· ${frameMs.toFixed(1)}ms` : ""}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="hud-chip relative z-[3] ml-1 hidden items-center gap-1.5 md:inline-flex" data-tone={mode.tone}>
        <span className="h-1 w-1 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
        {mode.label}
      </div>

      <div className="relative z-[3] ml-auto flex shrink-0 items-center gap-1">
        <div className="mr-1 hidden items-center gap-2 xl:flex">
          <span className={cn("signal-bars", !connected && "opacity-40")} aria-hidden>
            <span /><span /><span /><span />
          </span>
          <span className="font-tech text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">
            10 Hz
          </span>
        </div>

        <span className="hud-divider mr-1 hidden h-6 lg:block" aria-hidden />

        <button
          onClick={() => setPlainLanguage(!plainLanguage)}
          aria-pressed={plainLanguage}
          className={cn(
            "hud-icon-btn hidden sm:inline-flex",
            plainLanguage && "!border-pitch/35 !bg-pitch/10 !text-pitch",
          )}
          title={plainLanguage
            ? "Plain-English labels on — switch to analyst terms"
            : "Analyst terms on — switch to plain English labels"}
          aria-label={plainLanguage
            ? "Plain English labels on. Switch to analyst terms."
            : "Analyst terms on. Switch to plain English labels."}
        >
          {plainLanguage ? <Eye size={13} /> : <EyeOff size={13} />}
          <span className="hidden font-tech text-[8.5px] font-bold uppercase tracking-[0.12em] xl:inline">
            {plainLanguage ? "Plain" : "Analyst"}
          </span>
        </button>

        <button
          onClick={onToggleMute}
          aria-pressed={isVoiceMuted}
          className={cn(
            "hud-icon-btn",
            !isVoiceMuted && !isSpeaking && "text-slate-400",
          )}
          style={
            isVoiceMuted
              ? { borderColor: `${palette.warning}55`, background: `${palette.warning}18`, color: palette.warning }
              : isSpeaking
                ? { borderColor: `${palette.positive}55`, background: `${palette.positive}18`, color: palette.positive }
                : undefined
          }
          title={isVoiceMuted ? "Unmute AI broadcast voice" : "Mute AI broadcast voice"}
          aria-label={isVoiceMuted ? "Unmute AI voice" : "Mute AI voice"}
        >
          {isVoiceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {isSpeaking && !isVoiceMuted && (
            <span className="h-1.5 w-1.5 animate-breathe rounded-full" style={{ background: palette.positive }} />
          )}
        </button>

        <button
          onClick={() => openControlCenter("fan")}
          className="hud-action hidden lg:inline-flex"
          title={`Commentary language: ${LANG_LABELS[lang]} — open Fan controls`}
          aria-label={`Commentary language ${LANG_LABELS[lang]} — open Fan controls`}
        >
          <Languages size={12} className="text-tactical" />
          {LANG_LABELS[lang]}
        </button>

        <button
          onClick={onOpenGlossary}
          className="hud-icon-btn hidden sm:inline-flex"
          title="What am I looking at? Every metric in plain English"
          aria-label="Open the plain-English glossary"
        >
          <BookOpen size={13} className="text-gold" />
        </button>

        <span className="hud-divider mx-1 h-6" aria-hidden />

        <button
          onClick={onToggleAutopilot}
          aria-pressed={autopilotActive}
          className={cn(
            "hud-action relative hidden overflow-hidden sm:inline-flex",
            !autopilotActive && "animate-breathe",
          )}
          data-tone={autopilotActive ? "danger" : "gold"}
          title={`Run the ${AUTOPILOT_TOTAL_SECONDS}-second, 6-step judge autopilot demo`}
        >
          {autopilotActive ? <Square size={11} /> : <Play size={11} />}
          <span className="hidden lg:inline">
            {autopilotActive
              ? `Auto ${Math.max(1, autopilotStep + 1)}/6 · ${Math.ceil(AUTOPILOT_TOTAL_SECONDS - autopilotElapsed)}s`
              : `${AUTOPILOT_TOTAL_SECONDS}s Auto`}
          </span>
          <span className="lg:hidden">{autopilotActive ? "Stop" : "Auto"}</span>
          <Trophy size={11} className="hidden xl:inline" />
          {autopilotActive && (
            <span
              className="absolute inset-x-0 bottom-0 h-px bg-current shadow-[0_0_8px_currentColor]"
              style={{ width: `${progress}%` }}
              aria-hidden
            />
          )}
        </button>

        <button
          onClick={onOpenCommandPalette}
          className="hud-icon-btn"
          title="Command deck (Ctrl K / ⌘K)"
          aria-label="Open the command deck"
        >
          <Command size={13} />
          <span className="hidden font-tech text-[8.5px] font-bold tracking-[0.1em] md:inline">K</span>
        </button>

        <button
          onClick={() => openControlCenter()}
          aria-expanded={controlCenterOpen}
          aria-controls="control-center"
          aria-label="Open controls"
          className="hud-action"
          data-tone={controlCenterOpen ? "cyan" : undefined}
          title="Open all controls: cameras, stats, AI voices, fan, co-pilot, data"
        >
          <SlidersHorizontal size={13} />
          <span className="hidden md:inline">Controls</span>
        </button>

        <button
          onClick={onToggleCinema}
          disabled={alphaMode}
          aria-pressed={cinemaMode}
          className="hud-icon-btn disabled:cursor-not-allowed disabled:opacity-30"
          title="Clean broadcast feed (H)"
          aria-label="Enter clean broadcast feed"
        >
          {cinemaMode ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>

        <button
          onClick={onToggleFullscreen}
          className="hud-icon-btn"
          title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </header>
  );
}

export default memo(TopBar);
