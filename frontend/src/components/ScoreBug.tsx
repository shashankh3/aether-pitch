"use client";

import type { MatchTick, Metrics } from "@/lib/types";
import { NLACrest, MCSCrest } from "@/components/Crests";
import { useHud } from "@/lib/hudContext";
import { MetricLabel } from "@/components/hud/MetricLabel";

interface Props {
  tick: MatchTick | null;
  metrics: Metrics | null;
}

export default function ScoreBug({ tick, metrics }: Props) {
  const { plainLanguage } = useHud();
  const nla = tick?.score.NLA ?? 0;
  const mcs = tick?.score.MCS ?? 0;
  const chaos = metrics?.chaos_index ?? 0.5;
  const wpNla = Math.max(0.06, Math.min(0.94,
    0.5 + (nla - mcs) * 0.075 + (chaos - 0.5) * 0.06));
  const wpPct = Math.round(wpNla * 100);
  const nlaStats = metrics?.team_stats?.NLA;
  const mcsStats = metrics?.team_stats?.MCS;
  const meta = tick?.match_metadata;
  const minute = Number(tick?.clock?.split(":")[0] ?? 0);
  const phase = minute >= 90 ? "Full Time" : minute >= 45 ? "2nd Half" : "1st Half";

  return (
    <div className="clip-ea panel-lux hud-enter pointer-events-auto w-[min(322px,calc(100vw-16px))] select-none overflow-hidden">
      <div className="hud-sheen" aria-hidden />

      <div className="relative z-[3] flex items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-2 py-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="hud-status-dot text-crimson" aria-hidden />
          <span className="hud-kicker truncate !text-[7.5px] !tracking-[0.18em] !text-slate-400">
            {meta?.competition ?? "Aether Synthetic League"}
          </span>
        </span>
        <span className="shrink-0 font-tech text-[7.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          MD {String(meta?.matchday ?? 9).padStart(2, "0")} · {meta?.venue ?? "Aether Arena"}
        </span>
      </div>

      <div className="sr-only" aria-live="polite">NLA {nla}, MCS {mcs}</div>

      <div className="relative z-[3] flex items-stretch bg-black/15">
        <div className="w-[3px] shrink-0 bg-gradient-to-b from-crimson via-crimson/70 to-transparent" />
        <div className="flex flex-1 items-center justify-between gap-1.5 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="drop-shadow-[0_0_8px_rgba(255,30,86,0.45)]"><NLACrest size={23} /></span>
            <span className="font-display text-[16px] font-bold leading-none tracking-wide text-white">NLA</span>
          </div>
          <span
            key={`nla-${nla}`}
            className="number-pop font-tech text-[26px] font-bold leading-none tabular-nums text-white"
          >
            {nla}
          </span>
        </div>

        <div className="flex min-w-[78px] flex-col items-center justify-center border-x border-white/10 bg-black/40 px-2">
          <span className="mb-0.5 flex items-center gap-1 font-tech text-[7px] font-bold uppercase tracking-[0.22em] text-crimson">
            <span className="h-1 w-1 rounded-full bg-crimson hud-live-dot" />
            Live
          </span>
          <span className="font-tech text-[16px] font-bold leading-none tabular-nums text-pitch text-glow-cyan">
            {tick?.clock ?? "--:--"}
          </span>
          <span className="mt-0.5 font-display text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {phase}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-between gap-1.5 px-2 py-1.5">
          <span
            key={`mcs-${mcs}`}
            className="number-pop font-tech text-[26px] font-bold leading-none tabular-nums text-white"
          >
            {mcs}
          </span>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-display text-[16px] font-bold leading-none tracking-wide text-white">MCS</span>
            <span className="drop-shadow-[0_0_8px_rgba(0,240,255,0.45)]"><MCSCrest size={23} /></span>
          </div>
        </div>
        <div className="w-[3px] shrink-0 bg-gradient-to-b from-tactical via-tactical/70 to-transparent" />
      </div>

      <div className="relative z-[3] grid grid-cols-3 border-y border-white/10 bg-slate-950/55">
        {[
          ["POSS", `${nlaStats?.possession_pct?.toFixed(0) ?? "—"} / ${mcsStats?.possession_pct?.toFixed(0) ?? "—"}%`],
          ["PASS", `${nlaStats?.pass_accuracy?.toFixed(0) ?? "—"} / ${mcsStats?.pass_accuracy?.toFixed(0) ?? "—"}%`],
          ["SHOTS", `${nlaStats?.shots ?? "—"} / ${mcsStats?.shots ?? "—"}`],
        ].map(([label, value], index) => (
          <div key={label} className={`px-1.5 py-1 text-center ${index > 0 ? "border-l border-white/10" : ""}`}>
            <div className="font-tech text-[7.5px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-0.5 font-tech text-[10.5px] font-bold tabular-nums text-slate-200">{value}</div>
          </div>
        ))}
      </div>

      <div className="relative z-[3] bg-slate-950/50 px-2 py-1.5">
        <div className="mb-1 flex items-center justify-between font-tech text-[8.5px] font-bold uppercase tracking-[0.16em]">
          <span className="text-crimson">NLA {wpPct}%</span>
          <span className="hud-label !text-[7.5px] !tracking-[0.2em] !text-slate-500">
            <MetricLabel label="WIN PROBABILITY" plain={plainLanguage} />
          </span>
          <span className="text-tactical">{100 - wpPct}% MCS</span>
        </div>
        <div className="relative flex h-[8px] overflow-hidden border border-white/10 bg-black/50">
          <div
            className="h-full bg-gradient-to-r from-crimson via-[#ff4d79] to-[#ff7b9c] transition-all duration-700"
            style={{ width: `${wpNla * 100}%` }}
          />
          <div className="h-full flex-1 bg-gradient-to-r from-[#0b5f80] via-[#0b9fbd] to-tactical transition-all duration-700" />
          <span className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_9px,rgba(0,0,0,0.55)_9px_10px)]" aria-hidden />
          <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/60 shadow-[0_0_6px_rgba(255,255,255,0.6)]" aria-hidden />
        </div>
        {tick && (
          <div className="mt-1 flex items-center justify-between font-tech text-[8px] uppercase tracking-[0.16em] text-slate-500">
            <span>
              Possession{" "}
              <span className={tick.possession === "NLA" ? "text-crimson" : "text-tactical"}>{tick.possession}</span>
            </span>
            <span className="tabular-nums">{tick.players.length} tracked · 10 Hz</span>
          </div>
        )}
      </div>
    </div>
  );
}
