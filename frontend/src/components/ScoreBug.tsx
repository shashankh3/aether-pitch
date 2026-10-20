"use client";
// AETHER PITCH v2.0 — top-left Premier League dynamic scorebug:
// crests, live score, match clock, possession indicator and a
// win-probability / momentum bar.

import type { MatchTick, Metrics } from "@/lib/types";
import { NLACrest, MCSCrest } from "@/components/Crests";

interface Props {
  tick: MatchTick | null;
  metrics: Metrics | null;
}

export default function ScoreBug({ tick, metrics }: Props) {
  const nla = tick?.score.NLA ?? 0;
  const mcs = tick?.score.MCS ?? 0;
  const chaos = metrics?.chaos_index ?? 0.5;
  // deterministic presentational win-probability model
  const wpNla = Math.max(0.06, Math.min(0.94,
    0.5 + (nla - mcs) * 0.075 + (chaos - 0.5) * 0.06));
  const wpPct = Math.round(wpNla * 100);

  return (
    <div className="clip-ea panel-lux hud-enter pointer-events-auto w-[286px] select-none overflow-hidden">
      <div className="hairline absolute inset-x-0 top-0 h-px opacity-70" />
      <div className="flex items-stretch border border-white/15 bg-slate-950/70 backdrop-blur-xl">
        <div className="w-[5px] stripes-crimson" />
        <div className="flex flex-1 items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <NLACrest size={22} />
            <span className="font-display text-[17px] font-bold leading-none text-white">NLA</span>
          </div>
          <span className="font-tech text-[24px] font-bold leading-none text-white">{nla}</span>
        </div>
        <div className="flex flex-col items-center justify-center border-x border-white/10 bg-black/50 px-2">
          <span className="mb-0.5 flex items-center gap-1 font-display text-[7px] font-semibold uppercase tracking-[0.2em] text-crimson">
            <span className="h-1 w-1 rounded-full bg-crimson hud-live-dot" />
            Live
          </span>
          <span className="font-tech text-[15px] font-bold leading-none text-pitch">{tick?.clock ?? "--:--"}</span>
          <span className="font-display text-[8.5px] font-semibold uppercase tracking-[0.2em] text-slate-500">2nd Half</span>
        </div>
        <div className="flex flex-1 items-center justify-between px-2 py-1.5">
          <span className="font-tech text-[24px] font-bold leading-none text-white">{mcs}</span>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[17px] font-bold leading-none text-white">MCS</span>
            <MCSCrest size={22} />
          </div>
        </div>
        <div className="w-[5px] bg-gradient-to-b from-tactical to-sky-700" />
      </div>
      {/* win probability / momentum bar */}
      <div className="border-x border-b border-white/15 bg-slate-950/70 px-2 py-1.5 backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-between font-tech text-[9px] font-bold uppercase tracking-[0.18em]">
          <span className="text-crimson">NLA {wpPct}%</span>
          <span className="text-slate-500">Win Probability</span>
          <span className="text-tactical">{100 - wpPct}% MCS</span>
        </div>
        <div className="flex h-[7px] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-crimson to-[#FF5C86] transition-all duration-700"
            style={{ width: `${wpNla * 100}%` }} />
          <div className="h-full flex-1 bg-gradient-to-r from-sky-700 to-tactical transition-all duration-700" />
        </div>
        {tick && (
          <div className="mt-1 flex items-center justify-between font-tech text-[8.5px] uppercase tracking-[0.16em] text-slate-500">
            <span>Possession: <span className={tick.possession === "NLA" ? "text-crimson" : "text-tactical"}>{tick.possession}</span></span>
            <span>{tick.players.length} players tracked</span>
          </div>
        )}
      </div>
    </div>
  );
}
