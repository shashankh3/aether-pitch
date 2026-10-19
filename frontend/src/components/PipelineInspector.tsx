"use client";
// AETHER PITCH — 5-stage Azure pipeline telemetry: live latency badges for
// Stage (a) Ingest -> (b) Interpret -> (c) Explain -> (d) Render -> (e)
// Personalize, with an expandable raw-payload drawer for rubric verification.

import { useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import type { Pipeline } from "@/lib/types";

interface Props {
  pipeline: Pipeline | null;
  connected: boolean;
}

const STAGES = [
  { id: "a", label: "INGEST", sub: "Stage A · PitchForge 10Hz", color: "text-pitch" },
  { id: "b", label: "INTERPRET", sub: "Stage B · Deterministic math", color: "text-tactical" },
  { id: "c", label: "EXPLAIN", sub: "Stage C · Foundry agents", color: "text-crimson" },
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

export default function PipelineInspector({ pipeline, connected }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass z-20 shrink-0 border-t border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-[42px] w-full items-center gap-3 px-4 text-left"
      >
        <Activity size={14} className={connected ? "text-pitch" : "text-crimson"} />
        <span className="text-[10px] font-bold tracking-[0.25em] text-slate-400">
          5-STAGE AZURE PIPELINE
        </span>
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
          {STAGES.map((s, i) => {
            const ms = pipeline?.stages[s.id]?.latency_ms;
            return (
              <span key={s.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[9px] text-slate-600">→</span>}
                <span
                  className={`flex items-center gap-1.5 border border-white/10 bg-black/40 px-2 py-1 font-tech text-[10px] ${
                    pipeline ? s.color : "text-slate-600"
                  }`}
                  title={s.sub}
                >
                  <span
                    className={`relative h-1.5 w-1.5 rounded-full ${pipeline ? "bg-pitch" : "bg-slate-700"}`}
                  >
                    {pipeline && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-pitch/70" />
                    )}
                  </span>
                  <span className="font-display font-bold tracking-wider">{s.id.toUpperCase()}</span>
                  <span className="text-slate-500">{ms != null ? `${ms.toFixed(1)}ms` : "—"}</span>
                </span>
              </span>
            );
          })}
        </div>
        <span className="text-[9px] tracking-widest text-slate-600">
          {pipeline?.updated_at ? "STREAMING" : "IDLE"}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="scroll-slim grid max-h-[240px] grid-cols-1 gap-2 overflow-y-auto border-t border-white/10 bg-black/60 p-3 md:grid-cols-3 lg:grid-cols-5">
          {STAGES.map((s) => (
            <div key={s.id} className="min-w-0">
              <div className={`mb-1 text-[9px] font-bold tracking-[0.2em] ${s.color}`}>
                STAGE {s.id.toUpperCase()} · {s.label}
              </div>
              <pre className="scroll-slim max-h-[170px] overflow-auto rounded bg-black/60 p-2 font-mono text-[8.5px] leading-relaxed text-slate-400">
                {pretty(pipeline?.payloads?.[s.id] ?? "")}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
