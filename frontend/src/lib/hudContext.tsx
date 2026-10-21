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
}

const HudContext = createContext<HudContextValue | null>(null);

export function HudProvider({ children }: { children: ReactNode }) {
  const [hudMode, setHudMode] = useState<HudMode>("live");
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [controlTab, setControlTab] = useState<ControlTab>("cams");
  const [dockTool, setDockTool] = useState<DockTool>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
    }),
    [
      hudMode, controlCenterOpen, controlTab, openControlCenter, dockTool,
      shortcutsOpen,
    ],
  );

  return <HudContext.Provider value={value}>{children}</HudContext.Provider>;
}

export function useHud(): HudContextValue {
  const ctx = useContext(HudContext);
  if (!ctx) throw new Error("useHud must be used inside <HudProvider>");
  return ctx;
}
