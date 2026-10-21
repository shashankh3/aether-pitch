"use client";
// AETHER PITCH v6.0 — TopBar: brand + connection, the three broadcast mode
// tabs (LIVE / ANALYSIS / STUDIO), the global market-language selector,
// judge autopilot trigger, cinema / fullscreen / shortcuts controls.
// On <xl it also carries the button that opens the mobile panel sheet.

import { Clapperboard, Eye, EyeOff, HelpCircle, Maximize2, Minimize2, Play, PanelRightOpen, Radio, Square, Trophy } from "lucide-react";
import type { LangCode } from "@/lib/types";
import { LANG_LABELS } from "@/lib/types";
import { AUTOPILOT_TOTAL_SECONDS } from "@/components/JudgeAutopilotTour";
import { useHud, type HudMode } from "@/lib/hudContext";
import { cn } from "@/lib/utils";

const MODES: { id: HudMode; label: string; title: string }[] = [
  { id: "live", label: "Live", title: "Clean broadcast view (L)" },
  { id: "analysis", label: "Analysis", title: "CV auto-eventing + tactical tooling (A)" },
  { id: "studio", label: "Studio", title: "Alpha compositing, JSON, verify, recap (S)" },
];

interface Props {
  connected: boolean;
  lang: LangCode;
  onLang: (l: LangCode) => void;
  alphaMode: boolean;
  cinemaMode: boolean;
  onToggleCinema: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  autopilotActive: boolean;
  autopilotElapsed: number;
  autopilotStep: number;
  onToggleAutopilot: () => void;
}

export default function TopBar({
  connected, lang, onLang, alphaMode, cinemaMode, onToggleCinema,
  isFullscreen, onToggleFullscreen, autopilotActive, autopilotElapsed, autopilotStep, onToggleAutopilot,
}: Props) {
  const { hudMode, setHudMode, setShortcutsOpen, mobileSheetOpen, setMobileSheetOpen } = useHud();

  return (
    <header className="clip-ea panel-lux pointer-events-auto flex h-[46px] items-center gap-2 px-2.5">
      {/* brand + connection */}
      <div className="flex shrink-0 items-center gap-2">
        <div
          className="clip-skew flex h-8 w-8 items-center justify-center bg-gradient-to-br from-violetdeep via-[#6d1250] to-crimson"
          style={{ boxShadow: "0 0 16px rgba(255,30,86,0.35)" }}
        >
          <Radio size={16} className="text-white" />
        </div>
        <div className="leading-none">
          <div className="font-display text-[16px] font-bold uppercase tracking-[0.1em] text-white">
            AETHER<span className="text-tactical">PITCH</span>
          </div>
          <div className="mt-0.5 hidden items-center gap-1.5 sm:flex">
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-crimson animate-breathe" : "bg-slate-600")} />
            <span className="font-tech text-[8.5px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              3D Broadcast · 10 Hz
            </span>
          </div>
        </div>
      </div>

      {/* broadcast mode tabs */}
      <nav
        aria-label="Broadcast mode"
        className="mx-auto flex items-center gap-0.5 border border-white/10 bg-black/30 p-0.5"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setHudMode(m.id)}
            aria-pressed={hudMode === m.id}
            data-mode={m.id}
            className="hud-tab clip-skew"
            title={m.title}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {/* global market language — one switcher drives TwinCast, co-pilot,
          recap and the Stage-E personalization POST */}
      <div className="hidden shrink-0 items-center gap-0.5 border border-white/10 bg-black/30 p-0.5 md:flex" role="group" aria-label="Market language">
        {(["en", "es", "ar", "hi"] as LangCode[]).map((l) => (
          <button
            key={l}
            onClick={() => onLang(l)}
            aria-pressed={lang === l}
            className={cn(
              "px-1.5 py-0.5 font-tech text-[10px] font-bold uppercase tracking-wider transition",
              lang === l ? "bg-pitch/20 text-pitch" : "text-slate-500 hover:text-slate-300",
            )}
            title={`Commentary language: ${LANG_LABELS[l]}`}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>

      {/* right control cluster */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onToggleAutopilot}
          className={cn(
            "clip-skew flex items-center gap-1.5 border px-2 py-1 font-tech text-[10px] font-bold uppercase tracking-wider transition",
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
          <Trophy size={12} className="hidden lg:inline" />
        </button>

        <button
          onClick={onToggleCinema}
          disabled={alphaMode}
          aria-pressed={cinemaMode}
          className="clip-skew border border-white/10 bg-slate-950/75 p-1.5 text-slate-400 hover:border-tactical/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          title="Clean broadcast feed (H)"
          aria-label="Enter clean broadcast feed"
        >
          {cinemaMode ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          onClick={onToggleFullscreen}
          className="clip-skew border border-white/10 bg-slate-950/75 p-1.5 text-slate-400 hover:border-tactical/40 hover:text-white"
          title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button
          onClick={() => setShortcutsOpen(true)}
          className="clip-skew border border-white/10 bg-slate-950/75 p-1.5 text-slate-400 hover:border-tactical/40 hover:text-white"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <HelpCircle size={13} />
        </button>
        {/* mobile panel sheet trigger */}
        <button
          onClick={() => setMobileSheetOpen((o) => !o)}
          aria-expanded={mobileSheetOpen}
          className={cn(
            "clip-skew border p-1.5 xl:hidden",
            mobileSheetOpen
              ? "border-tactical/50 bg-tactical/15 text-tactical"
              : "border-white/10 bg-slate-950/75 text-slate-400 hover:text-white",
          )}
          title="Panels: cameras, AI voices, co-pilot, fan tuner, radar, CV…"
          aria-label="Open panels sheet"
        >
          {mobileSheetOpen ? <Clapperboard size={13} /> : <PanelRightOpen size={13} />}
        </button>
      </div>
    </header>
  );
}
