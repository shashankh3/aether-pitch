/**
 * AETHER PITCH — judge-facing component smoke test.
 *
 * Renders every HUD surface a judge will actually open and asserts it does not
 * throw. A render-time crash in a client component would white-screen the
 * live demo, and `next build` cannot catch it because the components are
 * client-only.
 *
 * Zero dependencies: React's server renderer is enough to exercise the render
 * path (hooks, context, property access) without a DOM or a browser.
 *
 *   npm run smoke:ui
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { HudProvider } from "../src/lib/hudContext";
import { telemetry } from "../src/lib/telemetry";
import { EdgeEngine } from "../src/lib/edgeEngine";
import StudioProducer, { BenchWarRoomPanel } from "../src/components/StudioProducer";
import { PipelinePanel } from "../src/components/PipelineInspector";
import PipelineRibbon from "../src/components/PipelineRibbon";
import RightDock from "../src/components/hud/RightDock";
import PlayerLock360 from "../src/components/PlayerLock360";
import LiveCaptionStrip from "../src/components/LiveCaptionStrip";
import JudgeFirstRunCard from "../src/components/JudgeFirstRunCard";
import RubricVerifierModal from "../src/components/RubricVerifierModal";
import TwinCastHUD from "../src/components/TwinCastHUD";
import FanPersonalizationPanel from "../src/components/FanPersonalizationTuner";
import { SpatialPitchControlBar } from "../src/components/PitchForgeDeck";
import DefensiveLineScrubber from "../src/components/hud/DefensiveLineScrubber";
import CounterfactualDeltaHUD from "../src/components/hud/CounterfactualDeltaHUD";
import VisionAutoEventerHUD from "../src/components/VisionAutoEventerHUD";
import BroadcastAlphaModal from "../src/components/BroadcastAlphaModal";
import CameraDirectorBar from "../src/components/CameraDirectorBar";
import MatchIntelPanel from "../src/components/MatchIntelPanel";
import ScoreBug from "../src/components/ScoreBug";
import TacticalPulseBar from "../src/components/TacticalPulseBar";
import TacticalRadarMiniMap from "../src/components/TacticalRadarMiniMap";
import TelestratorDVRBar from "../src/components/TelestratorDVRBar";
import BottomDock from "../src/components/hud/BottomDock";
import LeftRail from "../src/components/hud/LeftRail";
import ProductionPanel from "../src/components/hud/ProductionPanel";
import ShortcutsOverlay from "../src/components/hud/ShortcutsOverlay";
import TopBar from "../src/components/hud/TopBar";
import CommandPalette from "../src/components/hud/CommandPalette";
import BootSequence from "../src/components/hud/BootSequence";
import SpatialLoading from "../src/components/hud/SpatialLoading";
import JudgeAutopilotTour from "../src/components/JudgeAutopilotTour";
import MatchRecapStudioModal from "../src/components/MatchRecapStudioModal";
import StudioErrorBoundary from "../src/components/StudioErrorBoundary";

let failures = 0;
let checks = 0;

function check(name: string, fn: () => void, detail = "") {
  checks += 1;
  try {
    fn();
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } catch (err) {
    failures += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
    console.log(`       ${message.split("\n").slice(0, 3).join(" | ")}`);
  }
}

// A live synthetic frame so the surfaces have real data to render.
const engine = new EdgeEngine(19);
let tick = engine.step(0.1).tick;
let metrics = engine.step(0.1).metrics;
for (let i = 2; i < 200; i += 1) {
  const frame = engine.step(0.1);
  tick = frame.tick;
  metrics = frame.metrics;
}

const noop = () => undefined;
const personalisation = {
  persona_mode: "TWINCAST_SPLIT" as const,
  metric_focus: "ALL" as const,
  favorite_club_bias: "NEUTRAL" as const,
  locked_player_id: null,
  market_language: "en" as const,
  cognitive_density: "PRO_TACTICAL_DIRECTOR" as const,
  colorblind_safe: false,
};

function render(label: string, element: () => unknown) {
  check(label, () => {
    // An empty string is a legitimate result: a closed drawer or an inactive
    // caption renders null on purpose. The assertion is that it did not throw.
    const html = renderToString(element() as any);
    if (typeof html !== "string") {
      throw new Error("render did not return a string");
    }
  });
}

render("StudioProducer (Ask The 12th Man)", () =>
  createElement(
    HudProvider,
    null,
    createElement(StudioProducer, {
      latest: null,
      recap: null,
      onCloseRecap: noop,
      lang: "en",
      lockedId: null,
      onStudioDirective: noop,
      onStudioAction: noop,
    }),
  ),
);

render("BenchWarRoomPanel (multi-agent war-room)", () =>
  createElement(BenchWarRoomPanel, {
    metrics: metrics as any,
    lang: "en",
    onProjectShift: noop,
  }),
);

render("PipelinePanel (Data tab)", () =>
  createElement(PipelinePanel, { pipeline: engine.buildPipeline() as any }),
);

render("PipelineRibbon (5-stage strip)", () =>
  createElement(PipelineRibbon, {
    pipeline: engine.buildPipeline() as any,
    connected: true,
    status: "CONNECTED_PIPELINE_LIVE",
  }),
);

render("RightDock (Control Center)", () =>
  createElement(
    HudProvider,
    null,
    createElement(RightDock, {
      camMode: "TELE_BROADCAST",
      pickCamera: noop,
      toggles: { xtGrid: true, ghost: true, lasers: true, pitchControl: false, passingNetwork: false },
      toggleKey: noop,
      aiDirected: false,
      insights: [],
      persona: "split",
      onPersona: noop,
      lang: "en",
      onLang: noop,
      metrics: metrics as any,
      tick: tick as any,
      latestEvent: null,
      metricFocus: "ALL",
      clubBias: "NEUTRAL",
      latest: null,
      studioRecap: null,
      onCloseRecap: noop,
      lockedId: null,
      onStudioDirective: noop,
      onStudioAction: noop,
      onProjectShift: noop,
      personalization: personalisation as any,
      applyPreferences: noop,
      telestrator: {
        spotlightPlayerIds: [],
        showOffsideLaserWall: false,
        showCompactnessPolygon: false,
        animateGhostReplay: false,
        customTacticalArrows: [],
      },
      onLock: noop,
      events: [],
      cvExpanded: null,
      toggleTelestrator: noop,
      autoSpotlight: noop,
      alphaMode: false,
      alphaBackdrop: "checker",
      onToggleAlpha: noop,
      onToggleBackdrop: noop,
      onShowAlphaModal: noop,
      onShowRubric: noop,
      onShowRecap: noop,
      pipeline: engine.buildPipeline() as any,
      connected: true,
      status: "CONNECTED_PIPELINE_LIVE",
    }),
  ),
);

render("PlayerLock360 (bio-load twin)", () =>
  createElement(PlayerLock360, {
    tick: tick as any,
    lockedId: "NLA_2",
    onLock: noop,
    events: [],
    lang: "en",
    insightLine: null,
  }),
);

render("LiveCaptionStrip (mute-proof captions)", () =>
  createElement(LiveCaptionStrip, {}),
);

render("JudgeFirstRunCard (judge quick start)", () =>
  createElement(
    HudProvider,
    null,
    createElement(JudgeFirstRunCard, {}),
  ),
);

render("RubricVerifierModal (5-stage rubric)", () =>
  createElement(RubricVerifierModal, { open: false, onClose: noop }),
);

render("TwinCastHUD (dual persona)", () =>
  createElement(TwinCastHUD, {
    insights: [],
    persona: "split",
    onPersona: noop,
    lang: "en",
    metrics: metrics as any,
    tick: tick as any,
    latestEvent: null,
    metricFocus: "ALL",
    clubBias: "NEUTRAL",
  }),
);

render("FanPersonalizationPanel (inclusive tuner)", () =>
  createElement(FanPersonalizationPanel, {
    state: personalisation as any,
    onChange: noop,
    colorblindSafe: false,
    onToggleColorblind: noop,
  }),
);

render("SpatialPitchControlBar (territory split)", () =>
  createElement(SpatialPitchControlBar, { metrics: metrics as any }),
);

render("DefensiveLineScrubber (collective line)", () =>
  createElement(DefensiveLineScrubber, { tick: tick as any }),
);

render("CounterfactualDeltaHUD (what-if deltas)", () =>
  createElement(CounterfactualDeltaHUD, {
    tick: tick as any,
    metrics: metrics as any,
    active: true,
    onReset: noop,
    onClose: noop,
    onSubmit: noop,
  }),
);

render("VisionAutoEventerHUD (CV viewport)", () =>
  createElement(VisionAutoEventerHUD, { events: [] }),
);

render("BroadcastAlphaModal (SMPTE alpha packet)", () =>
  createElement(BroadcastAlphaModal, { open: true, onClose: noop, insight: null }),
);

render("CameraDirectorBar (camera + overlay toggles)", () =>
  createElement(CameraDirectorBar, {
    mode: "TELE_BROADCAST",
    onMode: noop,
    toggles: { xtGrid: true, ghost: true, lasers: true, pitchControl: false, passingNetwork: false },
    onToggle: noop,
    aiDirected: false,
  }),
);

render("MatchIntelPanel (match intelligence)", () =>
  createElement(MatchIntelPanel, { tick: tick as any, metrics: metrics as any }),
);

render("ScoreBug (scorebug)", () =>
  createElement(ScoreBug, { tick: tick as any, metrics: metrics as any }),
);

render("TacticalPulseBar (chaos waveform)", () =>
  createElement(TacticalPulseBar, { metrics: metrics as any }),
);

render("TacticalRadarMiniMap (mini radar)", () =>
  createElement(TacticalRadarMiniMap, {
    lockedId: "NLA_2",
    telestrator: {
      spotlightPlayerIds: [],
      showOffsideLaserWall: false,
      showCompactnessPolygon: false,
      animateGhostReplay: false,
      customTacticalArrows: [],
    },
    onLock: noop,
  }),
);

render("TelestratorDVRBar (DVR time machine)", () =>
  createElement(TelestratorDVRBar, {
    isDvrPaused: false,
    dvrOffsetTicks: 0,
    pausedClock: null,
    onTogglePause: noop,
    onScrub: noop,
    telestrator: {
      spotlightPlayerIds: [],
      showOffsideLaserWall: false,
      showCompactnessPolygon: false,
      animateGhostReplay: false,
      customTacticalArrows: [],
    },
    onToggleTelestrator: noop,
    onToggleSpotlight: noop,
  }),
);

render("BottomDock (primary dock)", () =>
  createElement(
    HudProvider,
    null,
    createElement(BottomDock, {
      tick: tick as any,
      busy: null,
      inject: noop,
      isDvrPaused: false,
      dvrOffsetTicks: 0,
      pausedClock: null,
      togglePause: noop,
      scrub: noop,
      telestrator: {
      spotlightPlayerIds: [],
      showOffsideLaserWall: false,
      showCompactnessPolygon: false,
      animateGhostReplay: false,
      customTacticalArrows: [],
    },
      toggleTelestrator: noop,
      autoSpotlight: noop,
      lockedId: null,
      onLock: noop,
      events: [],
      lang: "en",
      insightLine: null,
      lowerThird: null,
      sandboxActive: false,
      onToggleSandbox: noop,
    }),
  ),
);

render("LeftRail (scorebug rail)", () =>
  createElement(
    HudProvider,
    null,
    createElement(LeftRail, { tick: tick as any, metrics: metrics as any }),
  ),
);

render("ProductionPanel (Studio tools)", () =>
  createElement(ProductionPanel, {
    alphaMode: false,
    alphaBackdrop: "checker",
    onToggleAlpha: noop,
    onToggleBackdrop: noop,
    onShowAlphaModal: noop,
    onShowRubric: noop,
    onShowRecap: noop,
  }),
);

render("ShortcutsOverlay (keyboard map)", () =>
  createElement(
    HudProvider,
    null,
    createElement(ShortcutsOverlay, { open: false, onClose: noop }),
  ),
);

render("TopBar (brand + engine status)", () =>
  createElement(
    HudProvider,
    null,
    createElement(TopBar, {
      connected: true,
      lang: "en",
      alphaMode: false,
      cinemaMode: false,
      onToggleCinema: noop,
      isFullscreen: false,
      onToggleFullscreen: noop,
      autopilotActive: false,
      autopilotElapsed: 0,
      autopilotStep: -1,
      onToggleAutopilot: noop,
        isSpeaking: false,
        isVoiceMuted: false,
        onToggleMute: noop,
        onOpenGlossary: noop,
        onOpenCommandPalette: noop,
      }),
    ),
  );

render("CommandPalette (command deck)", () =>
  createElement(CommandPalette, {
    open: true,
    onClose: noop,
    onScenario: noop,
    onCamera: noop,
    onToggleAutopilot: noop,
    onToggleCinema: noop,
    onToggleFullscreen: noop,
    onToggleAlpha: noop,
    onShowGlossary: noop,
    onShowRubric: noop,
    onShowRecap: noop,
  }),
);

render("BootSequence (cinematic boot)", () =>
  createElement(BootSequence),
);

render("SpatialLoading (3D lazy fallback)", () =>
  createElement(SpatialLoading),
);

render("JudgeAutopilotTour (80 s tour banner)", () =>
  createElement(JudgeAutopilotTour, {
    active: true,
    currentStep: 0,
    elapsed: 12,
    onInspectProof: noop,
  }),
);

render("MatchRecapStudioModal (3-act recap + dossier)", () =>
  createElement(MatchRecapStudioModal, {
    open: true,
    onClose: noop,
    onLoadAct: noop,
    lang: "en",
    tick: tick as any,
    events: [],
  }),
);

render("StudioErrorBoundary (recoverable surface failure)", () =>
  createElement(
    StudioErrorBoundary,
    { label: "test", children: createElement("div", null, "child content") },
  ),
);

console.log("");
console.log(
  failures === 0
    ? `RESULT: ALL ${checks} COMPONENT RENDER CHECKS PASSED`
    : `RESULT: ${failures} FAILED of ${checks}`,
);
process.exit(failures === 0 ? 0 : 1);
