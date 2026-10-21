"use client";
// AETHER PITCH — Collective Defensive Line Height Scrubber.
//
// A broadcast-style slider that shifts an entire team's defensive line
// between 18 m and 52 m from their own goal line. The Stage B twin measures
// the consequence live: through-ball exposure, offside-trap catch probability
// and press compression.
//
// The state lives in the shared sandbox store so the sandbox HUD and the DVR
// dock show the same numbers.

import { useEffect } from "react";
import { Ruler } from "lucide-react";
import {
  evaluateDefensiveLineShift, DEF_LINE_MAX_M, DEF_LINE_MIN_M,
} from "@/lib/edgeEngine";
import {
  lineScrubber, setLineShift, setLineTarget, setLineTeam,
} from "@/lib/sandboxStore";
import { logExperiment } from "@/lib/ledgerStore";
import type { MatchTick, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function DefensiveLineScrubber({ tick }: { tick: MatchTick | null }) {
  const shift = tick
    ? evaluateDefensiveLineShift(tick, lineScrubber.team, lineScrubber.target)
    : null;

  // Publish the live shift so the 3D offside wall and compactness hull move
  // with the slider, not only when the judge lets go of it.
  useEffect(() => {
    setLineShift(shift);
  }, [shift]);

  const commit = () => {
    setLineShift(shift);
    if (!shift) return;
    logExperiment({
      kind: "defensive_line_shift",
      clock: tick?.clock ?? "—",
      minute: Math.round((tick?.t_match ?? 0) / 60),
      summary:
        `${shift.team} defensive line ${shift.current_line_height_m.toFixed(1)}m ` +
        `→ ${shift.target_line_height_m.toFixed(1)}m (Δ${shift.delta_m.toFixed(1)}m)`,
      deltaXT: 0,
      deltaControlPct: 0,
      displacementM: 0,
      vulnerabilityIndex: null,
      throughBallExposureXt: shift.through_ball_exposure_xt,
      pressCompressionGainPct: shift.press_compression_gain_pct,
      offsideTrapCatchPct: shift.offside_trap_catch_prob_pct,
      scenarioId: null,
      traceId: null,
      numericGroundingVerified: null,
      team: shift.team,
    });
  };

  return (
    <div className="mt-1.5 border border-white/10 bg-black/25 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-tech text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
          <Ruler size={10} /> Collective Defensive Line
        </span>
        <div className="flex gap-1">
          {(["NLA", "MCS"] as Team[]).map((t) => (
            <button
              key={t}
              onClick={() => setLineTeam(t)}
              aria-pressed={lineScrubber.team === t}
              className={cn(
                "clip-skew px-1.5 py-0.5 font-tech text-[8px] font-bold uppercase tracking-wider transition",
                lineScrubber.team === t
                  ? "bg-gold/20 text-gold"
                  : "bg-white/[0.06] text-slate-500 hover:text-slate-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-tech text-[8px] text-slate-600">{DEF_LINE_MIN_M}m</span>
        <input
          type="range"
          min={DEF_LINE_MIN_M}
          max={DEF_LINE_MAX_M}
          step={1}
          value={lineScrubber.target}
          onChange={(e) => setLineTarget(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label={`${lineScrubber.team} collective defensive line height`}
          className="h-1 min-w-0 flex-1 accent-gold"
        />
        <span className="font-tech text-[8px] text-slate-600">{DEF_LINE_MAX_M}m</span>
        <span className="clip-skew min-w-[52px] bg-gold/15 px-1.5 py-0.5 text-center font-tech text-[10px] font-bold tabular-nums text-gold">
          {shift ? `${shift.target_line_height_m.toFixed(0)}m` : "—"}
        </span>
      </div>

      {shift && (
        <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
          {[
            ["Δ line", `${shift.delta_m >= 0 ? "+" : ""}${shift.delta_m.toFixed(1)}m`],
            ["Through-ball exp", shift.through_ball_exposure_xt.toFixed(3)],
            ["Offside trap", `${shift.offside_trap_catch_prob_pct.toFixed(0)}%`],
            [
              "Press compress",
              `${shift.press_compression_gain_pct >= 0 ? "+" : ""}${shift.press_compression_gain_pct.toFixed(1)}%`,
            ],
          ].map(([k, v]) => (
            <div key={k} className="border border-white/10 bg-slate-950/50 px-1.5 py-1">
              <div className="font-tech text-[7px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {k}
              </div>
              <div className="font-tech text-[11px] font-bold tabular-nums text-slate-200">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
