"use client";
// AETHER PITCH — Interactive Spatial "What-If" Counterfactual Sandbox HUD.
//
// A broadcast-calibrated glass panel that floats above the pitch while a judge
// relocates a player or slides a defensive line. It reports the live Stage B
// deltas, can hand the counterfactual to the Stage C war-room, and can submit
// it to the SpatialArbiterAgent via `POST /api/counterfactual-query`.
//
// The panel subscribes to the sandbox store and re-renders on its own, so the
// page and the 3D scene never re-render during a 60 fps drag.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair, GitCompareArrows, Send, Undo2, X, TrendingUp, TrendingDown, Gavel,
  ShieldCheck, Loader2,
} from "lucide-react";
import {
  buildCounterfactualRequest, evaluateSandbox, lineScrubber, sandbox,
  subscribeSandbox, type SandboxDelta,
} from "@/lib/sandboxStore";
import DefensiveLineScrubber from "@/components/hud/DefensiveLineScrubber";
import { logExperiment, annotateWithEvaluation } from "@/lib/ledgerStore";
import { API_BASE } from "@/lib/api";
import type { CounterfactualEvaluation, MatchTick } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  tick: MatchTick | null;
  metrics: { chaos_index?: number } | null;
  active: boolean;
  onReset: () => void;
  onClose: () => void;
  onSubmit: (delta: SandboxDelta) => void;
}

export default function CounterfactualDeltaHUD({
  tick, metrics, active, onReset, onClose, onSubmit,
}: Props) {
  const [delta, setDelta] = useState<SandboxDelta | null>(null);
  const [evaluation, setEvaluation] = useState<CounterfactualEvaluation | null>(null);
  const [adjudicating, setAdjudicating] = useState(false);
  const [adjudicationError, setAdjudicationError] = useState<string | null>(null);
  const lastLoggedRef = useRef<string>("");

  // The live tick arrives 10 times a second. Reading it through a ref keeps
  // the rescan loop below stable: depending on `tick` directly tore down and
  // rebuilt the sandbox subscription and the 80 ms interval on every tick,
  // which (a) dropped any sandbox event that landed in the gap and (b) made
  // this panel render twice per tick instead of once.
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (!active) {
      setDelta(null);
      setEvaluation(null);
      setAdjudicationError(null);
      return;
    }
    const refresh = () => {
      const live = tickRef.current;
      const next = evaluateSandbox(live);
      setDelta(next);
      // One ledger entry per completed drag, not per animation frame.
      if (next && !sandbox.dragging) {
        const key = `${next.playerId}@${next.x.toFixed(1)},${next.y.toFixed(1)}`;
        if (key !== lastLoggedRef.current) {
          lastLoggedRef.current = key;
          logExperiment({
            kind: "player_drag",
            clock: live?.clock ?? "—",
            minute: Math.round((live?.t_match ?? 0) / 60),
            summary:
              `${next.team} #${next.shirtNumber} ${next.playerName} moved ` +
              `${next.displacementM.toFixed(1)}m ` +
              `(${next.originX.toFixed(1)},${next.originY.toFixed(1)}) → ` +
              `(${next.x.toFixed(1)},${next.y.toFixed(1)})`,
            deltaXT: next.deltaXT,
            deltaControlPct: next.deltaControlPct,
            displacementM: next.displacementM,
            vulnerabilityIndex: null,
            throughBallExposureXt: null,
            pressCompressionGainPct: null,
            offsideTrapCatchPct: null,
            scenarioId: null,
            traceId: null,
            numericGroundingVerified: null,
            team: next.team,
          });
        }
      }
    };
    refresh();
    const unsub = subscribeSandbox(refresh);
    // The pitch-control rescan is throttled to ~12 Hz; the 3D position itself
    // is interpolated at 60 fps inside the avatar's own useFrame.
    const timer = setInterval(refresh, 80);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [active]);

  const lineShift = useMemo(() => {
    if (!tick || !active) return null;
    return lineScrubber.shift;
  }, [tick, active]);

  const adjudicate = useCallback(async () => {
    const payload = buildCounterfactualRequest(tick, delta, metrics?.chaos_index ?? 0.5);
    if (!payload && !lineShift) {
      setAdjudicationError("Select a player or shift a defensive line first.");
      return;
    }
    setAdjudicating(true);
    setAdjudicationError(null);
    try {
      const r = await fetch(`${API_BASE}/api/counterfactual-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(payload ?? {
            match_id: "SYN-PL-2026-1019-NLA-MCS",
            minute: Math.round((tick?.t_match ?? 0) / 60),
            displacements: [],
            baseline_xt: 0,
            baseline_pitch_control: {},
            current_chaos_index: metrics?.chaos_index ?? 0.5,
          }),
          defensive_line_override: lineShift
            ? {
                team: lineShift.team,
                original_height_m: lineShift.current_line_height_m,
                target_height_m: lineShift.target_line_height_m,
              }
            : undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as CounterfactualEvaluation;
      setEvaluation(data);
      if (delta) {
        annotateWithEvaluation(data, "player_drag");
      }
      if (lineShift) {
        annotateWithEvaluation(data, "defensive_line_shift");
      }
    } catch (err) {
      setAdjudicationError(
        `Arbiter unreachable (${err instanceof Error ? err.message : "network error"}).`
      );
    } finally {
      setAdjudicating(false);
    }
  }, [tick, delta, lineShift, metrics]);

  if (!active) return null;

  const up = (delta?.deltaXT ?? 0) >= 0;
  const ctrlUp = (delta?.deltaControlPct ?? 0) >= 0;

  return (
    <div
      className="pointer-events-auto fixed bottom-[92px] left-1/2 z-[45] w-[min(760px,calc(100vw-24px))] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div className="clip-ea border border-cyan-300/40 bg-slate-950/92 px-3 py-2.5 shadow-[0_0_38px_rgba(0,229,255,0.16)] backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
            <Crosshair size={12} /> What-If Sandbox
            {delta && (
              <span className="font-tech text-[9px] font-normal normal-case tracking-wider text-slate-500">
                {delta.team} #{delta.shirtNumber} {delta.playerName}
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            aria-label="Exit the counterfactual sandbox"
            className="p-0.5 text-slate-500 transition hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        {!delta ? (
          <p className="font-tech text-[10px] leading-relaxed text-slate-400">
            Sandbox armed — click any avatar on the pitch and drag it to a new
            position, or slide the collective defensive line below. The Stage B
            twin recomputes Expected Threat and Pitch Control live.
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-tech text-[9.5px] uppercase tracking-wider text-slate-500">
              <span>
                Displacement{" "}
                <b className="text-slate-200">
                  ({delta.originX.toFixed(1)}, {delta.originY.toFixed(1)}) → ({delta.x.toFixed(1)}, {delta.y.toFixed(1)})
                </b>
              </span>
              <span>
                Moved <b className="text-slate-200">{delta.displacementM.toFixed(1)} m</b>
              </span>
              <span>
                xT at position{" "}
                <b className="text-slate-200">
                  {delta.originalXT.toFixed(3)} → {delta.newXT.toFixed(3)}
                </b>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <div className="border border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Δ Expected Threat
                  </span>
                  {up ? (
                    <TrendingUp size={10} className="text-pitch" />
                  ) : (
                    <TrendingDown size={10} className="text-crimson" />
                  )}
                </div>
                <div
                  className={cn(
                    "font-display text-[16px] font-bold tabular-nums",
                    up ? "text-pitch" : "text-crimson"
                  )}
                >
                  {up ? "+" : ""}
                  {delta.deltaXT.toFixed(3)} xT
                </div>
              </div>

              <div className="border border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Δ {delta.team} Pitch Control
                  </span>
                  {ctrlUp ? (
                    <TrendingUp size={10} className="text-cyan-300" />
                  ) : (
                    <TrendingDown size={10} className="text-gold" />
                  )}
                </div>
                <div
                  className={cn(
                    "font-display text-[16px] font-bold tabular-nums",
                    ctrlUp ? "text-cyan-300" : "text-gold"
                  )}
                >
                  {ctrlUp ? "+" : ""}
                  {delta.deltaControlPct.toFixed(1)} pts
                </div>
                <div className="font-tech text-[7.5px] uppercase tracking-wider text-slate-600">
                  {delta.originalControlPct.toFixed(1)}% → {delta.newControlPct.toFixed(1)}%
                </div>
              </div>

              <div className="border border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Opponent Control
                  </span>
                  <GitCompareArrows size={10} className="text-slate-500" />
                </div>
                <div className="font-display text-[16px] font-bold tabular-nums text-slate-300">
                  {delta.opponentControlPct.toFixed(1)}%
                </div>
                <div className="font-tech text-[7.5px] uppercase tracking-wider text-slate-600">
                  {delta.team === "NLA" ? "MCS" : "NLA"} territory
                </div>
              </div>
            </div>

            <DefensiveLineScrubber tick={tick} />

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => onSubmit(delta)}
                className="clip-skew flex items-center gap-1 bg-cyan-300/20 px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-300/35"
                title="Hand this counterfactual to the Stage C war-room for full debate"
              >
                <Send size={11} /> Send to War-Room
              </button>
              <button
                onClick={adjudicate}
                disabled={adjudicating}
                className="clip-skew flex items-center gap-1 bg-gold/20 px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/35 disabled:opacity-50"
                title="Submit to POST /api/counterfactual-query for SpatialArbiterAgent adjudication"
              >
                {adjudicating ? <Loader2 size={11} className="animate-spin" /> : <Gavel size={11} />}
                {adjudicating ? "Adjudicating" : "Submit to Arbiter"}
              </button>
              <button
                onClick={onReset}
                className="clip-skew flex items-center gap-1 bg-white/[0.06] px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-slate-300 transition hover:bg-white/[0.12]"
              >
                <Undo2 size={11} /> Revert
              </button>
            </div>

            {adjudicationError && (
              <p className="mt-1.5 font-tech text-[9px] uppercase tracking-wider text-crimson">
                {adjudicationError}
              </p>
            )}

            {evaluation && (
              <div className="mt-2 border border-gold/35 bg-gold/[0.06] px-2 py-1.5">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 font-tech text-[8.5px] font-bold uppercase tracking-wider text-gold">
                    <Gavel size={10} /> SpatialArbiterAgent
                  </span>
                  <span
                    className={cn(
                      "clip-skew px-1 py-0.5 font-tech text-[7.5px] font-bold uppercase tracking-wider",
                      evaluation.numeric_grounding_verified
                        ? "bg-pitch/20 text-pitch"
                        : "bg-crimson/20 text-crimson",
                    )}
                  >
                    {evaluation.numeric_grounding_verified ? "Grounded" : "Review"}
                  </span>
                  <span className="font-tech text-[7.5px] uppercase tracking-wider text-slate-500">
                    vuln {evaluation.structural_vulnerability_index.toFixed(2)}
                    {" · "}xt {evaluation.projected_xt_shift >= 0 ? "+" : ""}
                    {evaluation.projected_xt_shift.toFixed(3)}
                    {" · "}trace {evaluation.trace_id.slice(-6)}
                  </span>
                </div>
                <p className="text-[10.5px] leading-relaxed text-slate-200">
                  {evaluation.arbiter_verdict}
                </p>
                <p className="mt-1 flex items-center gap-1 font-tech text-[8.5px] uppercase tracking-wider text-slate-500">
                  <ShieldCheck size={9} className="text-pitch" />
                  Compensation: #{evaluation.recommended_compensation_move.player_id} → (
                  {evaluation.recommended_compensation_move.target_xy[0].toFixed(1)},{" "}
                  {evaluation.recommended_compensation_move.target_xy[1].toFixed(1)})
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
