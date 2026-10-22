"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BarChart3, BookOpen, Clapperboard, Crosshair, Database, Eye,
  Film, Heart, Layers, Maximize2, Play, Radar, Radio, ScanEye, Search,
  Sparkles, Trophy, Video, type LucideIcon,
} from "lucide-react";
import AetherMark from "@/components/hud/AetherMark";
import { useHud } from "@/lib/hudContext";
import { useModalA11y } from "@/lib/useModalA11y";
import type { CameraMode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onScenario: (name: string) => void;
  onCamera: (mode: CameraMode) => void;
  onToggleAutopilot: () => void;
  onToggleCinema: () => void;
  onToggleFullscreen: () => void;
  onToggleAlpha: () => void;
  onShowGlossary: () => void;
  onShowRubric: () => void;
  onShowRecap: () => void;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: LucideIcon;
  keywords: string;
  run: () => void;
}

export default function CommandPalette({
  open, onClose, onScenario, onCamera, onToggleAutopilot, onToggleCinema,
  onToggleFullscreen, onToggleAlpha, onShowGlossary, onShowRubric, onShowRecap,
}: Props) {
  const { openControlCenter } = useHud();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useModalA11y(open, onClose, panelRef);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const close = onClose;
    return [
      { id: "go-watch", label: "Watch", hint: "Cameras & AR overlays", group: "Control center", icon: Video, keywords: "camera overlays watch", run: () => openControlCenter("cams") },
      { id: "go-stats", label: "Match stats", hint: "Possession, xT, pressing, players", group: "Control center", icon: BarChart3, keywords: "stats intelligence xg xt", run: () => openControlCenter("stats") },
      { id: "go-voices", label: "AI voices", hint: "TwinCast commentary personas", group: "Control center", icon: Radio, keywords: "voice commentary persona language", run: () => openControlCenter("voices") },
      { id: "go-fan", label: "Fan lens", hint: "Density, bias, metric lock, palette", group: "Control center", icon: Heart, keywords: "fan personalization colorblind language", run: () => openControlCenter("fan") },
      { id: "go-copilot", label: "Ask the 12th Man", hint: "Studio co-pilot & live reasoning", group: "Control center", icon: Sparkles, keywords: "copilot ask ai studio producer", run: () => openControlCenter("copilot") },
      { id: "go-cv", label: "CV auto-eventing", hint: "Spatial viewport & passing network", group: "Control center", icon: ScanEye, keywords: "computer vision cv tracking", run: () => openControlCenter("cv") },
      { id: "go-data", label: "Pipeline data", hint: "Foundry trace, evals, failover drill", group: "Control center", icon: Database, keywords: "azure foundry pipeline data failover", run: () => openControlCenter("data") },
      { id: "go-prod", label: "Studio production", hint: "Alpha, recap, war-room, telestration", group: "Control center", icon: Clapperboard, keywords: "studio production alpha recap war room", run: () => openControlCenter("prod") },

      { id: "act-autopilot", label: "Run 80s autopilot", hint: "Six-step judge tour with voiceover", group: "Live actions", icon: Play, keywords: "demo tour judge autopilot", run: onToggleAutopilot },
      { id: "act-recap", label: "Open cinematic recap", hint: "Three-act match storyboard", group: "Live actions", icon: Film, keywords: "recap highlights story", run: onShowRecap },
      { id: "act-alpha", label: "Broadcast alpha output", hint: "Transparent SMPTE AR layer", group: "Live actions", icon: Layers, keywords: "alpha smpte overlay ar chroma", run: onToggleAlpha },
      { id: "act-cinema", label: "Clean feed", hint: "Hide the HUD · H", group: "Live actions", icon: Eye, keywords: "cinema clean hide hud", run: onToggleCinema },
      { id: "act-fullscreen", label: "Toggle fullscreen", hint: "Immersive presentation · F", group: "Live actions", icon: Maximize2, keywords: "fullscreen present", run: onToggleFullscreen },
      { id: "act-glossary", label: "Plain-English glossary", hint: "Every metric explained", group: "Live actions", icon: BookOpen, keywords: "glossary explain help metrics", run: onShowGlossary },
      { id: "act-rubric", label: "Judge rubric proof", hint: "Five-stage verification", group: "Live actions", icon: Trophy, keywords: "rubric proof judge verify", run: onShowRubric },

      { id: "cam-tele", label: "Tele broadcast", hint: "Classic touchline camera", group: "Cameras", icon: Video, keywords: "camera tele broadcast", run: () => onCamera("TELE_BROADCAST") },
      { id: "cam-lock", label: "Player lock", hint: "Third-person follow cam", group: "Cameras", icon: Crosshair, keywords: "camera player lock follow", run: () => onCamera("PLAYER_LOCK_3RD_PERSON") },
      { id: "cam-drone", label: "Drone orbit", hint: "Sweeping tactical aerial", group: "Cameras", icon: Radar, keywords: "camera drone orbit aerial", run: () => onCamera("TACTICAL_DRONE_ORBIT") },
      { id: "cam-auto", label: "Auto director", hint: "AI chooses the shot", group: "Cameras", icon: Sparkles, keywords: "camera auto director ai", run: () => onCamera("AUTO_DIRECTOR") },

      { id: "sc-chaos", label: "Chaos counter", hint: "33 km/h transition scenario", group: "God mode", icon: Crosshair, keywords: "scenario chaos counter attack", run: () => onScenario("chaos_counter") },
      { id: "sc-press", label: "High-press trap", hint: "Turnover under pressure", group: "God mode", icon: Sparkles, keywords: "scenario press trap turnover", run: () => onScenario("high_press_turnover") },
      { id: "sc-invert", label: "Tactical inversion", hint: "Invert the right fullback", group: "God mode", icon: BarChart3, keywords: "scenario inversion fullback tactic", run: () => onScenario("tactical_inversion") },
      { id: "sc-recap", label: "Half-time recap", hint: "Generate the three-act story", group: "God mode", icon: Film, keywords: "scenario halftime recap story", run: () => onScenario("halftime_recap") },
    ].map((command) => ({
      ...command,
      run: () => {
        command.run();
        close();
      },
    }));
  }, [
    openControlCenter, onClose, onToggleAutopilot, onShowRecap, onToggleAlpha,
    onToggleCinema, onToggleFullscreen, onShowGlossary, onShowRubric, onCamera, onScenario,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint} ${command.group} ${command.keywords}`
        .toLowerCase()
        .includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const command = filtered[active];
    if (command) itemRefs.current[command.id]?.scrollIntoView({ block: "nearest" });
  }, [active, filtered, open]);

  if (!open) return null;

  const groups = Array.from(new Set(filtered.map((command) => command.group)));
  const activeCommand = filtered[active];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).tagName !== "INPUT") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (filtered.length ? (current + 1) % filtered.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (filtered.length ? (current - 1 + filtered.length) % filtered.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activeCommand?.run();
    }
  };

  return (
    <div className="modal-backdrop z-[70]" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        data-modal-panel
        role="dialog"
        aria-modal="true"
        aria-label="Aether command deck"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="command-panel outline-none"
      >
        <div className="relative z-[1] flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <AetherMark size={28} />
          <div className="min-w-0 flex-1">
            <div className="hud-kicker text-hud-cyan">Aether Command Deck</div>
            <div className="mt-0.5 font-display text-[15px] font-bold uppercase tracking-[0.16em] text-white">
              Every surface, one keystroke
            </div>
          </div>
          <span className="command-key hidden sm:inline-flex">ESC</span>
        </div>

        <div className="relative z-[1] flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search size={15} className="shrink-0 text-hud-cyan" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools, cameras, scenarios…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-autocomplete="list"
            aria-activedescendant={activeCommand ? `command-${activeCommand.id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-tech text-[16px] tracking-wide text-white placeholder:text-slate-500 focus:outline-none sm:text-[14px]"
          />
          <span className="command-key hidden sm:inline-flex">CTRL K</span>
        </div>

        <div
          id="command-results"
          className="command-results scroll-slim"
          role="listbox"
          aria-label="Available commands"
        >
          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="font-display text-[18px] uppercase tracking-[0.2em] text-slate-400">
                No signal
              </div>
              <p className="mt-1 font-tech text-[11px] uppercase tracking-[0.16em] text-slate-600">
                Try “camera”, “recap”, “foundry” or “press”
              </p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group}>
              <div className="command-group">{group}</div>
              {filtered.filter((command) => command.group === group).map((command) => {
                const Icon = command.icon;
                const id = `command-${command.id}`;
                const selected = activeCommand?.id === command.id;
                return (
                  <button
                    key={command.id}
                    id={id}
                    ref={(element) => { itemRefs.current[command.id] = element; }}
                    role="option"
                    aria-selected={selected}
                    data-command-item
                    data-active={selected}
                    onMouseEnter={() => setActive(filtered.indexOf(command))}
                    onClick={command.run}
                    className="command-item"
                  >
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center border",
                      selected
                        ? "border-hud-cyan/40 bg-hud-cyan/12 text-hud-cyan"
                        : "border-white/10 bg-black/30 text-slate-500",
                    )}>
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[13px] font-bold uppercase tracking-[0.1em]">
                        {command.label}
                      </span>
                      <span className="mt-0.5 block truncate font-tech text-[9.5px] uppercase tracking-[0.12em] text-slate-500">
                        {command.hint}
                      </span>
                    </span>
                    <ArrowRight size={13} className={cn("shrink-0 transition", selected ? "text-hud-cyan" : "text-slate-600")} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="relative z-[1] flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-3 font-tech text-[8.5px] font-bold uppercase tracking-[0.18em] text-slate-600">
            <span><span className="text-slate-400">↑↓</span> navigate</span>
            <span><span className="text-slate-400">↵</span> execute</span>
            <span><span className="text-slate-400">esc</span> close</span>
          </div>
          <span className="font-tech text-[8.5px] font-bold uppercase tracking-[0.18em] text-hud-cyan/60">
            {filtered.length} commands online
          </span>
        </div>
      </div>
    </div>
  );
}
