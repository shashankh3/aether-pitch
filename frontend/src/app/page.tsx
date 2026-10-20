"use client";
// AETHER PITCH v3.0/v4.0 — EA SPORTS FC 27 broadcast monitor shell.
// Full-bleed 3D WebGL stadium background + floating FC 27 chrome:
// scorebug · CV auto-eventing PiP · tactical pulse · camera director ·
// TwinCast dock · 12th Man co-pilot · PlayerLock hologram · radar minimap ·
// DVR/telestrator bar · God-Mode deck · pipeline strip · production cluster.
//
// The HUD is organised as a responsive overlay grid so panels never overlap:
//   xl+  : [left rail] [centre stage] [right rail] with a bottom dashboard row
//   <xl  : compact stacked monitor (brand + pulse + bottom console)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HoloPitch3D, { type OverlayToggles } from "@/components/three/HoloPitch3D";
import ScoreBug from "@/components/ScoreBug";
import TacticalPulseBar from "@/components/TacticalPulseBar";
import CameraDirectorBar from "@/components/CameraDirectorBar";
import TwinCastHUD from "@/components/TwinCastHUD";
import PlayerLock360 from "@/components/PlayerLock360";
import StudioProducer from "@/components/StudioProducer";
import PitchForgeDeck from "@/components/PitchForgeDeck";
import PipelineInspector from "@/components/PipelineInspector";
import VisionAutoEventerHUD from "@/components/VisionAutoEventerHUD";
import TelestratorDVRBar from "@/components/TelestratorDVRBar";
import TacticalRadarMiniMap from "@/components/TacticalRadarMiniMap";
import BroadcastAlphaModal, { SMPTEChip } from "@/components/BroadcastAlphaModal";
import RubricVerifierModal from "@/components/RubricVerifierModal";
import FanPersonalizationTuner from "@/components/FanPersonalizationTuner";
import MatchRecapStudioModal from "@/components/MatchRecapStudioModal";
import JudgeAutopilotTour from "@/components/JudgeAutopilotTour";
import { useResilientMatchEngine } from "@/hooks/useResilientMatchEngine";
import { useSpeechController } from "@/hooks/useSpeechController";
import { telemetry } from "@/lib/telemetry";
import type {
  CameraDirective, CameraMode, HighlightZone, Insight, LangCode, MatchRecapStoryboard,
  MetricFocus, PersonaMode, PersonaModeV5, PersonalizationState, RecapAct, RecapPassArc,
  StudioQueryResponse, TelestratorState,
} from "@/lib/types";
import { Radio, Clapperboard, LayoutGrid, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const SCENARIO_KEYS: Record<string, string> = {
  "1": "chaos_counter",
  "2": "high_press_turnover",
  "3": "tactical_inversion",
  "4": "halftime_recap",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const studio = useResilientMatchEngine();
  const {
    tick, metrics, insights, events, pipeline, connected, status, sendScenario, tickRef, applySnapshot,
  } = studio;

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

  // ---- v3.0 DVR + telestrator ----
  const [isDvrPaused, setDvrPaused] = useState(false);
  const [dvrOffsetTicks, setDvrOffsetTicks] = useState(0);
  const [telestrator, setTelestrator] = useState<TelestratorState>(EMPTY_TELESTRATOR);
  const [highlightZone, setHighlightZone] = useState<HighlightZone | null>(null);

  // ---- v4.0 broadcast alpha + production cluster ----
  const [alphaMode, setAlphaMode] = useState(false);
  const [alphaBackdrop, setAlphaBackdrop] = useState<"checker" | "green">("checker");
  const [showAlphaModal, setShowAlphaModal] = useState(false);
  const [showRubric, setShowRubric] = useState(false);

  // ---- v5.0 judge domination ----
  const [showRecap, setShowRecap] = useState(false);
  const [recapPass, setRecapPass] = useState<RecapPassArc | null>(null);
  const [cvExpanded, setCvExpanded] = useState<boolean | null>(null);
  const [autopilotStep, setAutopilotStep] = useState(-1);
  const tourFxTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ---- v4.0 two-phase scenario UX ----
  const [phase2Pending, setPhase2Pending] = useState(false);

  const { isSpeaking, isVoiceMuted, toggleMute, speakInsight } = useSpeechController();

  // alpha mode via URL param: ?overlay=alpha
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("overlay") === "alpha") {
      setAlphaMode(true);
    }
  }, []);

  // lower-third: show for 8s whenever a new insight lands
  const latest = insights[0] ?? null;
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
    overrideTimer.current = setTimeout(() => setOverride(null), 6500);
  }, [latest?.id]);

  // two-phase scenario UX: phase 2 resolves when the AI insight lands
  useEffect(() => {
    if (phase2Pending && latest) setPhase2Pending(false);
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
      setPhase2Pending(true);
      setTimeout(() => setPhase2Pending(false), 3500); // causal stream fallback
      await sendScenario(name);
      setTimeout(() => setBusy(null), 900);
    },
    [sendScenario]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const name = SCENARIO_KEYS[e.key];
      if (name && !busy) inject(name);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inject, busy]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/personalization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personalization),
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [personalization]);

  useEffect(() => () => {
    tourFxTimers.current.forEach((t) => clearTimeout(t));
  }, []);

  // ---- DVR controls ----
  const togglePause = useCallback(() => {
    setDvrPaused((paused) => {
      const next = !paused;
      telemetry.playbackPaused = next;
      if (!next) {
        setDvrOffsetTicks(0);
        setRecapPass(null);
        setTelestrator((t) => ({ ...t, animateGhostReplay: false, customTacticalArrows: [] }));
        if (tickRef.current) telemetry.applyTick(tickRef.current, false);
      } else {
        telemetry.replay(dvrOffsetTicks);
      }
      return next;
    });
  }, [dvrOffsetTicks, tickRef]);

  const scrub = useCallback((offset: number) => {
    setDvrOffsetTicks(offset);
    telemetry.replay(offset);
  }, []);

  const handleLoadRecapAct = useCallback(
    (act: RecapAct, recap: MatchRecapStoryboard) => {
      setDvrPaused(true);
      telemetry.playbackPaused = true;
      setDvrOffsetTicks(0);
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
      overrideTimer.current = setTimeout(() => setOverride(null), 12000);
    },
    [lockedId]
  );

  const handleAutopilotStep = useCallback(
    (index: number) => {
      setAutopilotStep(index);
      const snap = tickRef.current;
      switch (index) {
        case 0:
          setCvExpanded(true);
          pickCamera("TELE_BROADCAST");
          break;
        case 1:
          setCvExpanded(false);
          setToggles((t) => ({ ...t, pitchControl: true, passingNetwork: true, lasers: true, ghost: true }));
          void inject("chaos_counter");
          break;
        case 2: {
          setCvExpanded(false);
          setDvrPaused(true);
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
          setDvrPaused(false);
          telemetry.playbackPaused = false;
          setDvrOffsetTicks(0);
          setRecapPass(null);
          setTelestrator((t) => ({ ...t, animateGhostReplay: false, customTacticalArrows: [] }));
          if (snap) telemetry.applyTick(snap, false);
          setAlphaMode(true);
          tourFxTimers.current.push(setTimeout(() => setAlphaMode(false), 6500));
          break;
        case 4: {
          setAlphaMode(false);
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
          setShowRecap(true);
          tourFxTimers.current.push(setTimeout(() => setShowRubric(true), 4000));
          break;
        default:
          break;
      }
    },
    [
      applyPreferences, dvrOffsetTicks, inject, personalization, pickCamera, tickRef,
    ]
  );

  const handleAutopilotStop = useCallback(() => {
    tourFxTimers.current.forEach((t) => clearTimeout(t));
    tourFxTimers.current = [];
    setAlphaMode(false);
    setCvExpanded(null);
    setAutopilotStep(-1);
  }, []);

  const lt = lowerThird?.stage_d_broadcast_overlay;
  const ltIsAlert =
    lt?.overlay_type === "CHAOS_OVERLOAD_ALERT" || lt?.overlay_type === "PRESSING_TRAP_ALERT";
  const aiDirected = !!override;

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

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-obsidian">
      {/* chroma / checkerboard backdrop behind the transparent WebGL canvas */}
      {alphaMode && <div className="fixed inset-0 z-0" style={alphaBackdropStyle} />}

      {/* full-bleed 3D WebGL stadium */}
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
        onLock={handleLock}
      />

      {/* ------------------------------------------------------------------ */}
      {/* HUD overlay grid: left rail · centre stage · right rail · dashboard */}
      {/* ------------------------------------------------------------------ */}
      <div className={cn("pointer-events-none absolute inset-0", alphaMode ? "z-20" : "z-10")}>
        <div className="grid h-full w-full grid-cols-1 grid-rows-[auto_1fr_auto] gap-2 overflow-y-auto p-2 scroll-slim lg:gap-3 lg:p-3 xl:grid-cols-[352px_minmax(0,1fr)_368px] xl:grid-rows-[minmax(0,1fr)_auto] xl:overflow-hidden">

          {/* ---------- LEFT RAIL · top: brand + scorebug + CV auto-eventer ---------- */}
          <div className="pointer-events-auto flex min-h-0 flex-col items-start gap-2 xl:col-start-1 xl:row-start-1">
            <div className="flex items-center gap-2">
              <div
                className="clip-skew flex h-9 w-9 items-center justify-center bg-gradient-to-br from-violetdeep via-[#6d1250] to-crimson"
                style={{ boxShadow: "0 0 16px rgba(255,30,86,0.35)" }}
              >
                <Radio size={17} className="text-white" />
              </div>
              <div className="leading-none">
                <div className="font-display text-[17px] font-bold uppercase tracking-[0.1em] text-white">
                  AETHER<span className="text-tactical">PITCH</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-crimson animate-breathe" : "bg-slate-600"}`} />
                  <span className="font-tech text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    FC27 3D Broadcast · 10 Hz
                  </span>
                </div>
              </div>
            </div>
            <ScoreBug tick={tick} metrics={metrics} />
            <div className="hidden min-h-0 xl:block [@media(max-height:800px)]:hidden">
              <VisionAutoEventerHUD events={events} expandedOverride={cvExpanded} />
            </div>
          </div>

          {/* ---------- CENTRE STAGE · top: pulse + voice pill + status badges ---------- */}
          <div className="pointer-events-auto flex flex-col items-center gap-2 xl:col-start-2 xl:row-start-1">
            <TacticalPulseBar metrics={metrics} />
            <JudgeAutopilotTour
              onStep={handleAutopilotStep}
              onStop={handleAutopilotStop}
              currentStep={Math.max(0, autopilotStep)}
            />
            <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
              {isSpeaking && !isVoiceMuted && (
                <button
                  onClick={toggleMute}
                  className="clip-skew flex items-center gap-2 border border-pitch/50 bg-slate-950/85 px-2.5 py-1 backdrop-blur-xl"
                  title="AI Broadcast Voice Live — click to mute"
                >
                  <span className="flex items-end gap-[2px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-[3px] bg-pitch"
                        style={{
                          height: `${5 + ((i * 7) % 12)}px`,
                          animation: `breathe ${0.5 + i * 0.13}s ease-in-out infinite`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="font-tech text-[10.5px] font-bold uppercase tracking-wider text-pitch">
                    AI BROADCAST VOICE LIVE [{lang.toUpperCase()}] • CLICK TO MUTE
                  </span>
                </button>
              )}
              <SMPTEChip visible={alphaMode} />
            </div>
            {tick?.scenario && (
              <div
                className="clip-skew flex items-center gap-2 px-3 py-1"
                style={{ background: "rgba(255,194,77,0.14)", border: "1px solid rgba(255,194,77,0.5)" }}
              >
                <span className="h-2 w-2 animate-breathe rounded-full bg-gold" />
                <span className="font-display text-[13px] font-bold uppercase tracking-[0.25em] text-gold">
                  God Mode · {tick.scenario.replace(/_/g, " ")}
                  {tick.scenario_left != null ? ` · ${Math.ceil(tick.scenario_left)}s` : ""}
                </span>
              </div>
            )}
            {phase2Pending && (
              <div
                className="clip-skew flex items-center gap-2 border border-tactical/40 bg-slate-950/85 px-3 py-1 backdrop-blur-xl"
                style={{ animation: "flicker-in 0.5s ease-out both" }}
              >
                <span className="h-2 w-2 animate-breathe rounded-full bg-tactical" />
                <span className="bg-gradient-to-r from-tactical via-white to-tactical bg-[length:200%_100%] bg-clip-text font-tech text-[11px] font-bold uppercase tracking-[0.14em] text-transparent"
                  style={{ animation: "bar-shimmer 1.4s linear infinite" }}>
                  🧠 Azure AI Foundry Agents Reasoning over 60s Spatial Buffer...
                </span>
              </div>
            )}
          </div>

          {/* ---------- RIGHT RAIL · production cluster + camera + TwinCast + co-pilot + radar ---------- */}
          <aside className="pointer-events-auto hidden min-h-0 flex-col gap-2 overflow-y-auto pr-0.5 scroll-slim xl:col-start-3 xl:row-span-2 xl:flex">
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => setAlphaMode((a) => !a)}
                className={cn(
                  "clip-skew flex flex-1 items-center justify-center gap-1 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider transition",
                  alphaMode ? "bg-gold/25 text-gold" : "bg-slate-950/85 text-slate-300 hover:text-white"
                )}
                title="Broadcast Alpha / Chroma-Key overlay mode (?overlay=alpha)"
              >
                <Clapperboard size={12} /> Studio Alpha
              </button>
              {alphaMode && (
                <button
                  onClick={() => setAlphaBackdrop((b) => (b === "checker" ? "green" : "checker"))}
                  className="clip-skew bg-slate-950/85 px-2 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white"
                  title="Toggle transparent checkerboard / chroma green"
                >
                  {alphaBackdrop === "green" ? "🟩 Chroma" : "▦ Alpha"}
                </button>
              )}
              <button
                onClick={() => setShowAlphaModal(true)}
                className="clip-skew flex items-center gap-1 bg-slate-950/85 px-2 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-gold hover:text-white"
                title="Inspect the machine-readable AETHER_RENDER_PARTNER_V2 packet"
              >
                <LayoutGrid size={12} /> Overlay JSON
              </button>
              <button
                onClick={() => setShowRubric(true)}
                className="clip-skew flex items-center gap-1 bg-pitch/20 px-2 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-pitch hover:bg-pitch/40"
                title="Run the live 5-stage pipeline audit"
              >
                <ShieldCheck size={12} /> Verify
              </button>
            </div>
            <CameraDirectorBar
              mode={camMode}
              onMode={pickCamera}
              toggles={toggles}
              onToggle={toggleKey}
              aiDirected={aiDirected}
            />
            <FanPersonalizationTuner state={personalization} onChange={applyPreferences} />
            <div className="min-h-[176px] flex-1">
              <TwinCastHUD
                insights={insights}
                persona={persona}
                onPersona={(next) => {
                  setPersona(next);
                  setPersonalization((p) => ({
                    ...p,
                    persona_mode: next === "analyst" ? "ANALYST_HUD" : next === "casual" ? "CASUAL_STORY" : "TWINCAST_SPLIT",
                  }));
                }}
                lang={lang}
                onLang={(next) => {
                  setLang(next);
                  setPersonalization((p) => ({ ...p, market_language: next }));
                }}
                metrics={metrics}
                tick={tick}
                latestEvent={events[0] ?? null}
                metricFocus={personalization.metric_focus}
                clubBias={personalization.favorite_club_bias}
              />
            </div>
            <StudioProducer
              latest={latest}
              recap={studio.recap}
              onCloseRecap={studio.clearRecap}
              lang={lang}
              lockedId={lockedId}
              onStudioDirective={handleStudioDirective}
            />
            <div className="flex shrink-0 justify-center">
              <TacticalRadarMiniMap lockedId={lockedId} telestrator={telestrator} onLock={handleLock} />
            </div>
          </aside>

          {/* ---------- DASHBOARD · bottom-left: PlayerLock hologram ---------- */}
          <div className="pointer-events-auto hidden items-end xl:col-start-1 xl:row-start-2 xl:flex">
            <PlayerLock360
              tick={tick}
              lockedId={lockedId}
              onLock={handleLock}
              events={events}
              lang={lang}
              insightLine={latest?.stage_e_personalization.player_lock_insight ?? null}
            />
          </div>

          {/* ---------- DASHBOARD · bottom-centre: lower-third + DVR + pipeline + deck ---------- */}
          <div className="pointer-events-none relative flex flex-col justify-end gap-1.5 xl:col-start-2 xl:row-start-2">
            {lt && lowerThird && (
              <div
                key={lowerThird.id}
                className="animate-lower-in pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 flex w-full max-w-[640px] -translate-x-1/2 items-stretch"
              >
                <div
                  className="flex w-[54px] shrink-0 flex-col items-center justify-center py-2"
                  style={{
                    background: ltIsAlert ? "#FF1E56" : "#00F0FF",
                    clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
                  }}
                >
                  <span className="font-display text-[15px] font-extrabold uppercase leading-none text-black/85">
                    {lt.timecode}
                  </span>
                  <span className="mt-0.5 font-tech text-[8px] font-bold uppercase tracking-[0.2em] text-black/70">
                    Pulse
                  </span>
                </div>
                <div
                  className="min-w-0 flex-1 px-4 py-2"
                  style={{
                    background: "linear-gradient(100deg, rgba(5,8,14,0.96) 0%, rgba(10,16,28,0.86) 100%)",
                    borderTop: `2px solid ${ltIsAlert ? "#FF1E56" : "#00F0FF"}`,
                  }}
                >
                  <div
                    className="truncate font-display text-[21px] font-bold uppercase italic leading-tight tracking-wide text-white"
                    style={{ textShadow: ltIsAlert ? "0 0 18px rgba(255,30,86,0.55)" : "0 0 18px rgba(0,240,255,0.4)" }}
                  >
                    {lt.lower_third_title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-tech text-[12px] font-semibold tracking-[0.08em] text-slate-300">
                    <span className="stripes-dark h-3.5 w-10" />
                    {lt.lower_third_subtitle}
                  </div>
                </div>
              </div>
            )}
            <div className="pointer-events-auto w-full max-w-[820px] self-center">
              <TelestratorDVRBar
                isDvrPaused={isDvrPaused}
                dvrOffsetTicks={dvrOffsetTicks}
                onTogglePause={togglePause}
                onScrub={scrub}
                telestrator={telestrator}
                onToggleTelestrator={toggleTelestrator}
                onToggleSpotlight={autoSpotlight}
              />
            </div>
            <div className="pointer-events-auto w-full max-w-[820px] self-center">
              <PipelineInspector pipeline={pipeline} connected={connected} status={status} />
            </div>
            <div className="pointer-events-auto w-full max-w-[820px] self-center">
              <PitchForgeDeck tick={tick} busy={busy} onInject={inject} />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- GOAL slam ---------- */}
      {goalBanner && (
        <div
          key={goalBanner.id}
          className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center overflow-hidden"
        >
          <div
            className="animate-slam-in flex flex-col items-center px-14 py-4"
            style={{
              background:
                goalBanner.team === "NLA"
                  ? "linear-gradient(100deg, rgba(127,15,38,0.92), rgba(255,30,86,0.85))"
                  : "linear-gradient(100deg, rgba(7,89,133,0.92), rgba(0,240,255,0.85))",
              clipPath: "polygon(24px 0, 100% 0, calc(100% - 24px) 100%, 0 100%)",
              boxShadow: "0 0 60px rgba(0,0,0,0.7)",
            }}
          >
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
    </main>
  );
}
