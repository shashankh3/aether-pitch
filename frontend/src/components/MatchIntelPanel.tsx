"use client";
// AETHER PITCH - live match intelligence under the scorebug.
// Turns the Stage B rolling stats into judge-readable proof: possession,
// passing, shot quality, defensive work and the two distance leaders.

import { Activity, Gauge, Route, ShieldCheck } from "lucide-react";
import type { MatchTick, Metrics, TeamStats } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  tick: MatchTick | null;
  metrics: Metrics | null;
}

function pct(value?: number) {
  return value != null ? `${value.toFixed(0)}%` : "-";
}

function compareRow(
  label: string,
  nla: string,
  mcs: string,
  nlaWins: boolean,
  mcsWins: boolean,
) {
  return (
    <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 border-t border-white/5 py-0.5">
      <span className={cn("font-tech text-[10px] font-bold", nlaWins ? "text-crimson" : "text-slate-400")}>{nla}</span>
      <span className="font-display text-[7px] font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</span>
      <span className={cn("text-right font-tech text-[10px] font-bold", mcsWins ? "text-tactical" : "text-slate-400")}>{mcs}</span>
    </div>
  );
}

export default function MatchIntelPanel({ tick, metrics }: Props) {
  const stats = metrics?.team_stats;
  const nla: TeamStats | undefined = stats?.NLA;
  const mcs: TeamStats | undefined = stats?.MCS;
  const meta = tick?.match_metadata;
  const fastest = metrics?.leaders?.fastest;
  const farthest = metrics?.leaders?.farthest;

  return (
    <section className="clip-ea panel-lux pointer-events-auto w-[318px] p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
          <Activity size={12} className="text-tactical" /> Match Intelligence
        </h3>
        <span className="clip-skew bg-pitch/12 px-1.5 py-0.5 font-tech text-[7.5px] font-bold uppercase tracking-wider text-pitch">
          {meta?.synthetic === false ? "LIVE DATA" : "100% SYNTHETIC"}
        </span>
      </div>

      {!nla || !mcs ? (
        <div className="py-3 text-center font-tech text-[10px] uppercase tracking-widest text-slate-600">
          Awaiting first Stage B window...
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between font-tech text-[9px] font-bold uppercase tracking-wider">
            <span className="text-crimson">NLA {pct(nla.possession_pct)}</span>
            <span className="text-slate-600">Possession</span>
            <span className="text-tactical">{pct(mcs.possession_pct)} MCS</span>
          </div>
          <div className="mb-1 flex h-[6px] overflow-hidden bg-white/5">
            <div className="h-full bg-gradient-to-r from-crimson to-[#FF5C86]" style={{ width: `${nla.possession_pct ?? 0}%` }} />
            <div className="h-full flex-1 bg-gradient-to-r from-sky-700 to-tactical" />
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <div>
              {compareRow(
                "Pass acc",
                pct(nla.pass_accuracy),
                pct(mcs.pass_accuracy),
                (nla.pass_accuracy ?? 0) >= (mcs.pass_accuracy ?? 0),
                (mcs.pass_accuracy ?? 0) > (nla.pass_accuracy ?? 0),
              )}
              {compareRow(
                "Shots",
                `${nla.shots ?? 0}/${nla.shots_on_target ?? 0}`,
                `${mcs.shots ?? 0}/${mcs.shots_on_target ?? 0}`,
                (nla.shots ?? 0) > (mcs.shots ?? 0),
                (mcs.shots ?? 0) > (nla.shots ?? 0),
              )}
              {compareRow(
                "Tackles",
                String(nla.tackles ?? 0),
                String(mcs.tackles ?? 0),
                (nla.tackles ?? 0) > (mcs.tackles ?? 0),
                (mcs.tackles ?? 0) > (nla.tackles ?? 0),
              )}
            </div>
            <div>
              {compareRow(
                "Distance",
                `${(nla.distance_km ?? 0).toFixed(1)}km`,
                `${(mcs.distance_km ?? 0).toFixed(1)}km`,
                (nla.distance_km ?? 0) > (mcs.distance_km ?? 0),
                (mcs.distance_km ?? 0) > (nla.distance_km ?? 0),
              )}
              {compareRow(
                "Sprints",
                `${(nla.sprint_distance_km ?? 0).toFixed(1)}km`,
                `${(mcs.sprint_distance_km ?? 0).toFixed(1)}km`,
                (nla.sprint_distance_km ?? 0) > (mcs.sprint_distance_km ?? 0),
                (mcs.sprint_distance_km ?? 0) > (nla.sprint_distance_km ?? 0),
              )}
              {compareRow(
                "Turnovers",
                String(nla.turnovers_won ?? 0),
                String(mcs.turnovers_won ?? 0),
                (nla.turnovers_won ?? 0) > (mcs.turnovers_won ?? 0),
                (mcs.turnovers_won ?? 0) > (nla.turnovers_won ?? 0),
              )}
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-white/5 pt-1.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-display text-[7px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                <Gauge size={9} className="text-crimson" /> Fastest
              </div>
              <div className="truncate font-tech text-[9px] font-bold text-slate-300">
                {fastest?.player_name ?? "-"}
                <span className="ml-1 text-crimson">{fastest?.top_speed_kmh?.toFixed(1) ?? "-"}</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-display text-[7px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                <Route size={9} className="text-tactical" /> Farthest
              </div>
              <div className="truncate font-tech text-[9px] font-bold text-slate-300">
                {farthest?.player_name ?? "-"}
                <span className="ml-1 text-tactical">{farthest?.distance_km?.toFixed(2) ?? "-"}km</span>
              </div>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1 font-tech text-[8px] uppercase tracking-[0.12em] text-slate-600">
            <ShieldCheck size={9} className="text-pitch" />
            Stage B rolling stats - shots shown on target
          </div>
        </>
      )}
    </section>
  );
}
