"use client";
// AETHER PITCH — EA Sports FC broadcast studio shell (100vh, zero scroll).
// Composition: TacticalPulseBar (top) · HoloPitchCanvas + GOAL slam +
// lower-thirds (center) · TwinCast/PlayerLock dock (right) ·
// PipelineInspector + PitchForgeDeck (bottom).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HoloPitchCanvas from "@/components/HoloPitchCanvas";
import TacticalPulseBar from "@/components/TacticalPulseBar";
import TwinCastHUD from "@/components/TwinCastHUD";
import PlayerLock360 from "@/components/PlayerLock360";
import StudioProducer from "@/components/StudioProducer";
import PitchForgeDeck from "@/components/PitchForgeDeck";
import PipelineInspector from "@/components/PipelineInspector";
import { useStudio } from "@/hooks/useStudio";
import type { Insight, LangCode, MatchEvent, PersonaMode } from "@/lib/types";

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
  const [tilt, setTilt] = useState(true);
  const [persona, setPersona] = useState<PersonaMode>("split");
  const [lang, setLang] = useState<LangCode>("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [goalBanner, setGoalBanner] = useState<GoalBanner | null>(null);
  const [introWipe, setIntroWipe] = useState(true);

  // lower-third: show for 8s whenever a new insight lands
  const latest = insights[0] ?? null;
  const [lowerThird, setLowerThird] = useState<Insight | null>(null);
  useEffect(() => {
    if (!latest) return;
    setLowerThird(latest);
    const t = setTimeout(() => setLowerThird(null), 8000);
    return () => clearTimeout(t);
  }, [latest?.id]);

  // GOAL slam banner: watch the event stream (newest first)
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

  useEffect(() => {
    const t = setTimeout(() => setIntroWipe(false), 1200);
    return () => clearTimeout(t);
  }, []);

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

  const chaosCritical = (metrics?.chaos_index ?? 0) > 0.68;
  const borderGlow = useMemo(
    () =>
      chaosCritical
        ? "shadow-[inset_0_0_80px_rgba(255,42,84,0.14)]"
        : "shadow-[inset_0_0_80px_rgba(0,240,255,0.05)]",
    [chaosCritical]
  );

  const lt = lowerThird?.stage_d_broadcast_overlay;
  const ltIsAlert = lt?.overlay_type === "CHAOS_OVERLOAD_ALERT" || lt?.overlay_type === "PRESSING_TRAP_ALERT";

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
      <TacticalPulseBar
        tick={tick}
        metrics={metrics}
        connected={connected}
        tilt={tilt}
        onToggleTilt={() => setTilt((t) => !t)}
        persona={persona}
        onPersona={setPersona}
        lang={lang}
        onLang={setLang}
      />

      <div className="flex min-h-0 flex-1">
        {/* ---- centerpiece pitch ---- */}
        <div className={`relative min-w-0 flex-1 ${borderGlow}`}>
          <HoloPitchCanvas
            tickRef={studio.tickRef}
            lockedId={lockedId}
            onLock={setLockedId}
            tilt={tilt}
            events={events}
            possession={metrics?.possession ?? "NLA"}
          />

          {/* broadcast monitor frame + vignette */}
          <div className="pointer-events-none absolute inset-0 z-10"
            style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)" }} />
          {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2",
            "left-2 bottom-2 border-l-2 border-b-2", "right-2 bottom-2 border-r-2 border-b-2"].map((c) => (
            <div key={c} className={`pointer-events-none absolute z-10 h-5 w-5 border-tactical/50 ${c}`} />
          ))}

          {/* intro broadcast wipe */}
          {introWipe && (
            <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-obsidian">
              <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-wipe-diag" />
            </div>
          )}

          {/* ======== GOAL slam overlay ======== */}
          {goalBanner && (
            <div key={goalBanner.id} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
              <div
                className="animate-slam-in flex flex-col items-center px-14 py-4"
                style={{
                  background:
                    goalBanner.team === "NLA"
                      ? "linear-gradient(100deg, rgba(127,15,38,0.92), rgba(255,42,84,0.85))"
                      : "linear-gradient(100deg, rgba(7,89,133,0.92), rgba(56,189,248,0.85))",
                  clipPath: "polygon(24px 0, 100% 0, calc(100% - 24px) 100%, 0 100%)",
                  boxShadow: "0 0 60px rgba(0,0,0,0.7)",
                }}
              >
                <span className="font-display text-[84px] font-extrabold uppercase italic leading-none tracking-tight text-white text-outline"
                  style={{ textShadow: "0 6px 30px rgba(0,0,0,0.6)" }}>
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

          {/* ======== EA-style lower third ======== */}
          {lt && lowerThird && (
            <div
              key={lowerThird.id}
              className="animate-lower-in pointer-events-none absolute bottom-32 left-8 z-20 flex max-w-[640px] items-stretch"
            >
              {/* timecode rail */}
              <div
                className="flex w-[54px] flex-col items-center justify-center py-2"
                style={{
                  background: ltIsAlert ? "#FF2A54" : "#00F0FF",
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
                  borderTop: `2px solid ${ltIsAlert ? "#FF2A54" : "#00F0FF"}`,
                }}
              >
                <div className="truncate font-display text-[21px] font-bold uppercase italic leading-tight tracking-wide text-white"
                  style={{ textShadow: ltIsAlert ? "0 0 18px rgba(255,42,84,0.55)" : "0 0 18px rgba(0,240,255,0.4)" }}>
                  {lt.lower_third_title}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-tech text-[12px] font-semibold tracking-[0.08em] text-slate-300">
                  <span className="stripes-dark h-3.5 w-10 rounded-sm" />
                  {lt.lower_third_subtitle}
                </div>
              </div>
            </div>
          )}

          {/* live chip + watermark */}
          <div className="glass-soft pointer-events-none absolute left-4 top-3.5 z-20 flex items-center gap-2 px-2.5 py-1">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-crimson animate-breathe" : "bg-slate-600"}`} />
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-slate-200">Live · 10 Hz</span>
            <span className="font-tech text-[10px] font-semibold text-slate-500">
              {tick ? `${tick.players.length} players tracked` : ""}
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-4 z-10 select-none text-right leading-none opacity-40">
            <div className="font-display text-[26px] font-extrabold uppercase italic tracking-tight text-white/70">
              AETHER<span className="text-tactical/80">PITCH</span>
            </div>
            <div className="font-tech text-[9px] font-semibold uppercase tracking-[0.4em] text-slate-400">
              HyperMotion Studio
            </div>
          </div>

          {tick?.scenario && (
            <div className="pointer-events-none absolute right-4 top-3.5 z-20">
              <div
                className="clip-skew flex items-center gap-2 px-3 py-1.5"
                style={{ background: "rgba(255,194,77,0.14)", border: "1px solid rgba(255,194,77,0.5)" }}
              >
                <span className="h-2 w-2 animate-breathe rounded-full bg-gold" />
                <span className="font-display text-[12px] font-bold uppercase tracking-[0.25em] text-gold">
                  God Mode · {tick.scenario.replace(/_/g, " ")}
                  {tick.scenario_left != null ? ` · ${Math.ceil(tick.scenario_left)}s` : ""}
                </span>
              </div>
            </div>
          )}

          <StudioProducer latest={latest} recap={studio.recap} onCloseRecap={studio.clearRecap} />
        </div>

        {/* ---- right dock ---- */}
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/10 bg-black/40">
          <div className="min-h-0 flex-1">
            <TwinCastHUD insights={insights} persona={persona} lang={lang} metrics={metrics} />
          </div>
          <PlayerLock360 tick={tick} lockedId={lockedId} onLock={setLockedId} events={events} />
        </aside>
      </div>

      <PipelineInspector pipeline={pipeline} connected={connected} />
      <PitchForgeDeck tick={tick} busy={busy} onInject={inject} />
    </main>
  );
}
