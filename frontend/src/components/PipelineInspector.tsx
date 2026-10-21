"use client";
// AETHER PITCH — 5-stage pipeline telemetry. In the unified bottom dock
// it collapses to a one-line status chip (🟢 Pipeline live / ⚡ Edge autonomous +
// the five stage latencies); the chip expands upward into a payload popover
// for rubric verification.

import { Activity } from "lucide-react";
import type { EngineStatus, Pipeline } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PIPELINE_STAGES = [
  { id: "a", label: "INGEST", sub: "Stage A · PitchForge 10Hz", color: "text-pitch" },
  { id: "b", label: "INTERPRET", sub: "Stage B · Deterministic math", color: "text-tactical" },
  { id: "c", label: "EXPLAIN", sub: "Stage C · Foundry triage + narrative", color: "text-crimson" },
  { id: "d", label: "RENDER", sub: "Stage D · Overlay packets", color: "text-amber-300" },
  { id: "e", label: "PERSONALIZE", sub: "Stage E · Dual persona i18n", color: "text-violet-400" },
] as const;

function pretty(raw: string): string {
  if (!raw) return "(no payload yet)";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

interface ChipProps {
  pipeline: Pipeline | null;
  connected: boolean;
  status: EngineStatus;
  open: boolean;
  onToggle: () => void;
}

export function PipelineChip({ pipeline, connected, status, open, onToggle }: ChipProps) {
  const live = status === "CONNECTED_PIPELINE_LIVE";
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "clip-skew flex shrink-0 items-center gap-1.5 px-2 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider transition",
        open ? "bg-tactical/20 text-tactical" : "bg-white/[0.03] text-slate-400 hover:text-white",
      )}
      title="5-stage live pipeline: latencies + raw payloads"
    >
      <Activity size={13} className={connected ? "text-pitch" : "text-gold"} />
      <span className="hidden 2xl:inline">Pipeline</span>
      <span
        className={cn(
          "clip-skew px-1 py-0.5 font-tech text-[8.5px] uppercase",
          live ? "bg-pitch/20 text-pitch" : "animate-breathe bg-gold/20 text-gold",
        )}
      >
        {live ? "🟢 PIPELINE" : "⚡ EDGE"}
      </span>
      {/* stage latency micro-strip (hidden below 2xl — full strip in the popover) */}
      <span className="hidden items-center gap-1 2xl:flex">
        {PIPELINE_STAGES.map((s) => {
          const ms = pipeline?.stages[s.id]?.latency_ms;
          return (
            <span
              key={s.id}
              className={cn("border border-white/10 bg-black/40 px-1 py-0.5 text-[9px]", pipeline ? s.color : "text-slate-600")}
              title={s.sub}
            >
              {s.id.toUpperCase()}
              <span className="ml-0.5 text-slate-500">{ms != null ? `${ms.toFixed(0)}` : "—"}</span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

export function PipelinePanel({ pipeline }: { pipeline: Pipeline | null }) {
  return (
    <div className="clip-ea panel-lux p-2.5">
      <div className="mb-2 flex items-center gap-1.5 border-b border-white/10 pb-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
          5-Stage Live Pipeline
        </span>
        <span className="font-tech text-[9px] uppercase tracking-widest text-slate-600">
          {pipeline?.updated_at ? "STREAMING" : "IDLE"}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PIPELINE_STAGES.map((s, i) => {
          const ms = pipeline?.stages[s.id]?.latency_ms;
          return (
            <span key={s.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[9px] text-slate-600">→</span>}
              <span
                className={cn(
                  "flex items-center gap-1.5 border border-white/10 bg-black/40 px-2 py-1 font-tech text-[10px]",
                  pipeline ? s.color : "text-slate-600",
                )}
                title={s.sub}
              >
                <span className={cn("relative h-1.5 w-1.5 rounded-full", pipeline ? "bg-pitch" : "bg-slate-700")}>
                  {pipeline && <span className="absolute inset-0 animate-ping rounded-full bg-pitch/70" />}
                </span>
                <span className="font-display font-bold tracking-wider">{s.id.toUpperCase()}</span>
                <span className="text-slate-500">{ms != null ? `${ms.toFixed(1)}ms` : "—"}</span>
              </span>
            </span>
          );
        })}
      </div>
      <div className="scroll-slim grid max-h-[240px] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE_STAGES.map((s) => (
          <div key={s.id} className="min-w-0">
            <div className={cn("mb-1 text-[9px] font-bold tracking-[0.2em]", s.color)}>
              STAGE {s.id.toUpperCase()} · {s.label}
            </div>
            <pre className="scroll-slim max-h-[170px] overflow-auto rounded bg-black/60 p-2 font-mono text-[8.5px] leading-relaxed text-slate-400">
              {pretty(pipeline?.payloads?.[s.id] ?? "")}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
