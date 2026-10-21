"use client";
// AETHER PITCH v6.1 - HUD shell state.
// A calm fan-first surface by default, with every advanced tool living inside
// one control center. This keeps the pitch readable while preserving all
// broadcast, analytics and judge controls behind explicit buttons.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from "react";

export type HudMode = "live" | "analysis" | "studio";
export type ControlTab =
  | "cams"
  | "stats"
  | "voices"
  | "fan"
  | "copilot"
  | "cv"
  | "data"
  | "prod";
export type DockTool = "player" | "replay" | "moments" | null;

/* ------------------------------------------- v6.2 accessible broadcast palette */

export interface BroadcastPalette {
  /** Primary / home-team / danger accent. */
  primary: string;
  /** Secondary / away-team accent. */
  secondary: string;
  /** Positive / verified accent. */
  positive: string;
  /** Warning / caution accent. */
  warning: string;
  /** Neutral readable text. */
  neutral: string;
  colorblindSafe: boolean;
}

export const STANDARD_PALETTE: BroadcastPalette = {
  primary: "#FF1E56",
  secondary: "#00F0FF",
  positive: "#00FF85",
  warning: "#FFC24D",
  neutral: "#E2E8F0",
  colorblindSafe: false,
};

/**
 * Deuteranopia / protanopia-safe broadcast palette.
 * Electric cyan vs warm amber vs magenta keeps every semantic distinction
 * separable when red and green are hard to tell apart.
 */
export const ACCESSIBLE_PALETTE: BroadcastPalette = {
  primary: "#00E5FF",
  secondary: "#FFB300",
  positive: "#FF00D4",
  warning: "#FFB300",
  neutral: "#F1F5F9",
  colorblindSafe: true,
};

export function resolvePalette(colorblindSafe: boolean): BroadcastPalette {
  return colorblindSafe ? ACCESSIBLE_PALETTE : STANDARD_PALETTE;
}

interface HudContextValue {
  hudMode: HudMode;
  setHudMode: (m: HudMode) => void;
  controlCenterOpen: boolean;
  setControlCenterOpen: Dispatch<SetStateAction<boolean>>;
  controlTab: ControlTab;
  setControlTab: (t: ControlTab) => void;
  openControlCenter: (tab?: ControlTab) => void;
  dockTool: DockTool;
  setDockTool: Dispatch<SetStateAction<DockTool>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  colorblindSafe: boolean;
  setColorblindSafe: Dispatch<SetStateAction<boolean>>;
  palette: BroadcastPalette;
}

const HudContext = createContext<HudContextValue | null>(null);

export function HudProvider({ children }: { children: ReactNode }) {
  const [hudMode, setHudMode] = useState<HudMode>("live");
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [controlTab, setControlTab] = useState<ControlTab>("cams");
  const [dockTool, setDockTool] = useState<DockTool>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [colorblindSafe, setColorblindSafe] = useState(false);
  const palette = useMemo(() => resolvePalette(colorblindSafe), [colorblindSafe]);

  const openControlCenter = useCallback((tab?: ControlTab) => {
    if (tab) setControlTab(tab);
    setDockTool(null);
    setControlCenterOpen(true);
  }, []);

  // Escape closes transient HUD surfaces. Dialog Escape is handled by
  // useModalA11y; cinema-mode Escape by the page orchestrator.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDockTool(null);
      setControlCenterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<HudContextValue>(
    () => ({
      hudMode, setHudMode,
      controlCenterOpen, setControlCenterOpen,
      controlTab, setControlTab,
      openControlCenter,
      dockTool, setDockTool,
      shortcutsOpen, setShortcutsOpen,
      colorblindSafe, setColorblindSafe,
      palette,
    }),
    [
      hudMode, controlCenterOpen, controlTab, openControlCenter, dockTool,
      shortcutsOpen, colorblindSafe, palette,
    ],
  );

  return <HudContext.Provider value={value}>{children}</HudContext.Provider>;
}

export function useHud(): HudContextValue {
  const ctx = useContext(HudContext);
  if (!ctx) throw new Error("useHud must be used inside <HudProvider>");
  return ctx;
}
