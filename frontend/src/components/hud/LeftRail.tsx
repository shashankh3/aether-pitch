"use client";
// AETHER PITCH v6.1 — Left rail is deliberately quiet: the scorebug and one
// obvious route into deeper match stats. CV auto-eventing and production
// tooling live in the Control Center.

import { BarChart3 } from "lucide-react";
import ScoreBug from "@/components/ScoreBug";
import type { MatchTick, Metrics } from "@/lib/types";
import { useHud } from "@/lib/hudContext";

interface Props {
  tick: MatchTick | null;
  metrics: Metrics | null;
}

export default function LeftRail({ tick, metrics }: Props) {
  const { openControlCenter } = useHud();

  return (
    <div className="flex flex-col items-start gap-1.5">
      <ScoreBug tick={tick} metrics={metrics} />
      <button
        onClick={() => openControlCenter("stats")}
        className="clip-skew flex items-center gap-1.5 border border-white/10 bg-slate-950/75 px-2.5 py-1.5 font-tech text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300 transition hover:border-tactical/40 hover:text-white"
        title="Open Match Intelligence: possession, xT, pressing, player stats"
      >
        <BarChart3 size={12} className="text-tactical" />
        Match stats
      </button>
    </div>
  );
}
