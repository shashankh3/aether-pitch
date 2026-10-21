"use client";
// AETHER PITCH v6.0 — Left rail: scorebug (always) + mode-gated tooling.
// LIVE: clean rail. ANALYSIS: CV auto-eventing viewport. STUDIO: production
// panel (alpha / JSON / verify / recap).

import ScoreBug from "@/components/ScoreBug";
import MatchIntelPanel from "@/components/MatchIntelPanel";
import VisionAutoEventerHUD from "@/components/VisionAutoEventerHUD";
import ProductionPanel from "@/components/hud/ProductionPanel";
import type { MatchEvent, MatchTick, Metrics } from "@/lib/types";
import { useHud } from "@/lib/hudContext";

interface Props {
  tick: MatchTick | null;
  metrics: Metrics | null;
  events: MatchEvent[];
  cvExpanded: boolean | null;
  alphaMode: boolean;
  alphaBackdrop: "checker" | "green";
  onToggleAlpha: () => void;
  onToggleBackdrop: () => void;
  onShowAlphaModal: () => void;
  onShowRubric: () => void;
  onShowRecap: () => void;
}

export default function LeftRail({
  tick, metrics, events, cvExpanded, alphaMode, alphaBackdrop,
  onToggleAlpha, onToggleBackdrop, onShowAlphaModal, onShowRubric, onShowRecap,
}: Props) {
  const { hudMode, isDesktop } = useHud();

  return (
    <div className="flex min-h-0 flex-col items-center gap-2 xl:items-start">
      <ScoreBug tick={tick} metrics={metrics} />
      <MatchIntelPanel tick={tick} metrics={metrics} />

      {/* CV auto-eventing — ANALYSIS mode, desktop (mobile: panel sheet → CV tab) */}
      {hudMode === "analysis" && isDesktop && (
        <div className="min-h-0 w-full">
          <VisionAutoEventerHUD events={events} expandedOverride={cvExpanded} />
        </div>
      )}

      {/* production cluster — STUDIO mode, desktop */}
      {hudMode === "studio" && isDesktop && (
        <ProductionPanel
          alphaMode={alphaMode}
          alphaBackdrop={alphaBackdrop}
          onToggleAlpha={onToggleAlpha}
          onToggleBackdrop={onToggleBackdrop}
          onShowAlphaModal={onShowAlphaModal}
          onShowRubric={onShowRubric}
          onShowRecap={onShowRecap}
        />
      )}
    </div>
  );
}
