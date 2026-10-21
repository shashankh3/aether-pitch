"use client";
// AETHER PITCH v6.0 — Right dock: one component, two presentations.
//   xl+  : static grid rail — CameraDirectorBar on top, a 3-tab container
//          (AI Voices / 12th Man / Fan) and the radar minimap below.
//   <xl  : fixed bottom sheet opened from the TopBar panels button, with a
//          full tab strip (CAMS / VOICES / COPILOT / FAN / RADAR / CV /
//          TELESTRATE / PROD).
// Sharing one instance set keeps TwinCast auto-speak and co-pilot state
// single-sourced across breakpoints.

import CameraDirectorBar from "@/components/CameraDirectorBar";
import TwinCastHUD from "@/components/TwinCastHUD";
import StudioProducer from "@/components/StudioProducer";
import FanPersonalizationPanel from "@/components/FanPersonalizationTuner";
import TacticalRadarMiniMap from "@/components/TacticalRadarMiniMap";
import PlayerLock360 from "@/components/PlayerLock360";
import VisionAutoEventerHUD from "@/components/VisionAutoEventerHUD";
import ProductionPanel from "@/components/hud/ProductionPanel";
import { TelestratorTools } from "@/components/TelestratorDVRBar";
import type {
  ClubBias, Insight, LangCode, MatchEvent, MatchTick, MetricFocus, Metrics,
  PersonalizationState, PersonaMode, Recap, StudioQueryResponse, TelestratorState,
} from "@/lib/types";
import type { OverlayToggles } from "@/components/three/HoloPitch3D";
import type { CameraMode } from "@/lib/types";
import { useHud, type DockTab, type SheetTab } from "@/lib/hudContext";
import { cn } from "@/lib/utils";

interface Props {
  // camera director
  camMode: CameraMode;
  pickCamera: (m: CameraMode) => void;
  toggles: OverlayToggles;
  toggleKey: (id: keyof OverlayToggles) => void;
  aiDirected: boolean;
  // AI voices tab
  insights: Insight[];
  persona: PersonaMode;
  onPersona: (p: PersonaMode) => void;
  lang: LangCode;
  metrics: Metrics | null;
  tick: MatchTick | null;
  latestEvent: MatchEvent | null;
  metricFocus: MetricFocus;
  clubBias: ClubBias;
  // 12th Man tab
  latest: Insight | null;
  studioRecap: Recap | null;
  onCloseRecap: () => void;
  lockedId: string | null;
  onStudioDirective: (d: StudioQueryResponse["scene_directive"]) => void;
  // Fan tab
  personalization: PersonalizationState;
  applyPreferences: (next: PersonalizationState) => void;
  // radar + player
  telestrator: TelestratorState;
  onLock: (id: string | null) => void;
  events: MatchEvent[];
  // telestrate sheet tab
  toggleTelestrator: (key: keyof Omit<TelestratorState, "customTacticalArrows" | "spotlightPlayerIds">) => void;
  autoSpotlight: () => void;
  // cv sheet tab
  cvExpanded: boolean | null;
  // production sheet tab
  alphaMode: boolean;
  alphaBackdrop: "checker" | "green";
  onToggleAlpha: () => void;
  onToggleBackdrop: () => void;
  onShowAlphaModal: () => void;
  onShowRubric: () => void;
  onShowRecap: () => void;
}

const DOCK_TABS: { id: DockTab; label: string }[] = [
  { id: "voices", label: "AI Voices" },
  { id: "copilot", label: "12th Man" },
  { id: "fan", label: "Fan" },
];

const SHEET_TABS: { id: SheetTab; label: string }[] = [
  { id: "cams", label: "Cams" },
  { id: "voices", label: "Voices" },
  { id: "copilot", label: "Co-Pilot" },
  { id: "fan", label: "Fan" },
  { id: "radar", label: "Radar" },
  { id: "cv", label: "CV" },
  { id: "telestrate", label: "Telestrate" },
  { id: "prod", label: "Prod" },
];

export default function RightDock(props: Props) {
  const {
    camMode, pickCamera, toggles, toggleKey, aiDirected,
    insights, persona, onPersona, lang, metrics, tick, latestEvent, metricFocus, clubBias,
    latest, studioRecap, onCloseRecap, lockedId, onStudioDirective,
    personalization, applyPreferences,
    telestrator, onLock, events, cvExpanded,
    toggleTelestrator, autoSpotlight,
    alphaMode, alphaBackdrop, onToggleAlpha, onToggleBackdrop,
    onShowAlphaModal, onShowRubric, onShowRecap,
  } = props;

  const { dockTab, setDockTab, sheetTab, setSheetTab, mobileSheetOpen, isDesktop } = useHud();

  const fanActive = metricFocus !== "ALL" || clubBias !== "NEUTRAL";

  const voicesPanel = (
    <TwinCastHUD
      insights={insights}
      persona={persona}
      onPersona={onPersona}
      lang={lang}
      metrics={metrics}
      tick={tick}
      latestEvent={latestEvent}
      metricFocus={metricFocus}
      clubBias={clubBias}
    />
  );

  const copilotPanel = (
    <StudioProducer
      latest={latest}
      recap={studioRecap}
      onCloseRecap={onCloseRecap}
      lang={lang}
      lockedId={lockedId}
      onStudioDirective={onStudioDirective}
    />
  );

  const fanPanel = (
    <FanPersonalizationPanel state={personalization} onChange={applyPreferences} />
  );

  return (
    <aside
      aria-label="Studio panels"
      className={cn(
        "pointer-events-auto flex-col gap-2",
        mobileSheetOpen
          ? "fixed inset-x-2 bottom-2 z-40 flex max-h-[72dvh] animate-slide-up"
          : "hidden",
        // desktop: always the static grid rail
        "xl:static xl:inset-auto xl:z-auto xl:flex xl:max-h-none xl:min-h-0 xl:col-start-3 xl:row-start-2",
      )}
    >
      {/* ---------------- mobile sheet tab strip ---------------- */}
      {mobileSheetOpen && !isDesktop && (
        <div className="clip-ea panel-lux shrink-0 p-1">
          <div className="scroll-slim flex gap-0.5 overflow-x-auto" role="tablist" aria-label="Panel sections">
            {SHEET_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={sheetTab === t.id}
                onClick={() => setSheetTab(t.id)}
                className="dock-tab shrink-0"
              >
                {t.label}
                {t.id === "fan" && fanActive ? " •" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- mobile sheet content ---------------- */}
      {mobileSheetOpen && !isDesktop && (
        <div className="clip-ea panel-lux scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
          {sheetTab === "cams" && (
            <CameraDirectorBar
              mode={camMode}
              onMode={pickCamera}
              toggles={toggles}
              onToggle={toggleKey}
              aiDirected={aiDirected}
            />
          )}
          {sheetTab === "voices" && <div className="h-[56dvh]">{voicesPanel}</div>}
          {sheetTab === "copilot" && copilotPanel}
          {sheetTab === "fan" && fanPanel}
          {sheetTab === "radar" && !isDesktop && (
            <div className="space-y-2">
              <TacticalRadarMiniMap lockedId={lockedId} telestrator={telestrator} onLock={onLock} />
              <PlayerLock360
                tick={tick}
                lockedId={lockedId}
                onLock={onLock}
                events={events}
                lang={lang}
                insightLine={latest?.stage_e_personalization.player_lock_insight ?? null}
              />
            </div>
          )}
          {sheetTab === "cv" && <VisionAutoEventerHUD events={events} expandedOverride={cvExpanded} />}
          {sheetTab === "telestrate" && (
            <div className="clip-ea border border-white/15 bg-slate-950/85 p-2">
              <div className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Telestrator Tools
              </div>
              <div className="flex gap-1.5">
                <TelestratorTools
                  telestrator={telestrator}
                  onToggleTelestrator={toggleTelestrator}
                  onToggleSpotlight={autoSpotlight}
                />
              </div>
              <p className="mt-1.5 font-tech text-[9px] leading-relaxed text-slate-500">
                Freeze the feed with the DVR button in the bottom dock, then draw.
              </p>
            </div>
          )}
          {sheetTab === "prod" && (
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
      )}

      {/* ---------------- desktop rail ---------------- */}
      {isDesktop && (
        <>
          <CameraDirectorBar
            mode={camMode}
            onMode={pickCamera}
            toggles={toggles}
            onToggle={toggleKey}
            aiDirected={aiDirected}
          />

          <div className="clip-ea panel-lux flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 border-b border-white/10" role="tablist" aria-label="Studio panels">
              {DOCK_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={dockTab === t.id}
                  onClick={() => setDockTab(t.id)}
                  className="dock-tab"
                >
                  {t.label}
                  {t.id === "fan" && fanActive ? " •" : ""}
                </button>
              ))}
            </div>
            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
              {dockTab === "voices" && <div className="h-full">{voicesPanel}</div>}
              {dockTab === "copilot" && copilotPanel}
              {dockTab === "fan" && fanPanel}
            </div>
          </div>

          <div className="flex shrink-0 justify-center">
            <TacticalRadarMiniMap lockedId={lockedId} telestrator={telestrator} onLock={onLock} />
          </div>
        </>
      )}
    </aside>
  );
}
