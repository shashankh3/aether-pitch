"use client";
// AETHER PITCH — five-stage proof strip, shown inside the Control Center's
// Data tab directly above the full payload inspector. v6.2 adds the cloud
// resilience badge that surfaces an active edge-failover drill.

import { Activity, ChevronRight, GitBranch, CloudOff, ShieldCheck } from "lucide-react";
import type { EngineStatus, Pipeline } from "@/lib/types";
import type { FailoverDrillState } from "@/hooks/useResilientMatchEngine";
import { STANDARD_PALETTE, type BroadcastPalette } from "@/lib/hudContext";
import { PIPELINE_STAGES } from "@/components/PipelineInspector";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: Pipeline | null;
  connected: boolean;
  status: EngineStatus;
  drill?: FailoverDrillState | null;
  palette?: BroadcastPalette;
}

export default function PipelineRibbon({
  pipeline, connected, status, drill, palette = STANDARD_PALETTE,
}: Props) {
  const live = status === "CONNECTED_PIPELINE_LIVE";
  const trace = pipeline?.agent_trace;
  const grounded = trace ? trace.grounding.status !== "review" : false;
  const drillPhase = drill?.phase ?? "idle";
  const drillActive = drillPhase === "outage" || drillPhase === "reconciling";
  const drillVerified = drillPhase === "verified";

  return (
    <div
      className={cn(
        "clip-ea flex w-full items-center gap-1 overflow-hidden border px-2 py-1 backdrop-blur-xl",
        "border-white/10 bg-slate-950/78",
      )}
    >
      <span className="flex shrink-0 items-center gap-1">
        <Activity size={11} style={{ color: connected ? palette.positive : palette.warning }} />
        <span className="font-display text-[8.5px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Live pipeline
        </span>
        <span
          className={cn(
            "clip-skew px-1 py-0.5 font-tech text-[7.5px] font-bold uppercase tracking-wider",
            !live && "animate-breathe",
          )}
          style={{
            background: live ? `${palette.positive}22` : `${palette.warning}22`,
            color: live ? palette.positive : palette.warning,
          }}
        >
          {live ? "LIVE" : "EDGE"}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {PIPELINE_STAGES.map((s, i) => {
          const ms = pipeline?.stages[s.id]?.latency_ms;
          const p95 = pipeline?.latency_p95?.[s.id];
          const seen = pipeline?.payloads?.[s.id];
          return (
            <span key={s.id} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && <ChevronRight size={8} className="shrink-0 text-slate-700" />}
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1 border border-white/10 bg-black/35 px-1.5 py-0.5",
                  seen ? s.color : "text-slate-600",
                )}
                title={`${s.sub}${ms != null ? ` · now ${ms.toFixed(2)}ms` : ""}${p95 != null ? ` · p95 ${p95.toFixed(2)}ms` : ""}`}
              >
                <span className={cn("h-1 w-1 shrink-0 rounded-full", seen ? "animate-breathe bg-pitch" : "bg-slate-700")} />
                <span className="font-display text-[8.5px] font-bold tracking-wider">{s.id.toUpperCase()}</span>
                <span className="hidden font-tech text-[8.5px] font-semibold text-slate-500 sm:inline">
                  {s.label}
                </span>
                <span className="font-tech text-[8.5px] font-bold text-slate-400">
                  {ms != null ? `${ms < 10 ? ms.toFixed(1) : ms.toFixed(0)}ms` : "—"}
                </span>
              </span>
            </span>
          );
        })}
      </span>

      <span
        className={cn(
          "hidden shrink-0 items-center gap-1 font-tech text-[8px] font-bold uppercase tracking-[0.12em] xl:flex",
          grounded ? "text-pitch" : "text-crimson",
        )}
        title={trace ? `${trace.trace_id} · ${trace.grounding.note}` : "Trace appears on the first gated insight"}
      >
        <GitBranch size={9} />
        {trace ? `${trace.handoff_chain.length}/4 · ${grounded ? "GROUNDED" : "CHECK"}` : "NO TRACE"}
      </span>

      <span
        className={cn(
          "flex shrink-0 items-center gap-1 clip-skew px-1 py-0.5 font-tech text-[7.5px] font-bold uppercase tracking-wider",
          drillActive
            ? "animate-breathe bg-amber-400/20 text-amber-300"
            : drillVerified
            ? "bg-emerald-400/20 text-emerald-300"
            : "bg-white/[0.06] text-slate-500",
        )}
        title={
          drillActive
            ? "Cloud outage drill running — the 10Hz EdgeEngine is carrying the live feed"
            : drillVerified
            ? `Failover drill verified · hot-swap ${(drill?.swapLatencyMs ?? 0).toFixed(1)}ms · ${drill?.reconciledTicks ?? 0} frames reconciled · 0 dropped`
            : "Cloud resilience armed — run the failover drill from the Data tab"
        }
      >
        {drillActive ? <CloudOff size={9} /> : <ShieldCheck size={9} />}
        {drillActive ? "EDGE DRILL" : drillVerified ? "DRILL OK" : "RESILIENT"}
      </span>
    </div>
  );
}
