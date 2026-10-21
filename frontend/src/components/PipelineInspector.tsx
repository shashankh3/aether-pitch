"use client";
// AETHER PITCH — grounded pipeline telemetry. The Data tab shows the real
// Stage B -> C -> D/E handoff trace, the deterministic gate economy, numeric
// grounding checks, and the five raw stage payloads.

import { Fragment } from "react";
import { Activity, AlertTriangle, ChevronRight, GitBranch, ShieldCheck } from "lucide-react";
import type { AgentTrace, AgentTraceSpan, EngineStatus, Pipeline } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PIPELINE_STAGES = [
  { id: "a", label: "INGEST", sub: "Stage A · PitchForge 10Hz", color: "text-pitch" },
  { id: "b", label: "INTERPRET", sub: "Stage B · Deterministic math", color: "text-tactical" },
  { id: "c", label: "EXPLAIN", sub: "Stage C · Foundry triage + narrative", color: "text-crimson" },
  { id: "d", label: "RENDER", sub: "Stage D · Overlay packets", color: "text-amber-300" },
  { id: "e", label: "PERSONALIZE", sub: "Stage E · Dual persona i18n", color: "text-violet-400" },
] as const;

const TRACE_LABELS: Record<AgentTraceSpan["id"], string> = {
  sentinel: "SENTINEL",
  triage: "TRIAGE",
  analyst: "ANALYST",
  director: "DIRECTOR",
};

function pretty(raw: string): string {
  if (!raw) return "(no payload yet)";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${ms.toFixed(0)}ms`;
}

function traceTone(span: AgentTraceSpan): string {
  if (span.status === "review") return "border-crimson/50 bg-crimson/10 text-crimson";
  if (span.status === "fallback") return "border-gold/45 bg-gold/10 text-gold";
  return "border-pitch/40 bg-pitch/10 text-pitch";
}

function groundingTone(trace: AgentTrace): string {
  if (trace.grounding.status === "review") return "text-crimson";
  if (trace.grounding.status === "fallback_verified") return "text-gold";
  return "text-pitch";
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
  const trace = pipeline?.agent_trace;
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "clip-skew flex shrink-0 items-center gap-1.5 px-2 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider transition",
        open ? "bg-tactical/20 text-tactical" : "bg-white/[0.03] text-slate-400 hover:text-white",
      )}
      title="Grounded 4-node agent handoff, stage latencies, and raw payloads"
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
      {trace && (
        <span
          className={cn(
            "hidden px-1 py-0.5 font-tech text-[8px] uppercase xl:inline",
            trace.grounding.status === "review" ? "bg-crimson/15 text-crimson" : "bg-pitch/15 text-pitch",
          )}
          title={`${trace.grounding.note} · trace ${trace.trace_id}`}
        >
          {trace.grounding.status === "review" ? "CHECK" : "GROUNDED"} · {trace.handoff_chain.length}/4
        </span>
      )}
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

function AgentDag({ trace }: { trace: AgentTrace }) {
  return (
    <div className="flex items-stretch gap-0.5">
      {trace.handoff_chain.map((span, i) => (
        <Fragment key={span.id}>
          <div
            className={cn("min-w-0 flex-1 border px-1.5 py-1.5", traceTone(span))}
            title={`${span.agent} · ${span.role} · ${span.detail}`}
          >
            <div className="flex items-center gap-1">
              <span className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                span.status === "review" ? "bg-crimson" : span.status === "fallback" ? "bg-gold" : "bg-pitch",
              )} />
              <span className="truncate font-display text-[8px] font-bold tracking-[0.12em]">
                {TRACE_LABELS[span.id]}
              </span>
            </div>
            <div className="mt-0.5 truncate font-tech text-[7.5px] uppercase tracking-wider text-slate-500">
              {trace.mode === "edge" ? "local" : formatMs(span.latency_ms)}
            </div>
            <div className="mt-0.5 line-clamp-1 font-tech text-[7.5px] text-slate-400">
              {span.summary}
            </div>
          </div>
          {i < trace.handoff_chain.length - 1 && (
            <ChevronRight size={9} className="shrink-0 self-center text-slate-600" />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function TraceCard({ trace }: { trace: AgentTrace }) {
  const compute = trace.compute;
  const grounded = trace.grounding.status !== "review";
  return (
    <div className="border border-white/10 bg-black/25 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-tech text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          <GitBranch size={11} className="text-tactical" />
          Agent handoff
        </span>
        <span className="flex items-center gap-1">
          <span className={cn(
            "px-1 py-0.5 font-tech text-[7.5px] font-bold uppercase tracking-wider",
            trace.mode === "azure" ? "bg-tactical/15 text-tactical" : trace.mode === "edge" ? "bg-gold/15 text-gold" : "bg-white/10 text-slate-300",
          )}>
            {trace.mode === "azure" ? "AZURE" : trace.mode === "edge" ? "EDGE" : "LOCAL"}
          </span>
          <span className="font-mono text-[7.5px] text-slate-600">{trace.trace_id}</span>
        </span>
      </div>

      <AgentDag trace={trace} />

      <div className="mt-1 flex items-center justify-between gap-2 font-tech text-[7.5px] uppercase tracking-wider text-slate-500">
        <span className="truncate">
          {trace.archetype.replace(/_/g, " ")} · {trace.anchor_clock}
        </span>
        <span className="shrink-0">{trace.languages.length} languages</span>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <div className="border border-white/10 bg-slate-950/55 p-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {grounded ? <ShieldCheck size={9} className="text-pitch" /> : <AlertTriangle size={9} className="text-crimson" />}
              Grounding
            </span>
            <span className={cn("font-display text-[12px] font-bold", groundingTone(trace))}>
              {Math.round(trace.grounding.score * 100)}%
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden bg-white/10">
            <div
              className={cn("h-full", grounded ? "bg-gradient-to-r from-pitch to-tactical" : "bg-crimson")}
              style={{ width: `${Math.round(trace.grounding.score * 100)}%` }}
            />
          </div>
          <p className="mt-1 line-clamp-2 font-tech text-[7.5px] leading-relaxed text-slate-500">
            {trace.grounding.checked_numbers > 0
              ? `${trace.grounding.checked_numbers} numeric claims · ${trace.grounding.unmatched_numbers.length} unmatched`
              : "Deterministic template · no free-form numeric claims"}
          </p>
        </div>

        <div className="border border-white/10 bg-slate-950/55 p-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Gate economy
            </span>
            <span className="font-display text-[12px] font-bold text-tactical">
              {Math.round(compute.filter_ratio * 100)}%
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-gold to-tactical"
              style={{ width: `${Math.round(compute.filter_ratio * 100)}%` }}
            />
          </div>
          <p className="mt-1 line-clamp-2 font-tech text-[7.5px] leading-relaxed text-slate-500">
            {compute.gated_events}/{compute.considered_events} events gated · {compute.ticks_per_insight || "—"} ticks/insight
          </p>
        </div>
      </div>

      <p className="mt-1 line-clamp-1 font-tech text-[7.5px] leading-relaxed text-slate-500" title={trace.grounding.note}>
        {trace.gate.reasons.length ? `Gate: ${trace.gate.reasons.join(" · ")}` : "Gate: deterministic threshold"}
      </p>
      {trace.guardrail?.triggered && (
        <p className="mt-1 flex items-center gap-1 line-clamp-1 font-tech text-[7.5px] font-bold uppercase tracking-wider text-gold">
          <AlertTriangle size={8} />
          Guardrail: Azure narrative replaced · {trace.guardrail.unmatched_numbers.length} unmatched
        </p>
      )}
    </div>
  );
}

export function PipelinePanel({ pipeline }: { pipeline: Pipeline | null }) {
  const trace = pipeline?.agent_trace ?? null;
  return (
    <div className="clip-ea panel-lux p-2.5">
      <div className="mb-2 flex items-center gap-1.5 border-b border-white/10 pb-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
          Grounded Pipeline
        </span>
        <span className="font-tech text-[9px] uppercase tracking-widest text-slate-600">
          {pipeline?.updated_at ? "STREAMING" : "IDLE"}
        </span>
      </div>

      {trace ? (
        <TraceCard trace={trace} />
      ) : (
        <div className="mb-2 border border-dashed border-white/15 bg-black/20 px-2 py-2 font-tech text-[8.5px] leading-relaxed text-slate-500">
          Waiting for the first gated insight. The trace records the real gate decision,
          Stage C route, grounding check, and D/E handoff.
        </div>
      )}

      <div className="mt-2 mb-1.5 flex items-center gap-1.5 border-b border-white/10 pb-1.5">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          5-Stage Payloads
        </span>
        <span className="font-tech text-[8.5px] uppercase tracking-widest text-slate-600">
          A → E
        </span>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {PIPELINE_STAGES.map((s, i) => {
          const ms = pipeline?.stages[s.id]?.latency_ms;
          const p95 = pipeline?.latency_p95?.[s.id];
          return (
            <span key={s.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[9px] text-slate-600">→</span>}
              <span
                className={cn(
                  "flex items-center gap-1.5 border border-white/10 bg-black/40 px-2 py-1 font-tech text-[10px]",
                  pipeline ? s.color : "text-slate-600",
                )}
                title={`${s.sub}${p95 != null ? ` · p95 ${formatMs(p95)}` : ""}`}
              >
                <span className={cn("relative h-1.5 w-1.5 rounded-full", pipeline ? "bg-pitch" : "bg-slate-700")}>
                  {pipeline && <span className="absolute inset-0 animate-ping rounded-full bg-pitch/70" />}
                </span>
                <span className="font-display font-bold tracking-wider">{s.id.toUpperCase()}</span>
                <span className="text-slate-500">{ms != null ? formatMs(ms) : "—"}</span>
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
