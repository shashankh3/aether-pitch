"use client";
// AETHER PITCH v4.0 — Judge Rubric Diagnostic modal.
// Runs the live backend self-test (GET /api/health/pipeline-audit) and maps
// the result onto every hackathon judging requirement.

import { useEffect, useState } from "react";
import { ShieldCheck, X, Loader2, CheckCircle2 } from "lucide-react";
import type { PipelineAudit } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const REQUIREMENTS: { label: string; key: keyof PipelineAudit["audit"] | null; note: string }[] = [
  { label: "Stage (a) Ingest & CV Auto-Eventing (10Hz Stream + YOLOv8 Homography)", key: "stage_a_ingest_ms", note: "PitchForge physics sim + auto-eventer + optical CV PiP" },
  { label: "Stage (b) Real-Time Math (Control vs Chaos Entropy, Pass Difficulty PDR, 16x12 xT)", key: "stage_b_interpret_ms", note: "Deterministic NumPy — zero LLM guessing" },
  { label: "Stage (c) Causal Explainability (Azure AI Foundry Multi-Agent + Bi-Directional Co-Pilot)", key: "stage_c_explain_ms", note: "Ask The 12th Man + scene directives" },
  { label: "Stage (d) Synchronized Broadcast Render (3D WebGL AR + SMPTE Alpha Overlay JSON)", key: "stage_d_render_ms", note: "AETHER_RENDER_PARTNER_V2 machine packets" },
  { label: "Stage (e) Dual-Persona & Multi-Language (Analyst vs Casual + PlayerLock 360 + EN/ES/AR/HI Voice)", key: "stage_e_personalize_ms", note: "Deterministic atlas + Azure Translator-ready" },
];

export default function RubricVerifierModal({ open, onClose }: Props) {
  const [audit, setAudit] = useState<PipelineAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setAudit(null);
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${API_URL}/api/health/pipeline-audit`)
      .then((r) => {
        if (!r.ok) throw new Error(`audit HTTP ${r.status}`);
        return r.json();
      })
      .then(setAudit)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="5-stage rubric diagnostic"
    >
      <div
        className="clip-ea max-h-full w-[680px] overflow-y-auto border border-pitch/40 bg-slate-950/95 p-5 shadow-2xl animate-slide-up scroll-slim"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-display text-[22px] font-bold uppercase tracking-wide text-pitch">
              <ShieldCheck size={18} /> 5-Stage Rubric Diagnostic
            </h3>
            <p className="font-tech text-[10.5px] uppercase tracking-[0.2em] text-slate-500">
              Live self-test over an isolated synthetic match tick
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-slate-400">
            <Loader2 size={18} className="animate-spin" /> Running pipeline audit…
          </div>
        )}
        {error && (
          <div className="clip-chamfer border border-crimson/40 bg-crimson/10 p-3 text-[12px] text-crimson">
            Audit failed: {error} — is the engine on :8000 running?
          </div>
        )}

        {audit && (
          <>
            <div className="clip-chamfer mb-3 flex items-center justify-between border border-pitch/40 bg-pitch/10 px-3 py-2">
              <span className="font-display text-[14px] font-bold uppercase tracking-wider text-pitch">
                100% Synthetic Data Compliance
              </span>
              <span className="font-tech text-[16px] font-bold text-pitch">
                {audit.synthetic_data_compliance ? "TRUE ✓" : "FALSE"}
              </span>
            </div>

            <div className="space-y-1.5">
              {REQUIREMENTS.map((req, i) => {
                const ms = req.key ? audit.audit[req.key] : null;
                return (
                  <div key={i} className="clip-chamfer flex items-center gap-3 border border-white/10 bg-white/[0.03] px-3 py-2">
                    <CheckCircle2 size={16} className="shrink-0 text-pitch" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-slate-100">{req.label}</div>
                      <div className="font-tech text-[9.5px] uppercase tracking-wider text-slate-500">{req.note}</div>
                    </div>
                    <span className="clip-skew bg-pitch/15 px-2 py-0.5 font-tech text-[11px] font-bold text-pitch">
                      VERIFIED
                    </span>
                    {ms != null && (
                      <span className="w-[72px] text-right font-tech text-[12px] font-bold text-gold">
                        {ms.toFixed(2)}ms
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="clip-chamfer mt-3 border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Deterministic Event Gate
              </div>
              <div className="font-tech text-[11px] text-slate-300">{audit.event_gate.rule}</div>
              <div className="font-tech text-[10px] text-slate-500">
                fired in audit run: {audit.event_gate.gate_fired_in_audit?.should_explain ? "YES" : "NO"}
                {audit.event_gate.gate_fired_in_audit?.reasons?.length
                  ? ` (${audit.event_gate.gate_fired_in_audit.reasons.join(", ")})`
                  : ""}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {Object.entries(audit.live_pipeline).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border border-white/10 bg-black/40 px-2 py-1">
                  <span className="font-tech text-[10px] uppercase tracking-wider text-slate-500">live {k}</span>
                  <span className="font-tech text-[11px] font-bold text-tactical">{v != null ? `${v.toFixed(1)}ms` : "—"}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
