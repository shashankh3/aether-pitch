"use client";
// AETHER PITCH — always-visible five-stage proof strip.
// The bottom-dock chip is easy to miss on a projector; this ribbon keeps
// Stage A→E names, live latencies and health in the judge's eyeline.

import { Activity, ChevronRight } from "lucide-react";
import type { EngineStatus, Pipeline } from "@/lib/types";
import { useHud } from "@/lib/hudContext";
import { PIPELINE_STAGES } from "@/components/PipelineInspector";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: Pipeline | null;
  connected: boolean;
  status: EngineStatus;
}

export default function PipelineRibbon({ pipeline, connected, status }: Props) {
  const { pipelinePanelOpen, setPipelinePanelOpen } = useHud();
  const live = status === "CONNECTED_PIPELINE_LIVE";

  return (
    <button
      type="button"
      data-dock-trigger
      onClick={() => setPipelinePanelOpen((o) => !o)}
      aria-expanded={pipelinePanelOpen}
      title="Open the full five-stage payload inspector"
      className={cn(
        "clip-ea pointer-events-auto flex w-full items-center gap-1 overflow-hidden border px-2 py-1 backdrop-blur-xl transition",
        "border-white/10 bg-slate-950/78 hover:border-tactical/35 hover:bg-slate-950/92",
      )}
    >
      <span className="flex shrink-0 items-center gap-1">
        <Activity size={11} className={connected ? "text-pitch" : "text-gold"} />
        <span className="font-display text-[8.5px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Live pipeline
        </span>
        <span className={cn(
          "clip-skew px-1 py-0.5 font-tech text-[7.5px] font-bold uppercase tracking-wider",
          live ? "bg-pitch/15 text-pitch" : "animate-breathe bg-gold/15 text-gold",
        )}>
          {live ? "LIVE" : "EDGE"}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {PIPELINE_STAGES.map((s, i) => {
          const ms = pipeline?.stages[s.id]?.latency_ms;
          const seen = pipeline?.payloads?.[s.id];
          return (
            <span key={s.id} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && <ChevronRight size={8} className="shrink-0 text-slate-700" />}
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1 border border-white/10 bg-black/35 px-1.5 py-0.5",
                  seen ? s.color : "text-slate-600",
                )}
                title={`${s.sub}${ms != null ? ` · ${ms.toFixed(2)}ms` : ""}`}
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

      <span className="hidden shrink-0 font-tech text-[8px] font-bold uppercase tracking-[0.16em] text-slate-600 xl:inline">
        Click for payloads
      </span>
    </button>
  );
}
