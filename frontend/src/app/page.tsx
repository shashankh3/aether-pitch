"use client";
// AETHER PITCH v2.0 — EA SPORTS FC 27 broadcast monitor shell.
// Full-bleed 3D WebGL stadium as the background layer; every HUD panel is a
// floating frosted-glass slab with EA FC angled corners on top of it.

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
import { useStudio } from "@/hooks/useStudio";
import type { CameraDirective, CameraMode, Insight, LangCode, PersonaMode } from "@/lib/types";
import { Radio } from "lucide-react";

const SCENARIO_KEYS: Record<string, string> = {
  "1": "chaos_counter",
  "2": "high_press_turnover",
  "3": "tactical_inversion",
  "4": "halftime_recap",
};

interface GoalBanner {
  id: string;
  team: "NLA" | "MCS";
  scorer: string;
  clock: string;
  score: { NLA: number; MCS: number };
}

export default function StudioPage() {
  const studio = useStudio();
  const { tick, metrics, insights, events, pipeline, connected, sendScenario } = studio;

  const [lockedId, setLockedId] = useState<string | null>(null);
  const [camMode, setCamMode] = useState<CameraMode>("TELE_BROADCAST");
  const [toggles, setToggles] = useState<OverlayToggles>({ xtGrid: true, ghost: true, lasers: true });
  const [persona, setPersona] = useState<PersonaMode>("split");
  const [lang, setLang] = useState<LangCode>("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [goalBanner, setGoalBanner] = useState<GoalBanner | null>(null);
  const [override, setOverride] = useState<{ directive: CameraDirective; at: number } | null>(null);
  const overrideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // lower-third: show for 8s whenever a new insight lands
  const latest = insights[0] ?? null;
  const [lowerThird, setLowerThird] = useState<Insight | null>(null);
  useEffect(() => {
    if (!latest) return;
    setLowerThird(latest);
    const t = setTimeout(() => setLowerThird(null), 8000);
    return () => clearTimeout(t);
  }, [latest?.id]);

  // AI camera director: adopt the Stage (c)/(d) recommendation for 6.5s;
  // a manual camera pick always cancels the AI take
  useEffect(() => {
    const directive = latest?.camera_directive;
    if (!directive) return;
    setOverride({ directive, at: performance.now() });
    if (overrideTimer.current) clearTimeout(overrideTimer.current);
    overrideTimer.current = setTimeout(() => setOverride(null), 6500);
  }, [latest?.id]);

  const pickCamera = useCallback((m: CameraMode) => {
    if (overrideTimer.current) clearTimeout(overrideTimer.current);
    setOverride(null);
    setCamMode(m);
  }, []);

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
      setBusy(name);
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

  // pill targets: locked player, ball carrier, badged players, sprinters —
  // stable identity so the 3D layer never re-renders at tick rate
  const keySig = tick
    ? [
        tick.carrier,
        lockedId,
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

  const lt = lowerThird?.stage_d_broadcast_overlay;
  const ltIsAlert =
    lt?.overlay_type === "CHAOS_OVERLOAD_ALERT" || lt?.overlay_type === "PRESSING_TRAP_ALERT";
  const aiDirected = !!override;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-obsidian">
      {/* full-bleed 3D WebGL stadium */}
      <HoloPitch3D
        camMode={camMode}
        override={override}
        toggles={toggles}
        lockedId={lockedId}
        keyIds={keyIds}
        metrics={metrics}
        onLock={setLockedId}
      />

      {/* floating HUD layer */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* ---------- top-left: brand + scorebug ---------- */}
        <div className="pointer-events-auto absolute left-3 top-3 space-y-2">
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
        </div>

        {/* ---------- top-center: tactical pulse ---------- */}
        <div className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-2">
          <TacticalPulseBar metrics={metrics} />
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
        </div>

        {/* ---------- top-right: camera director + right dock ---------- */}
        <div className="absolute right-3 top-3 flex w-[368px] flex-col gap-2">
          <CameraDirectorBar
            mode={camMode}
            onMode={pickCamera}
            toggles={toggles}
            onToggle={toggleKey}
            aiDirected={aiDirected}
          />
          <div className="pointer-events-auto flex h-[452px] flex-col">
            <TwinCastHUD
              insights={insights}
              persona={persona}
              onPersona={setPersona}
              lang={lang}
              onLang={setLang}
              metrics={metrics}
            />
          </div>
          <StudioProducer latest={latest} recap={studio.recap} onCloseRecap={studio.clearRecap} />
        </div>

        {/* ---------- bottom-left: PlayerLock 360 hologram ---------- */}
        <div className="absolute bottom-[104px] left-3">
          <PlayerLock360
            tick={tick}
            lockedId={lockedId}
            onLock={setLockedId}
            events={events}
            lang={lang}
            insightLine={latest?.stage_e_personalization.player_lock_insight ?? null}
          />
        </div>

        {/* ---------- bottom-center: lower-third + deck ---------- */}
        {lt && lowerThird && (
          <div
            key={lowerThird.id}
            className="animate-lower-in pointer-events-none absolute bottom-[128px] left-1/2 z-20 flex max-w-[640px] -translate-x-1/2 items-stretch"
          >
            <div
              className="flex w-[54px] flex-col items-center justify-center py-2"
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

        <div className="absolute bottom-3 left-1/2 w-[820px] -translate-x-1/2 space-y-1.5">
          <div className="pointer-events-auto">
            <PipelineInspector pipeline={pipeline} connected={connected} />
          </div>
          <div className="pointer-events-auto">
            <PitchForgeDeck tick={tick} busy={busy} onInject={inject} />
          </div>
        </div>

        {/* ---------- GOAL slam ---------- */}
        {goalBanner && (
          <div
            key={goalBanner.id}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden"
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
      </div>
    </main>
  );
}
