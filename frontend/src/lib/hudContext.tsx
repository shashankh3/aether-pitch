"use client";
// AETHER PITCH v6.0 — HUD shell state.
// Broadcast mode (LIVE / ANALYSIS / STUDIO), the active right-dock tab,
// dock popover visibility, the mobile panel sheet and the shortcuts overlay.
// Kept in a small context so layout components read/write it without
// threading props through the page orchestrator.

import {
  createContext, useContext, useEffect, useMemo, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from "react";

export type HudMode = "live" | "analysis" | "studio";
export type DockTab = "voices" | "copilot" | "fan";
export type SheetTab = "cams" | "voices" | "copilot" | "fan" | "radar" | "cv" | "telestrate" | "prod";

interface HudContextValue {
  hudMode: HudMode;
  setHudMode: (m: HudMode) => void;
  dockTab: DockTab;
  setDockTab: (t: DockTab) => void;
  sheetTab: SheetTab;
  setSheetTab: (t: SheetTab) => void;
  playerPanelOpen: boolean;
  setPlayerPanelOpen: Dispatch<SetStateAction<boolean>>;
  pipelinePanelOpen: boolean;
  setPipelinePanelOpen: Dispatch<SetStateAction<boolean>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  mobileSheetOpen: boolean;
  setMobileSheetOpen: Dispatch<SetStateAction<boolean>>;
  isDesktop: boolean;
}

const HudContext = createContext<HudContextValue | null>(null);

export function HudProvider({ children }: { children: ReactNode }) {
  const [hudMode, setHudMode] = useState<HudMode>("live");
  const [dockTab, setDockTab] = useState<DockTab>("voices");
  const [sheetTab, setSheetTab] = useState<SheetTab>("cams");
  const [playerPanelOpen, setPlayerPanelOpen] = useState(false);
  const [pipelinePanelOpen, setPipelinePanelOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Escape closes transient HUD surfaces (popovers / sheet). Modal Escape is
  // handled by useModalA11y; cinema-mode Escape by the page orchestrator.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlayerPanelOpen(false);
      setPipelinePanelOpen(false);
      setMobileSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<HudContextValue>(
    () => ({
      hudMode, setHudMode,
      dockTab, setDockTab,
      sheetTab, setSheetTab,
      playerPanelOpen, setPlayerPanelOpen,
      pipelinePanelOpen, setPipelinePanelOpen,
      shortcutsOpen, setShortcutsOpen,
      mobileSheetOpen, setMobileSheetOpen,
      isDesktop,
    }),
    [hudMode, dockTab, sheetTab, playerPanelOpen, pipelinePanelOpen, shortcutsOpen, mobileSheetOpen, isDesktop],
  );

  return <HudContext.Provider value={value}>{children}</HudContext.Provider>;
}

export function useHud(): HudContextValue {
  const ctx = useContext(HudContext);
  if (!ctx) throw new Error("useHud must be used inside <HudProvider>");
  return ctx;
}
