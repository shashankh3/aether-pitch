"use client";
// AETHER PITCH v6.1 — fan-first broadcast monitor shell.
// Full-bleed 3D WebGL stadium with a calm default surface:
//   TopBar      — brand, voice mute, autopilot, Controls, cinema/fullscreen
//   LeftRail    — scorebug + one route into match stats
//   BottomDock  — five buttons: Players / Replay / Moments / Stats / Controls
//   RightDock   — every optional tool in one closed-by-default Control Center
// This file is the orchestrator: all data wiring, handlers and transient
// broadcast graphics (lower-third, GOAL slam, autopilot banner, modals).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HoloPitch3D, { type OverlayToggles } from "@/components/three/HoloPitch3D";
import TacticalPulseBar from "@/components/TacticalPulseBar";
import BroadcastAlphaModal, { SMPTEChip } from "@/components/BroadcastAlphaModal";
import RubricVerifierModal from "@/components/RubricVerifierModal";
import MatchRecapStudioModal from "@/components/MatchRecapStudioModal";
import LiveCaptionStrip from "@/components/LiveCaptionStrip";
import StudioErrorBoundary from "@/components/StudioErrorBoundary";
import JudgeFirstRunCard from "@/components/JudgeFirstRunCard";
import CounterfactualDeltaHUD from "@/components/hud/CounterfactualDeltaHUD";
import {
  clearSandbox, type SandboxDelta,
} from "@/lib/sandboxStore";
import JudgeAutopilotTour, {
  AUTOPILOT_STEPS, AUTOPILOT_TOTAL_SECONDS, type ProofJump,
} from "@/components/JudgeAutopilotTour";
import TopBar from "@/components/hud/TopBar";
import LeftRail from "@/components/hud/LeftRail";
import RightDock from "@/components/hud/RightDock";
import BottomDock from "@/components/hud/BottomDock";
import ShortcutsOverlay from "@/components/hud/ShortcutsOverlay";
import { HudProvider, useHud } from "@/lib/hudContext";
import { useResilientMatchEngine } from "@/hooks/useResilientMatchEngine";
import { useSpeechController } from "@/hooks/useSpeechController";
import { telemetry } from "@/lib/telemetry";
import { API_BASE } from "@/lib/api";
import type {
  CameraDirective, CameraMode, HighlightZone, Insight, LangCode, MatchRecapStoryboard,
  MetricFocus, PersonaMode, PersonaModeV5, PersonalizationState, RecapAct, RecapPassArc,
  StudioQueryResponse, StudioSuggestedAction, TelestratorState, WarRoomPrefill,
  WarRoomVector, WarRoomZone,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const SCENARIO_KEYS: Record<string, string> = {
  "1": "chaos_counter",
  "2": "high_press_turnover",
  "3": "tactical_inversion",
  "4": "halftime_recap",
};

const CAMERA_OVERRIDE_MS = 6500;
const AUTOPILOT_TOTAL_MS = AUTOPILOT_TOTAL_SECONDS * 1000;

const CAMERA_NOTICE_LABELS: Record<string, string> = {
  TELE_BROADCAST: "TELE CAM",
  PLAYER_LOCK_3RD_PERSON: "PLAYER LOCK",
  TACTICAL_DRONE_ORBIT: "DRONE ORBIT",
  TACTICAL_DRONE: "TACTICAL DRONE",
  AUTO_DIRECTOR: "AUTO-DIRECTOR",
  ACTION_ZOOM: "ACTION ZOOM",
};

const PERSONA_MAP: Record<PersonaModeV5, PersonaMode> = {
  ANALYST_HUD: "analyst",
  CASUAL_STORY: "casual",
  TWINCAST_SPLIT: "split",
};

interface GoalBanner {
  id: string;
  team: "NLA" | "MCS";
  scorer: string;
  clock: string;
  score: { NLA: number; MCS: number };
}

const EMPTY_TELESTRATOR: TelestratorState = {
  spotlightPlayerIds: [],
  showOffsideLaserWall: false,
  showCompactnessPolygon: false,
  animateGhostReplay: false,
  customTacticalArrows: [],
};

export default function StudioPage() {
  return (
    <HudProvider>
      <StudioOrchestrator />
    </HudProvider>
  );
}

function StudioOrchestrator() {
  const studio = useResilientMatchEngine();
  const {
    tick, metrics, insights, events, pipeline, connected, status, sendScenario, tickRef, applySnapshot,
    recap: studioRecap, clearRecap, failoverDrillState, triggerFailoverDrill,
  } = studio;

  const {
    setHudMode, setControlCenterOpen, setDockTool, openControlCenter, setShortcutsOpen,
    colorblindSafe, setColorblindSafe, palette,
  } = useHud();

  const [lockedId, setLockedId] = useState<string | null>(null);
  const [camMode, setCamMode] = useState<CameraMode>("TELE_BROADCAST");
  const [toggles, setToggles] = useState<OverlayToggles>({
    xtGrid: true, ghost: true, lasers: true, pitchControl: false, passingNetwork: false,
  });
  const [persona, setPersona] = useState<PersonaMode>("split");
  const [lang, setLang] = useState<LangCode>("en");
  const [personalization, setPersonalization] = useState<PersonalizationState>({
    persona_mode: "TWINCAST_SPLIT",
    metric_focus: "ALL",
    favorite_club_bias: "NEUTRAL",
    locked_player_id: null,
    market_language: "en",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [goalBanner, setGoalBanner] = useState<GoalBanner | null>(null);
  const [override, setOverride] = useState<{ directive: CameraDirective; at: number } | null>(null);
  const overrideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraNotice, setCameraNotice] = useState<{ label: string; ai: boolean; at: number } | null>(null);
  const cameraNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraNoticeSeen = useRef(false);

  // ---- v3.0 DVR + telestrator ----
  const [isDvrPaused, setDvrPaused] = useState(false);
  const [dvrOffsetTicks, setDvrOffsetTicks] = useState(0);
  const [pausedClock, setPausedClock] = useState<string | null>(null);
  const [telestrator, setTelestrator] = useState<TelestratorState>(EMPTY_TELESTRATOR);
  const [highlightZone, setHighlightZone] = useState<HighlightZone | null>(null);
  const [warRoomShift, setWarRoomShift] = useState<
    { zones: WarRoomZone[]; vectors: WarRoomVector[] } | null
  >(null);

  // ---- v4.0 broadcast alpha + production cluster ----
  const [alphaMode, setAlphaMode] = useState(false);
  const [alphaBackdrop, setAlphaBackdrop] = useState<"checker" | "green">("checker");
  const [showAlphaModal, setShowAlphaModal] = useState(false);
  const [showRubric, setShowRubric] = useState(false);

  // ---- presentation / clean-feed controls ----
  const [cinemaMode, setCinemaMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ---- v5.0 judge autopilot (engine lives here so TopBar + banner share it) ----
  const [showRecap, setShowRecap] = useState(false);
  const [recapPass, setRecapPass] = useState<RecapPassArc | null>(null);
  const [cvExpanded, setCvExpanded] = useState<boolean | null>(null);
  const [autopilotStep, setAutopilotStep] = useState(-1);
  const [autopilotActive, setAutopilotActive] = useState(false);
  const [autopilotElapsed, setAutopilotElapsed] = useState(0);
  const tourFxTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const autopilotTicker = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- v4.0 two-phase scenario UX ----
  const [phase2Pending, setPhase2Pending] = useState(false);
  const phase2BaselineRef = useRef<string | null>(null);
  const latestInsightIdRef = useRef<string | null>(null);

  const {
    isSpeaking, isVoiceMuted, toggleMute, speakInsight, setAutoNarrationSuppressed, stopSpeaking,
  } = useSpeechController();

  // URL params: ?overlay=alpha (broadcast compositing) and ?mode=analysis|studio
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("overlay") === "alpha") setAlphaMode(true);
    const mode = params.get("mode");
    if (mode === "analysis" || mode === "studio") {
      setHudMode(mode);
      openControlCenter(mode === "analysis" ? "stats" : "prod");
    }
  }, [setHudMode, openControlCenter]);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Clean feed means clean: no drawer, no dock popovers.
  useEffect(() => {
    if (!cinemaMode) return;
    setControlCenterOpen(false);
    setDockTool(null);
  }, [cinemaMode, setControlCenterOpen, setDockTool]);

  // Alpha output is also a clean surface; clear transient tooling.
  useEffect(() => {
    if (!alphaMode) return;
    setControlCenterOpen(false);
    setDockTool(null);
  }, [alphaMode, setControlCenterOpen, setDockTool]);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleAlpha = useCallback(() => {
    setAlphaMode((a) => {
      if (!a) setHudMode("studio");
      return !a;
    });
    setCinemaMode(false);
  }, [setHudMode]);

  // lower-third: show for 8s whenever a new insight lands
  const latest = insights[0] ?? null;
  useEffect(() => {
    latestInsightIdRef.current = latest?.id ?? null;
  }, [latest?.id]);
  const [lowerThird, setLowerThird] = useState<Insight | null>(null);
  useEffect(() => {
    if (!latest) return;
    setLowerThird(latest);
    const t = setTimeout(() => setLowerThird(null), 8000);
    return () => clearTimeout(t);
  }, [latest?.id]);

  // AI camera director: adopt the Stage (c)/(d) recommendation for 6.5s
  useEffect(() => {
    const directive = latest?.camera_directive;
    if (!directive) return;
    setOverride({ directive, at: performance.now() });
    if (overrideTimer.current) clearTimeout(overrideTimer.current);
    overrideTimer.current = setTimeout(() => setOverride(null), CAMERA_OVERRIDE_MS);
  }, [latest?.id]);

  useEffect(() => {
    const mode = override?.directive.recommended_mode ?? camMode;
    if (!cameraNoticeSeen.current) {
      cameraNoticeSeen.current = true;
      return;
    }
    setCameraNotice({
      label: CAMERA_NOTICE_LABELS[mode] ?? mode.replace(/_/g, " "),
      ai: !!override,
      at: performance.now(),
    });
    if (cameraNoticeTimer.current) clearTimeout(cameraNoticeTimer.current);
    cameraNoticeTimer.current = setTimeout(() => setCameraNotice(null), 2600);
    return () => {
      if (cameraNoticeTimer.current) clearTimeout(cameraNoticeTimer.current);
    };
  }, [camMode, override]);

  // two-phase scenario UX: phase 2 resolves when a *new* AI insight lands
  useEffect(() => {
    if (!phase2Pending) return;
    if (latest && latest.id !== phase2BaselineRef.current) setPhase2Pending(false);
  }, [latest?.id, phase2Pending]);

  // GOAL slam banner
  const lastGoalRef = useRef<string>("");
  useEffect(() => {
    const goal = events.find((e) => e.type === "GOAL");
    if (!goal || goal.id === lastGoalRef.current) return;
    lastGoalRef.current = goal.id;
    setGoalBanner({
      id: goal.id,
      team: (goal.team ?? "NLA") as "NLA" | "MCS",
      scorer: goal.player_name ?? "Unknown",
      clock: goal.clock,
      score: goal.score ?? { NLA: 0, MCS: 0 },
    });
    const t = setTimeout(() => setGoalBanner(null), 4600);
    return () => clearTimeout(t);
  }, [events]);

  const inject = useCallback(
    async (name: string) => {
      if (name === "halftime_recap") {
        setShowRecap(true);
        return;
      }
      setBusy(name);
      phase2BaselineRef.current = latestInsightIdRef.current;
      setPhase2Pending(true);
      setTimeout(() => setPhase2Pending(false), 3500); // causal stream fallback
      await sendScenario(name);
      setTimeout(() => setBusy(null), 900);
    },
    [sendScenario]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT" || target.isContentEditable
      )) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (key === "h") {
        if (!alphaMode) setCinemaMode((v) => !v);
        return;
      }
      if (e.key === "Escape" && cinemaMode) {
        setCinemaMode(false);
        return;
      }
      if (key === "l") { setCinemaMode(false); openControlCenter("cams"); return; }
      if (key === "a") { setCinemaMode(false); openControlCenter("stats"); return; }
      if (key === "s") { setCinemaMode(false); openControlCenter("prod"); return; }
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }
      const name = SCENARIO_KEYS[e.key];
      if (name && !busy) inject(name);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alphaMode, cinemaMode, inject, busy, toggleFullscreen, openControlCenter, setShortcutsOpen]);

  // ---- pill targets: locked / carrier / receiver / spotlighted / sprinters ----
  const keySig = tick
    ? [
        tick.carrier,
        lockedId,
        telemetry.passReceiver && performance.now() - telemetry.passReceiver.at < 3000
          ? telemetry.passReceiver.id
          : null,
        ...telestrator.spotlightPlayerIds,
        ...tick.players.filter((p) => p.playstyle_badge || p.speed_kmh > 30).map((p) => p.id),
      ]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join("|")
    : "";
  const keyIds = useMemo(() => (keySig ? keySig.split("|") : []), [keySig]);

  const toggleKey = useCallback((id: keyof OverlayToggles) => {
    setToggles((t) => ({ ...t, [id]: !t[id] }));
  }, []);

  const pickCamera = useCallback((m: CameraMode) => {
    if (overrideTimer.current) clearTimeout(overrideTimer.current);
    setOverride(null);
    setCamMode(m);
  }, []);

  const applyMetricFocus = useCallback((focus: MetricFocus) => {
    setToggles((prev) => {
      switch (focus) {
        case "SPEED_VELOCITY":
          return { ...prev, xtGrid: false, ghost: false, lasers: false, pitchControl: false, passingNetwork: false };
        case "PASS_QUALITY":
          return { ...prev, xtGrid: false, ghost: true, lasers: false, pitchControl: false, passingNetwork: true };
        case "EXPECTED_THREAT_XT":
          return { ...prev, xtGrid: true, ghost: true, lasers: false, pitchControl: true, passingNetwork: false };
        case "CHAOS_PRESSING":
          return { ...prev, xtGrid: false, ghost: false, lasers: true, pitchControl: true, passingNetwork: false };
        default:
          return { ...prev, xtGrid: true, ghost: true, lasers: true, pitchControl: false, passingNetwork: false };
      }
    });
  }, []);

  const applyPreferences = useCallback((next: PersonalizationState) => {
    setPersonalization(next);
    setPersona(PERSONA_MAP[next.persona_mode]);
    setLang(next.market_language);
    applyMetricFocus(next.metric_focus);
  }, [applyMetricFocus]);

  // TwinCast persona switch: sync personalization without touching the
  // overlay-toggle metric lock (that is the Fan tuner's job)
  const handlePersona = useCallback((next: PersonaMode) => {
    setPersona(next);
    setPersonalization((p) => ({
      ...p,
      persona_mode: next === "analyst" ? "ANALYST_HUD" : next === "casual" ? "CASUAL_STORY" : "TWINCAST_SPLIT",
    }));
  }, []);

  // market language — one switcher drives TwinCast, co-pilot, recap and Stage-E
  const handleLang = useCallback((next: LangCode) => {
    stopSpeaking();
    setLang(next);
    setPersonalization((p) => ({ ...p, market_language: next }));
  }, [stopSpeaking]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/personalization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personalization),
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [personalization]);

  useEffect(() => () => {
    tourFxTimers.current.forEach((t) => clearTimeout(t));
    if (autopilotTicker.current) clearInterval(autopilotTicker.current);
  }, []);

  // ---- DVR controls ----
  const togglePause = useCallback(() => {
    const next = !isDvrPaused;
    setDvrPaused(next);
    telemetry.playbackPaused = next;
    setPausedClock(null);
    if (next) {
      setDvrOffsetTicks(dvrOffsetTicks);
      telemetry.replay(dvrOffsetTicks);
    } else {
      setDvrOffsetTicks(0);
      setRecapPass(null);
      setTelestrator((t) => ({ ...t, animateGhostReplay: false, customTacticalArrows: [] }));
      if (tickRef.current) telemetry.applyTick(tickRef.current, false);
    }
  }, [dvrOffsetTicks, isDvrPaused, tickRef]);

  const scrub = useCallback((offset: number) => {
    if (!isDvrPaused) {
      setDvrPaused(true);
      telemetry.playbackPaused = true;
    }
    setPausedClock(null);
    setDvrOffsetTicks(offset);
    telemetry.replay(offset);
  }, [isDvrPaused]);

  const handleLoadRecapAct = useCallback(
    (act: RecapAct, recap: MatchRecapStoryboard) => {
      setDvrPaused(true);
      telemetry.playbackPaused = true;
      setDvrOffsetTicks(0);
      setPausedClock(act.clock ?? null);
      applySnapshot(act.snapshot);
      setCamMode(act.camera_mode);
      setLockedId(act.key_player_ids[0] ?? act.player_id ?? null);
      setTelestrator({
        spotlightPlayerIds: act.key_player_ids.slice(0, 3),
        showOffsideLaserWall: false,
        showCompactnessPolygon: true,
        animateGhostReplay: true,
        customTacticalArrows: [
          { from: [act.actual_pass.start.x, act.actual_pass.start.y], to: [act.actual_pass.end.x, act.actual_pass.end.y] },
          { from: [act.ghost_pass.start.x, act.ghost_pass.start.y], to: [act.ghost_pass.end.x, act.ghost_pass.end.y] },
        ],
      });
      telemetry.telestratorSpotlightIds = act.key_player_ids.slice(0, 3);
      setHighlightZone(act.highlight_zone);
      setRecapPass({
        start: act.actual_pass.start,
        end: act.actual_pass.end,
        ghostStart: act.ghost_pass.start,
        ghostEnd: act.ghost_pass.end,
        deltaXt: act.ghost_pass.delta_xt,
        targetId: act.ghost_pass.target_id,
      });
      speakInsight(
        act.localized_commentary?.[lang] ?? act.analyst_tactical_summary ?? recap.title,
        lang
      );
    },
    [applySnapshot, lang, speakInsight]
  );

  // ---- telestrator controls ----
  const autoSpotlight = useCallback(() => {
    setTelestrator((t) => {
      if (t.spotlightPlayerIds.length > 0) return { ...t, spotlightPlayerIds: [] };
      const ids: string[] = [];
      if (tick?.carrier) ids.push(tick.carrier);
      // nearest presser to the ball
      if (tick) {
        const ball = tick.ball;
        const pressers = tick.players
          .filter((p) => p.team !== tick.possession && p.role !== "GK")
          .sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
        if (pressers[0]) ids.push(pressers[0].id);
      }
      const recv = telemetry.passReceiver;
      if (recv && performance.now() - recv.at < 6000) ids.push(recv.id);
      telemetry.telestratorSpotlightIds = ids.slice(0, 3);
      return { ...t, spotlightPlayerIds: ids.slice(0, 3) };
    });
  }, [tick]);

  const toggleTelestrator = useCallback(
    (key: "showOffsideLaserWall" | "showCompactnessPolygon" | "animateGhostReplay") => {
      setTelestrator((t) => ({ ...t, [key]: !t[key] }));
    },
    []
  );

  // click-to-lock also toggles spotlight beams while the spotlight tool is on
  const handleLock = useCallback(
    (id: string | null) => {
      setLockedId(id);
      setPersonalization((pref) => ({ ...pref, locked_player_id: id }));
      setTelestrator((t) => {
        if (t.spotlightPlayerIds.length === 0 || !id) return t;
        const has = t.spotlightPlayerIds.includes(id);
        const next = has
          ? t.spotlightPlayerIds.filter((x) => x !== id)
          : [...t.spotlightPlayerIds, id].slice(-3);
        telemetry.telestratorSpotlightIds = next;
        return { ...t, spotlightPlayerIds: next };
      });
    },
    []
  );

  // ---- studio co-pilot scene directive execution ----
  const handleStudioDirective = useCallback(
    (directive: StudioQueryResponse["scene_directive"]) => {
      setTelestrator({
        spotlightPlayerIds: (directive.spotlight_player_ids ?? []).slice(0, 3),
        showOffsideLaserWall: directive.enable_offside_wall,
        showCompactnessPolygon: directive.enable_compactness_polygon,
        animateGhostReplay: directive.draw_ghost_pass,
        customTacticalArrows: [],
      });
      telemetry.telestratorSpotlightIds = (directive.spotlight_player_ids ?? []).slice(0, 3);
      setHighlightZone(directive.highlight_pitch_zone);
      setOverride({
        directive: {
          recommended_mode: directive.camera_mode,
          focus_target_id: directive.spotlight_player_ids?.[0] ?? lockedId,
          cinematic_slow_mo: false,
          ar_highlight_zone: directive.highlight_pitch_zone?.label ?? "STUDIO_QUERY",
        },
        at: performance.now(),
      });
      if (overrideTimer.current) clearTimeout(overrideTimer.current);
      overrideTimer.current = setTimeout(() => setOverride(null), CAMERA_OVERRIDE_MS);
    },
    [lockedId]
  );

  const handleStudioAction = useCallback((action: StudioSuggestedAction) => {
    switch (action.type) {
      case "SHOW_GHOST_PASS":
        setTelestrator((t) => ({
          ...t,
          animateGhostReplay: action.payload?.enabled ?? true,
        }));
        break;
      case "LOCK_PLAYER":
        handleLock(action.payload?.player_id ?? null);
        break;
      case "GENERATE_RECAP":
        setShowRecap(true);
        break;
      case "FOCUS_GAP":
      default: {
        const zone = action.payload?.zone;
        setOverride({
          directive: {
            recommended_mode: action.payload?.camera_mode ?? "TACTICAL_DRONE",
            focus_target_id: lockedId,
            cinematic_slow_mo: false,
            ar_highlight_zone: zone
              ? `SEAM ${zone.x.toFixed(0)} · ${zone.y.toFixed(0)}`
              : "FOCUS_GAP",
          },
          at: performance.now(),
        });
        if (overrideTimer.current) clearTimeout(overrideTimer.current);
        overrideTimer.current = setTimeout(() => setOverride(null), CAMERA_OVERRIDE_MS);
      }
    }
  }, [handleLock, lockedId]);

  // ---- bench war-room -> 3D tactical projection -----------------------
  const handleProjectShift = useCallback(
    (zones: WarRoomZone[], vectors: WarRoomVector[]) => {
      setWarRoomShift({ zones, vectors });
      const primary = zones[0];
      if (primary) {
        setHighlightZone({
          x_min: Math.max(0, primary.x - 9),
          x_max: Math.min(105, primary.x + 9),
          y_min: Math.max(0, primary.y - 7),
          y_max: Math.min(68, primary.y + 7),
          label: primary.label,
        });
      }
      setToggles((t) => ({ ...t, passingNetwork: true }));
      setOverride({
        directive: {
          recommended_mode: "TACTICAL_DRONE",
          focus_target_id: lockedId,
          cinematic_slow_mo: false,
          ar_highlight_zone: primary?.label ?? "TACTICAL SHIFT",
        },
        at: performance.now(),
      });
      if (overrideTimer.current) clearTimeout(overrideTimer.current);
      overrideTimer.current = setTimeout(() => setOverride(null), CAMERA_OVERRIDE_MS);
    },
    [lockedId]
  );

  // ---- rubric proof-jumper: open the exact Control Center tab ----------
  const handleInspectProof = useCallback((jump: ProofJump) => {
    setCinemaMode(false);
    openControlCenter(jump.tab);
  }, [openControlCenter]);

  // ---- interactive what-if counterfactual sandbox ----------------------
  const [sandboxActive, setSandboxActive] = useState(false);
  const [warRoomPrefill, setWarRoomPrefill] = useState<WarRoomPrefill | null>(null);
  const [warRoomRunToken, setWarRoomRunToken] = useState(0);

  const toggleSandbox = useCallback(() => {
    setSandboxActive((prev) => {
      const next = !prev;
      if (!next) clearSandbox();
      return next;
    });
  }, []);

  const closeSandbox = useCallback(() => {
    setSandboxActive(false);
    clearSandbox();
  }, []);

  const resetSandbox = useCallback(() => {
    clearSandbox();
  }, []);

  const submitSandboxToWarRoom = useCallback((delta: SandboxDelta) => {
    setWarRoomPrefill({
      query:
        `Counterfactual: ${delta.team} #${delta.shirtNumber} ${delta.playerName} is relocated ` +
        `from (${delta.originX.toFixed(1)}, ${delta.originY.toFixed(1)}) to ` +
        `(${delta.x.toFixed(1)}, ${delta.y.toFixed(1)}), a ${delta.displacementM.toFixed(1)} m ` +
        `displacement. Stage B recomputes Expected Threat at that position and the ` +
        `pitch-control split. Adjudicate the structural consequence.`,
      counterfactual: {
        player_id: delta.playerId,
        player_name: delta.playerName,
        team: delta.team,
        from_xy: { x: delta.originX, y: delta.originY },
        to_xy: { x: delta.x, y: delta.y },
        displacement_m: delta.displacementM,
        delta_xt: delta.deltaXT,
        delta_pitch_control_pct: delta.deltaControlPct,
      },
    });
    setWarRoomRunToken((n) => n + 1);
    setCinemaMode(false);
    openControlCenter("prod");
  }, [openControlCenter]);

  const handleAutopilotStop = useCallback((keepRubric = false, keepVoiceSuppressed = false) => {
    tourFxTimers.current.forEach((t) => clearTimeout(t));
    tourFxTimers.current = [];
    setAlphaMode(false);
    setCvExpanded(null);
    setAutopilotStep(-1);
    setDvrPaused(false);
    setPausedClock(null);
    telemetry.playbackPaused = false;
    setDvrOffsetTicks(0);
    setRecapPass(null);
    setShowRecap(false);
    if (!keepRubric) setShowRubric(false);
    setHighlightZone(null);
    setWarRoomShift(null);
    setTelestrator((t) => ({ ...t, animateGhostReplay: false, customTacticalArrows: [] }));
    telemetry.telestratorSpotlightIds = [];
    if (tickRef.current) telemetry.applyTick(tickRef.current, false);
    pickCamera("TELE_BROADCAST");
    setControlCenterOpen(false);
    setDockTool(null);
    setHudMode(keepRubric ? "studio" : "live");
    if (!keepVoiceSuppressed) setAutoNarrationSuppressed(false);
  }, [pickCamera, tickRef, setHudMode, setControlCenterOpen, setDockTool, setAutoNarrationSuppressed]);

  const stopAutopilot = useCallback(() => {
    if (autopilotTicker.current) {
      clearInterval(autopilotTicker.current);
      autopilotTicker.current = null;
    }
    setAutopilotActive(false);
    setAutopilotElapsed(0);
    stopSpeaking();
    handleAutopilotStop();
  }, [handleAutopilotStop, stopSpeaking]);

  const completeAutopilot = useCallback(() => {
    if (autopilotTicker.current) {
      clearInterval(autopilotTicker.current);
      autopilotTicker.current = null;
    }
    setAutopilotActive(false);
    setAutopilotElapsed(AUTOPILOT_TOTAL_SECONDS);
    stopSpeaking();
    // The finale's proof stays on screen; the editor can close it when ready.
    handleAutopilotStop(true, true);
  }, [handleAutopilotStop, stopSpeaking]);

  useEffect(() => {
    if (!autopilotActive && !showRubric) setAutoNarrationSuppressed(false);
  }, [autopilotActive, showRubric, setAutoNarrationSuppressed]);

  const handleAutopilotStep = useCallback(
    (index: number) => {
      stopSpeaking();
      setAutopilotStep(index);
      const snap = tickRef.current;
      switch (index) {
        case 0:
          setHudMode("analysis");
          setCvExpanded(true);
          setControlCenterOpen(false);
          pickCamera("TELE_BROADCAST");
          break;
        case 1:
          setHudMode("live");
          setCvExpanded(false);
          setControlCenterOpen(false);
          setDockTool(null);
          setToggles((t) => ({ ...t, pitchControl: true, passingNetwork: true, lasers: true, ghost: true }));
          void inject("chaos_counter");
          break;
        case 2: {
          setHudMode("analysis");
          setCvExpanded(false);
          setControlCenterOpen(false);
          setDockTool("replay");
          setDvrPaused(true);
          setPausedClock(null);
          telemetry.playbackPaused = true;
          telemetry.replay(dvrOffsetTicks);
          pickCamera("TACTICAL_DRONE_ORBIT");
          if (snap) {
            const carrier = snap.players.find((p) => p.id === snap.carrier);
            const mates = snap.players.filter((p) => p.team === snap.possession && p.id !== snap.carrier && p.role !== "GK");
            const target = mates.sort((a, b) =>
              snap.possession === "NLA" ? b.x - a.x : a.x - b.x
            )[0];
            const presser = snap.players
              .filter((p) => p.team !== snap.possession && p.role !== "GK")
              .sort((a, b) => Math.hypot(a.x - snap.ball.x, a.y - snap.ball.y) - Math.hypot(b.x - snap.ball.x, b.y - snap.ball.y))[0];
            const ids = [carrier?.id, target?.id, presser?.id].filter(Boolean) as string[];
            setTelestrator({
              spotlightPlayerIds: ids.slice(0, 3),
              showOffsideLaserWall: true,
              showCompactnessPolygon: true,
              animateGhostReplay: true,
              customTacticalArrows: carrier && target
                ? [
                    { from: [carrier.x, carrier.y], to: [target.x, target.y] },
                    { from: [carrier.x, carrier.y], to: [target.x, Math.min(66, target.y + 12)] },
                  ]
                : [],
            });
            telemetry.telestratorSpotlightIds = ids.slice(0, 3);
            if (carrier && target) {
              setRecapPass({
                start: { x: carrier.x, y: carrier.y },
                end: { x: target.x, y: target.y },
                ghostStart: { x: carrier.x, y: carrier.y },
                ghostEnd: { x: target.x, y: Math.min(66, target.y + 12) },
                deltaXt: 0.187,
                targetId: target.id,
              });
            }
            setHighlightZone({
              x_min: Math.max(0, snap.ball.x - 16),
              x_max: Math.min(105, snap.ball.x + 16),
              y_min: Math.max(0, snap.ball.y - 11),
              y_max: Math.min(68, snap.ball.y + 11),
              label: "PRESSURE RUPTURE",
            });
          }
          break;
        }
        case 3:
          setHudMode("studio");
          setDockTool(null);
          setControlCenterOpen(false);
          setDvrPaused(false);
          setPausedClock(null);
          telemetry.playbackPaused = false;
          setDvrOffsetTicks(0);
          setRecapPass(null);
          setTelestrator((t) => ({ ...t, animateGhostReplay: false, customTacticalArrows: [] }));
          if (snap) telemetry.applyTick(snap, false);
          setCinemaMode(false);
          setAlphaMode(true);
          tourFxTimers.current.push(setTimeout(() => setAlphaMode(false), 6500));
          break;
        case 4: {
          setHudMode("live");
          setAlphaMode(false);
          setControlCenterOpen(false);
          setDockTool("player");
          pickCamera("PLAYER_LOCK_3RD_PERSON");
          const star = snap?.players.find((p) => p.team === snap.possession && p.role === "FWD")?.id
            ?? snap?.carrier
            ?? null;
          if (star) {
            setLockedId(star);
            setTelestrator((t) => ({ ...t, spotlightPlayerIds: [star] }));
            telemetry.telestratorSpotlightIds = [star];
          }
          applyPreferences({
            ...personalization,
            persona_mode: "TWINCAST_SPLIT",
            metric_focus: "PASS_QUALITY",
            market_language: "es",
            locked_player_id: star,
          });
          tourFxTimers.current.push(setTimeout(() => {
            setLang("hi");
            setPersonalization((p) => ({ ...p, market_language: "hi", locked_player_id: star }));
          }, 3000));
          tourFxTimers.current.push(setTimeout(() => {
            setLang("ar");
            setPersonalization((p) => ({ ...p, market_language: "ar", locked_player_id: star }));
          }, 6500));
          break;
        }
        case 5:
          setHudMode("studio");
          setDockTool(null);
          setControlCenterOpen(false);
          setShowRubric(false);
          setShowRecap(true);
          // Recap first, then the rubric proof. Never stack them: the recap
          // modal sits at z-70 and would hide the z-50 rubric verifier.
          tourFxTimers.current.push(setTimeout(() => {
            setShowRecap(false);
            setShowRubric(true);
          }, 8000));
          break;
        default:
          break;
      }
    },
    [
      applyPreferences, dvrOffsetTicks, inject, personalization, pickCamera, tickRef, setHudMode,
      openControlCenter, setControlCenterOpen, setDockTool, stopSpeaking,
    ]
  );

  const startAutopilot = useCallback(() => {
    tourFxTimers.current.forEach((t) => clearTimeout(t));
    tourFxTimers.current = [];
    setAutoNarrationSuppressed(true);
    setShowRecap(false);
    setShowRubric(false);
    setAutopilotActive(true);
    setAutopilotElapsed(0);
    const startedAt = performance.now();
    autopilotTicker.current = setInterval(() => {
      setAutopilotElapsed(Math.min(AUTOPILOT_TOTAL_SECONDS, (performance.now() - startedAt) / 1000));
    }, 100);
    AUTOPILOT_STEPS.forEach((step, index) => {
      tourFxTimers.current.push(setTimeout(() => {
        handleAutopilotStep(index);
        speakInsight(step.voiceover, "en");
      }, step.at * 1000));
    });
    tourFxTimers.current.push(setTimeout(() => completeAutopilot(), AUTOPILOT_TOTAL_MS));
  }, [completeAutopilot, handleAutopilotStep, setAutoNarrationSuppressed, speakInsight]);

  const toggleAutopilot = useCallback(() => {
    if (autopilotActive) stopAutopilot();
    else startAutopilot();
  }, [autopilotActive, startAutopilot, stopAutopilot]);

  const alphaBackdropStyle =
    alphaBackdrop === "green"
      ? { background: "#00B140" }
      : {
          backgroundColor: "#8a8a8a",
          backgroundImage:
            "linear-gradient(45deg, #6c6c6c 25%, transparent 25%), linear-gradient(-45deg, #6c6c6c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #6c6c6c 75%), linear-gradient(-45deg, transparent 75%, #6c6c6c 75%)",
          backgroundSize: "24px 24px",
          backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
        };

  const goalPalette =
    goalBanner?.team === "MCS"
      ? ["#00F0FF", "#7DF9FF", "#FFFFFF", "#FFC24D", "#1D4ED8"]
      : ["#FF1E56", "#FF5C86", "#FFFFFF", "#FFC24D", "#7F0F26"];

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-obsidian">
      {/* chroma / checkerboard backdrop behind the transparent WebGL canvas */}
      {alphaMode && <div className="fixed inset-0 z-0" style={alphaBackdropStyle} />}

      {/* full-bleed 3D WebGL stadium — isolated so a WebGL failure cannot
          take down the HUD, the Control Center or the live telemetry */}
      <StudioErrorBoundary label="3D pitch">
        <HoloPitch3D
          camMode={camMode}
          override={override}
          toggles={toggles}
          lockedId={lockedId}
          keyIds={keyIds}
          metrics={metrics}
          telestrator={telestrator}
          highlightZone={highlightZone}
          alphaMode={alphaMode}
          recapPass={recapPass}
        warRoomShift={warRoomShift}
        palette={palette}
        sandboxActive={sandboxActive}
        onLock={handleLock}
      />
      </StudioErrorBoundary>

      {!alphaMode && (
        <>
          <div className="scene-aurora" aria-hidden />
          <div className="scene-grade" aria-hidden />
          <div className="scene-scanlines" aria-hidden />
          <div className="scene-grain" aria-hidden />
          <div className="broadcast-frame" aria-hidden>
            <span className="frame-corner frame-corner-tl" />
            <span className="frame-corner frame-corner-tr" />
            <span className="frame-corner frame-corner-bl" />
            <span className="frame-corner frame-corner-br" />
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* HUD shell: TopBar / scorebug / tactical pulse / five-button dock    */}
      {/* The optional Control Center renders outside this clean-feed wrapper. */}
      {/* ------------------------------------------------------------------ */}
      <div
        aria-hidden={cinemaMode || undefined}
        className={cn(
          "pointer-events-none absolute inset-0",
          alphaMode ? "z-20" : "z-10",
          cinemaMode ? "cinema-hide" : "cinema-show"
        )}
      >
        <div className={cn("absolute inset-0", alphaMode && "hidden")}>
          {/* ---------- calm top bar ---------- */}
          <div className="pointer-events-auto absolute inset-x-2 top-2 z-20 lg:inset-x-3 lg:top-3">
            <TopBar
              connected={connected}
              lang={lang}
              alphaMode={alphaMode}
              cinemaMode={cinemaMode}
              onToggleCinema={() => setCinemaMode((v) => !v)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              autopilotActive={autopilotActive}
              autopilotElapsed={autopilotElapsed}
              autopilotStep={autopilotStep}
              onToggleAutopilot={toggleAutopilot}
              isSpeaking={isSpeaking}
              isVoiceMuted={isVoiceMuted}
              onToggleMute={toggleMute}
            />
          </div>

          {/* ---------- scorebug + one route into stats ---------- */}
          <div className="pointer-events-auto absolute left-2 top-[62px] z-20 lg:left-3 lg:top-[71px]">
            <LeftRail tick={tick} metrics={metrics} />
          </div>

          {/* ---------- tactical pulse (desktop breathing room only) ---------- */}
          <div className="pointer-events-none absolute inset-x-4 top-[62px] z-10 hidden justify-center lg:flex lg:top-[71px]">
            <TacticalPulseBar metrics={metrics} compact />
          </div>

          {/* ---------- live scenario / reasoning status ---------- */}
          <div className="pointer-events-none absolute right-2 top-[62px] z-20 hidden max-w-[calc(100vw-350px)] flex-col items-end gap-1.5 md:flex md:right-3 lg:top-[71px]">
            {tick?.scenario && (
              <div
                className="clip-skew flex max-w-full items-center gap-2 px-3 py-1"
                style={{ background: "rgba(255,194,77,0.14)", border: "1px solid rgba(255,194,77,0.5)" }}
              >
                <span className="h-2 w-2 shrink-0 animate-breathe rounded-full bg-gold" />
                <span className="truncate font-display text-[13px] font-bold uppercase tracking-[0.25em] text-gold">
                  God Mode · {tick.scenario.replace(/_/g, " ")}
                  {tick.scenario_left != null ? ` · ${Math.ceil(tick.scenario_left)}s` : ""}
                </span>
              </div>
            )}
            {phase2Pending && (
              <div
                className="clip-skew flex max-w-full items-center gap-2 border border-tactical/40 bg-slate-950/85 px-3 py-1 backdrop-blur-xl"
                style={{ animation: "flicker-in 0.5s ease-out both" }}
              >
                <span className="h-2 w-2 shrink-0 animate-breathe rounded-full bg-tactical" />
                <span
                  className="truncate bg-gradient-to-r from-tactical via-white to-tactical bg-[length:200%_100%] bg-clip-text font-tech text-[11px] font-bold uppercase tracking-[0.14em] text-transparent"
                  style={{ animation: "bar-shimmer 1.4s linear infinite" }}
                >
                  Azure AI Foundry Models reasoning over 60s spatial buffer...
                </span>
              </div>
            )}
            {cameraNotice && !alphaMode && (
              <div
                className="clip-skew flex max-w-full items-center gap-2 border border-white/15 bg-slate-950/85 px-2.5 py-1 backdrop-blur-xl"
                style={{ animation: "flicker-in 0.35s ease-out both" }}
                role="status"
                aria-live="polite"
              >
                <span className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  cameraNotice.ai ? "bg-gold" : "bg-tactical",
                )} />
                <span className="font-tech text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {cameraNotice.ai ? "AI DIRECTOR" : "CAMERA"}
                </span>
                <span className="truncate font-display text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  {cameraNotice.label}
                </span>
              </div>
            )}
          </div>

          {/* ---------- five-button fan dock ---------- */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center lg:bottom-3">
            <div className="pointer-events-auto w-full max-w-[700px]">
              <BottomDock
                tick={tick}
                busy={busy}
                inject={inject}
                isDvrPaused={isDvrPaused}
                dvrOffsetTicks={dvrOffsetTicks}
                pausedClock={pausedClock}
                togglePause={togglePause}
                scrub={scrub}
                telestrator={telestrator}
                toggleTelestrator={toggleTelestrator}
                autoSpotlight={autoSpotlight}
                lockedId={lockedId}
                onLock={handleLock}
                events={events}
                lang={lang}
                insightLine={latest?.stage_e_personalization.player_lock_insight ?? null}
                lowerThird={lowerThird}
                sandboxActive={sandboxActive}
                onToggleSandbox={toggleSandbox}
              />
            </div>
          </div>
        </div>

        {/* autopilot step banner (hidden with the HUD in cinema mode) */}
        <JudgeAutopilotTour
          active={autopilotActive && !alphaMode}
          currentStep={autopilotStep}
          elapsed={autopilotElapsed}
          onInspectProof={handleInspectProof}
        />
      </div>

      {/* ---------- optional Control Center (closed by default) ---------- */}
      {!cinemaMode && (
        <RightDock
          camMode={camMode}
          pickCamera={pickCamera}
          toggles={toggles}
          toggleKey={toggleKey}
          aiDirected={!!override}
          insights={insights}
          persona={persona}
          onPersona={handlePersona}
          lang={lang}
          onLang={handleLang}
          metrics={metrics}
          tick={tick}
          latestEvent={events[0] ?? null}
          metricFocus={personalization.metric_focus}
          clubBias={personalization.favorite_club_bias}
          latest={latest}
          studioRecap={studioRecap}
          onCloseRecap={studio.clearRecap}
          lockedId={lockedId}
          onStudioDirective={handleStudioDirective}
          onStudioAction={handleStudioAction}
          onProjectShift={handleProjectShift}
          warRoomPrefill={warRoomPrefill}
          warRoomRunToken={warRoomRunToken}
          personalization={personalization}
          applyPreferences={applyPreferences}
          telestrator={telestrator}
          onLock={handleLock}
          events={events}
          cvExpanded={cvExpanded}
          toggleTelestrator={toggleTelestrator}
          autoSpotlight={autoSpotlight}
          alphaMode={alphaMode}
          alphaBackdrop={alphaBackdrop}
          onToggleAlpha={toggleAlpha}
          onToggleBackdrop={() => setAlphaBackdrop((b) => (b === "checker" ? "green" : "checker"))}
          onShowAlphaModal={() => setShowAlphaModal(true)}
          onShowRubric={() => setShowRubric(true)}
          onShowRecap={() => setShowRecap(true)}
          pipeline={pipeline}
          connected={connected}
          status={status}
          drill={failoverDrillState}
          onTriggerDrill={triggerFailoverDrill}
        />
      )}

      {alphaMode && (
        <div className="pointer-events-none fixed inset-0 z-30">
          <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-2">
            <SMPTEChip visible />
            <button
              onClick={toggleAlpha}
              className="clip-skew border border-tactical/40 bg-slate-950/85 px-3 py-1.5 font-tech text-[10px] font-bold uppercase tracking-[0.18em] text-tactical backdrop-blur-xl hover:bg-tactical/15 hover:text-white"
              title="Exit clean alpha feed"
            >
              Exit Alpha
            </button>
          </div>
          <div className="absolute bottom-3 left-3 flex items-end gap-2 opacity-90">
            <span className="h-6 w-1 bg-gradient-to-b from-tactical to-transparent" />
            <div className="leading-none">
              <div className="font-display text-[14px] font-bold uppercase tracking-[0.16em] text-white">
                AETHER<span className="text-tactical">PITCH</span>
              </div>
              <div className="mt-1 font-tech text-[8px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Clean AR Layer · SMPTE Alpha · {alphaBackdrop === "green" ? "Chroma Green" : "Checkerboard"}
              </div>
            </div>
          </div>
        </div>
      )}

      {cinemaMode && !alphaMode && (
        <>
          <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
            <span className="hidden items-center gap-2 border border-white/10 bg-slate-950/75 px-2.5 py-1.5 font-tech text-[9px] font-bold uppercase tracking-[0.24em] text-slate-400 backdrop-blur-xl sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-crimson hud-live-dot" />
              Clean Feed
            </span>
            <button
              autoFocus
              onClick={() => setCinemaMode(false)}
              className="pointer-events-auto flex items-center gap-2 border border-tactical/40 bg-slate-950/80 px-3 py-1.5 font-tech text-[10px] font-bold uppercase tracking-[0.18em] text-tactical backdrop-blur-xl hover:bg-tactical/15 hover:text-white"
              title="Restore HUD (H)"
              aria-label="Restore HUD"
            >
              Restore HUD
              <kbd className="ml-1 border border-white/15 px-1 py-px text-[8px] text-slate-400">H</kbd>
            </button>
          </div>
          <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex items-end gap-2 opacity-90">
            <span className="h-6 w-1 bg-gradient-to-b from-crimson to-tactical" />
            <div className="leading-none">
              <div className="font-display text-[15px] font-bold uppercase tracking-[0.16em] text-white">
                AETHER<span className="text-tactical">PITCH</span>
              </div>
              <div className="mt-1 font-tech text-[8px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                Live World Feed · 10 Hz
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------- GOAL slam ---------- */}
      {goalBanner && !alphaMode && (
        <div
          key={goalBanner.id}
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          className="pointer-events-none fixed inset-0 z-[45] flex items-center justify-center overflow-hidden"
        >
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 36 }).map((_, i) => (
              <span
                key={i}
                className="absolute block"
                style={{
                  left: `${(i * 37 + 11) % 100}%`,
                  top: "-8%",
                  width: `${4 + (i % 3) * 2}px`,
                  height: `${9 + (i % 4) * 3}px`,
                  borderRadius: i % 4 === 0 ? "50%" : "1px",
                  backgroundColor: goalPalette[i % goalPalette.length],
                  opacity: 0.9,
                  animation: `confetti-fall ${1.3 + (i % 5) * 0.16}s cubic-bezier(0.18, 0.7, 0.32, 1) ${(i % 9) * 0.045}s both`,
                }}
              />
            ))}
          </div>
          <div
            className="animate-slam-in relative z-10 flex flex-col items-center overflow-hidden px-14 py-4"
            style={{
              background:
                goalBanner.team === "NLA"
                  ? "linear-gradient(100deg, rgba(127,15,38,0.92), rgba(255,30,86,0.85))"
                  : "linear-gradient(100deg, rgba(7,89,133,0.92), rgba(0,240,255,0.85))",
              clipPath: "polygon(24px 0, 100% 0, calc(100% - 24px) 100%, 0 100%)",
              boxShadow: "0 0 60px rgba(0,0,0,0.7)",
            }}
          >
            <span className="goal-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-70" />
            <span
              className="pointer-events-none absolute h-44 w-44 rounded-full border-2 border-white/40"
              style={{ left: "calc(50% - 5.5rem)", top: "calc(50% - 5.5rem)", animation: "goal-burst 1.3s ease-out both" }}
            />
            <span
              className="font-display text-[84px] font-bold uppercase italic leading-none text-white text-outline"
              style={{ textShadow: "0 6px 30px rgba(0,0,0,0.6)" }}
            >
              GOAL!
            </span>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-display text-[22px] font-bold uppercase tracking-[0.2em] text-white/95">
                {goalBanner.scorer}
              </span>
              <span className="h-4 w-[2px] rotate-12 bg-white/60" />
              <span className="font-tech text-[18px] font-bold tracking-widest text-white/90">
                {goalBanner.clock}
              </span>
              <span className="h-4 w-[2px] rotate-12 bg-white/60" />
              <span className="font-tech text-[18px] font-bold tracking-widest text-white">
                {goalBanner.team} {goalBanner.score.NLA}–{goalBanner.score.MCS}
              </span>
            </div>
          </div>
        </div>
      )}

      {!alphaMode && !cinemaMode && <LiveCaptionStrip />}

      {!alphaMode && !cinemaMode && (
        <CounterfactualDeltaHUD
          tick={tick}
          active={sandboxActive}
          onReset={resetSandbox}
          onClose={closeSandbox}
          onSubmit={submitSandboxToWarRoom}
        />
      )}

      <JudgeFirstRunCard onRunAutopilot={toggleAutopilot} />

      {/* ---------- modals (outside the pointer-events-none HUD wrapper) ---------- */}
      <BroadcastAlphaModal open={showAlphaModal} onClose={() => setShowAlphaModal(false)} insight={latest} />
      <RubricVerifierModal open={showRubric} onClose={() => setShowRubric(false)} />
      <MatchRecapStudioModal
        open={showRecap}
        onClose={() => setShowRecap(false)}
        onLoadAct={handleLoadRecapAct}
        lang={lang}
        tick={tick}
        events={events}
      />
      <ShortcutsOverlay />
    </main>
  );
}
