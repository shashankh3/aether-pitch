"use client";
// AETHER PITCH v6.1 — one calm Control Center for every optional surface:
// cameras, match stats, AI voices, fan personalization, co-pilot, CV, pipeline
// data and production tools. Closed by default so the 3D pitch is the hero.
// The same drawer works as a right rail on desktop and a bottom sheet on mobile.

import { useEffect, useRef } from "react";
import {
  BarChart3, Clapperboard, Database, Heart, Radio, ScanEye, Sparkles,
  Video, X, type LucideIcon,
} from "lucide-react";
import CameraDirectorBar from "@/components/CameraDirectorBar";
import TwinCastHUD from "@/components/TwinCastHUD";
import StudioProducer, { BenchWarRoomPanel } from "@/components/StudioProducer";
import FanPersonalizationPanel from "@/components/FanPersonalizationTuner";
import TacticalRadarMiniMap from "@/components/TacticalRadarMiniMap";
import PlayerLock360 from "@/components/PlayerLock360";
import VisionAutoEventerHUD from "@/components/VisionAutoEventerHUD";
import ProductionPanel from "@/components/hud/ProductionPanel";
import MatchIntelPanel from "@/components/MatchIntelPanel";
import TacticalPulseBar from "@/components/TacticalPulseBar";
import PipelineRibbon from "@/components/PipelineRibbon";
import { PipelinePanel } from "@/components/PipelineInspector";
import { TelestratorTools } from "@/components/TelestratorDVRBar";
import { SpatialPitchControlBar } from "@/components/PitchForgeDeck";
import type {
  ClubBias, Insight, LangCode, MatchEvent, MatchTick, MetricFocus, Metrics,
  PersonalizationState, PersonaMode, Recap, StudioQueryResponse, StudioSuggestedAction,
  TelestratorState, WarRoomPrefill, WarRoomVector, WarRoomZone,
} from "@/lib/types";
import type { OverlayToggles } from "@/components/three/HoloPitch3D";
import type { CameraMode } from "@/lib/types";
import { LANG_LABELS } from "@/lib/types";
import { useHud, type ControlTab } from "@/lib/hudContext";
import { useModalA11y } from "@/lib/useModalA11y";
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
  onLang: (l: LangCode) => void;
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
  onStudioAction: (action: StudioSuggestedAction) => void;
  onProjectShift: (zones: WarRoomZone[], vectors: WarRoomVector[]) => void;
  warRoomPrefill?: WarRoomPrefill | null;
  warRoomRunToken?: number;
  // Fan tab
  personalization: PersonalizationState;
  applyPreferences: (next: PersonalizationState) => void;
  // radar + player
  telestrator: TelestratorState;
  onLock: (id: string | null) => void;
  events: MatchEvent[];
  // telestrate
  toggleTelestrator: (key: keyof Omit<TelestratorState, "customTacticalArrows" | "spotlightPlayerIds">) => void;
  autoSpotlight: () => void;
  // CV
  cvExpanded: boolean | null;
  // production
  alphaMode: boolean;
  alphaBackdrop: "checker" | "green";
  onToggleAlpha: () => void;
  onToggleBackdrop: () => void;
  onShowAlphaModal: () => void;
  onShowRubric: () => void;
  onShowRecap: () => void;
  // pipeline
  pipeline: Parameters<typeof PipelineRibbon>[0]["pipeline"];
  connected: boolean;
  status: Parameters<typeof PipelineRibbon>[0]["status"];
  drill?: Parameters<typeof PipelineRibbon>[0]["drill"];
  onTriggerDrill?: (durationMs?: number) => void;
}

const CONTROL_TABS: { id: ControlTab; label: string; icon: LucideIcon }[] = [
  { id: "cams", label: "Watch", icon: Video },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "voices", label: "Voices", icon: Radio },
  { id: "fan", label: "Fan", icon: Heart },
  { id: "copilot", label: "Ask AI", icon: Sparkles },
  { id: "cv", label: "CV", icon: ScanEye },
  { id: "data", label: "Data", icon: Database },
  { id: "prod", label: "Studio", icon: Clapperboard },
];

export default function RightDock(props: Props) {
  const {
    camMode, pickCamera, toggles, toggleKey, aiDirected,
    insights, persona, onPersona, lang, onLang, metrics, tick, latestEvent, metricFocus, clubBias,
    latest, studioRecap, onCloseRecap, lockedId, onStudioDirective, onStudioAction,
    onProjectShift, warRoomPrefill, warRoomRunToken,
    personalization, applyPreferences,
    telestrator, onLock, events, cvExpanded,
    toggleTelestrator, autoSpotlight,
    alphaMode, alphaBackdrop, onToggleAlpha, onToggleBackdrop,
    onShowAlphaModal, onShowRubric, onShowRecap,
    pipeline, connected, status, drill, onTriggerDrill,
  } = props;

  const {
    controlCenterOpen, setControlCenterOpen, controlTab, setControlTab, openControlCenter,
    setShortcutsOpen, colorblindSafe, setColorblindSafe, palette,
  } = useHud();
  const panelRef = useRef<HTMLElement>(null);
  useModalA11y(controlCenterOpen && !alphaMode, () => setControlCenterOpen(false), panelRef);

  // Never leave the drawer open behind a clean alpha feed.
  useEffect(() => {
    if (alphaMode) setControlCenterOpen(false);
  }, [alphaMode, setControlCenterOpen]);

  if (!controlCenterOpen || alphaMode) return null;

  const fanActive = metricFocus !== "ALL" || clubBias !== "NEUTRAL";
  const active = CONTROL_TABS.find((t) => t.id === controlTab) ?? CONTROL_TABS[0];

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
      cognitiveDensity={personalization.cognitive_density}
    />
  );

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close control center"
        onClick={() => setControlCenterOpen(false)}
        className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-[1px] sm:bg-black/20"
      />

      <aside
        id="control-center"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="control-center-title"
        className="clip-ea panel-lux animate-slide-up fixed inset-x-2 bottom-2 z-40 flex max-h-[82dvh] flex-col overflow-hidden outline-none sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-[68px] sm:max-h-none sm:w-[404px]"
      >
        {/* header */}
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <div className="min-w-0">
            <h2 id="control-center-title" className="font-display text-[14px] font-bold uppercase tracking-[0.18em] text-white">
              Control Center
            </h2>
            <p className="mt-0.5 font-tech text-[9px] uppercase tracking-[0.16em] text-slate-500">
              Optional tools · the pitch stays primary
            </p>
          </div>
          <button
            onClick={() => setControlCenterOpen(false)}
            className="clip-skew flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-slate-950/75 text-slate-400 transition hover:border-crimson/40 hover:text-white"
            title="Close (Esc)"
            aria-label="Close control center"
          >
            <X size={15} />
          </button>
        </div>

        {/* tab strip: all eight tools visible, no horizontal hunting */}
        <div className="shrink-0 border-b border-white/10 p-1.5">
          <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Control center sections">
            {CONTROL_TABS.map((t) => {
              const Icon = t.icon;
              const selected = controlTab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setControlTab(t.id)}
                  className={cn(
                    "relative flex min-h-[44px] flex-col items-center justify-center gap-1 border px-1 py-1.5 font-tech text-[9.5px] font-bold uppercase tracking-[0.08em] transition",
                    selected
                      ? "border-tactical/40 bg-tactical/[0.12] text-tactical"
                      : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  <Icon size={14} />
                  {t.label}
                  {t.id === "fan" && fanActive && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* content */}
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
          {controlTab === "cams" && (
            <div className="space-y-2">
              <CameraDirectorBar
                mode={camMode}
                onMode={pickCamera}
                toggles={toggles}
                onToggle={toggleKey}
                aiDirected={aiDirected}
              />
              <div className="border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <p className="font-tech text-[9.5px] leading-relaxed text-slate-400">
                  Click any player on the pitch to lock the 360° hologram. Use the bottom
                  dock for PlayerLock, replay and God Mode moments.
                </p>
              </div>
            </div>
          )}

          {controlTab === "stats" && (
            <div className="space-y-2">
              <SpatialPitchControlBar metrics={metrics} tick={tick} />
              <TacticalPulseBar metrics={metrics} compact={false} />
              <MatchIntelPanel tick={tick} metrics={metrics} />
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

          {controlTab === "voices" && <div className="min-h-[460px]">{voicesPanel}</div>}

          {controlTab === "fan" && (
            <div className="space-y-2">
              <div className="border border-white/10 bg-black/25 p-2">
                <div className="mb-1.5 flex items-center gap-1.5 font-tech text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  <Radio size={11} className="text-tactical" />
                  Commentary language
                </div>
                <div className="grid grid-cols-4 gap-1" role="group" aria-label="Market language">
                  {(["en", "es", "ar", "hi"] as LangCode[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => onLang(l)}
                      aria-pressed={lang === l}
                      className={cn(
                        "min-h-[36px] border px-1 font-tech text-[10px] font-bold uppercase tracking-wider transition",
                        lang === l
                          ? "border-tactical/50 bg-tactical/15 text-tactical"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
                      )}
                    >
                      {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>
              </div>
              <FanPersonalizationPanel
                state={personalization}
                onChange={applyPreferences}
                colorblindSafe={colorblindSafe}
                onToggleColorblind={setColorblindSafe}
              />
            </div>
          )}

          {controlTab === "copilot" && (
            <StudioProducer
              latest={latest}
              recap={studioRecap}
              onCloseRecap={onCloseRecap}
              lang={lang}
              lockedId={lockedId}
              onStudioDirective={onStudioDirective}
              onStudioAction={onStudioAction}
            />
          )}

          {controlTab === "cv" && (
            <div className="space-y-2">
              <VisionAutoEventerHUD
                events={events}
                expandedOverride={cvExpanded}
                passingNetworkOn={toggles.passingNetwork}
                onTogglePassingNetwork={() => toggleKey("passingNetwork")}
              />
              <p className="px-1 font-tech text-[9px] leading-relaxed text-slate-500">
                Computer-vision eventing runs on the live 10 Hz spatial feed. It is a
                transparency view, not a required step for the fan experience.
              </p>
            </div>
          )}

          {controlTab === "data" && (
            <div className="space-y-2">
              <PipelineRibbon
                pipeline={pipeline}
                connected={connected}
                status={status}
                drill={drill}
                palette={palette}
              />
              <PipelinePanel
                pipeline={pipeline}
                drill={drill}
                connected={connected}
                status={status}
                onTriggerDrill={onTriggerDrill}
              />
            </div>
          )}

          {controlTab === "prod" && (
            <div className="space-y-2">
              <ProductionPanel
                alphaMode={alphaMode}
                alphaBackdrop={alphaBackdrop}
                onToggleAlpha={onToggleAlpha}
                onToggleBackdrop={onToggleBackdrop}
                onShowAlphaModal={onShowAlphaModal}
                onShowRubric={onShowRubric}
                onShowRecap={onShowRecap}
              />
              <BenchWarRoomPanel
                metrics={metrics}
                lang={lang}
                onProjectShift={onProjectShift}
                prefill={warRoomPrefill}
                runToken={warRoomRunToken}
              />
              <div className="border border-white/15 bg-slate-950/70 p-2">
                <div className="mb-1.5 font-tech text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Telestrator tools
                </div>
                <div className="flex gap-1.5">
                  <TelestratorTools
                    telestrator={telestrator}
                    onToggleTelestrator={toggleTelestrator}
                    onToggleSpotlight={autoSpotlight}
                  />
                </div>
                <p className="mt-1.5 font-tech text-[9px] leading-relaxed text-slate-500">
                  Freeze the feed from the bottom Replay button, then draw on the pitch.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
          <span className="font-tech text-[8.5px] uppercase tracking-[0.16em] text-slate-600">
            {active.label} controls
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setControlCenterOpen(false);
                setShortcutsOpen(true);
              }}
              className="font-tech text-[9px] font-bold uppercase tracking-wider text-slate-500 transition hover:text-tactical"
            >
              Shortcuts ?
            </button>
            <button
              onClick={() => openControlCenter("stats")}
              className="font-tech text-[9px] font-bold uppercase tracking-wider text-tactical/80 transition hover:text-tactical"
            >
              Match stats
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
