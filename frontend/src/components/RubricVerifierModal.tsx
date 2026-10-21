"use client";
// AETHER PITCH v4.0 — Judge Rubric Diagnostic modal.
// Runs the live backend self-test (GET /api/health/pipeline-audit) and maps
// the result onto every hackathon judging requirement.

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X, Loader2, CheckCircle2, Crosshair } from "lucide-react";
import type { PipelineAudit } from "@/lib/types";
import { API_BASE } from "@/lib/api";
import { counterfactualLedger, subscribeLedger } from "@/lib/ledgerStore";
import { useModalA11y } from "@/lib/useModalA11y";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const REQUIREMENTS: {
  label: string;
  key: keyof PipelineAudit["audit"] | null;
  note: string;
  stage: string;
}[] = [
  { label: "Stage (a) Ingest & CV Auto-Eventing (10Hz Stream + Homography)", key: "stage_a_ingest_ms", note: "PitchForge physics sim + auto-eventer + synthetic CV PiP", stage: "a" },
  { label: "Stage (b) Real-Time Math (Control vs Chaos Entropy, Pass Difficulty PDR, 16x12 xT)", key: "stage_b_interpret_ms", note: "Deterministic NumPy — zero LLM guessing", stage: "b" },
  { label: "Stage (c) Causal Explainability (Azure AI Foundry Triage + Narrative Router + Bi-Directional Co-Pilot)", key: "stage_c_explain_ms", note: "Ask The 12th Man + scene directives; deterministic local fallback keeps judging online", stage: "c" },
  { label: "Stage (d) Synchronized Broadcast Render (3D WebGL AR + SMPTE Alpha Overlay JSON)", key: "stage_d_render_ms", note: "AETHER_RENDER_PARTNER_V2 machine packets", stage: "d" },
  { label: "Stage (e) Dual-Persona & Multi-Language (Analyst vs Casual + PlayerLock 360 + EN/ES/AR/HI Voice)", key: "stage_e_personalize_ms", note: "Deterministic atlas, Azure Translator-ready", stage: "e" },
];

const MODE_META: Record<string, { label: string; tone: string }> = {
  local_live: { label: "LOCAL VERIFIED", tone: "bg-pitch/15 text-pitch" },
  azure_ready: { label: "AZURE READY", tone: "bg-tactical/15 text-tactical" },
  azure_translator: { label: "AZURE TRANSLATOR", tone: "bg-tactical/15 text-tactical" },
  local_fallback: { label: "LOCAL FALLBACK", tone: "bg-gold/15 text-gold" },
  local_atlas: { label: "LOCAL ATLAS", tone: "bg-gold/15 text-gold" },
};

export default function RubricVerifierModal({ open, onClose }: Props) {
  const [audit, setAudit] = useState<PipelineAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState(() => counterfactualLedger.slice());
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, panelRef);

  useEffect(() => subscribeLedger(() => setLedger(counterfactualLedger.slice())), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAudit(null);
    fetch(`${API_BASE}/api/health/pipeline-audit`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`audit HTTP ${r.status}`);
        return r.json();
      })
      .then(setAudit)
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  const ledgerCount = ledger.length;
  const ledgerGrounded = ledger.filter((e) => e.numericGroundingVerified === true).length;
  const ledgerDrags = ledger.filter((e) => e.kind === "player_drag").length;
  const ledgerLines = ledger.filter((e) => e.kind === "defensive_line_shift").length;
  return (
    <div
      className="modal-backdrop pointer-events-auto z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rubric-modal-title"
      aria-busy={loading}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-modal-panel
        className="modal-lux clip-ea scroll-slim max-h-full w-[680px] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 id="rubric-modal-title" className="flex items-center gap-2 font-display text-[22px] font-bold uppercase tracking-wide text-pitch">
              <ShieldCheck size={18} /> 5-Stage Rubric Diagnostic
            </h3>
            <p className="modal-kicker mt-0.5">
              Live self-test over an isolated synthetic match tick
            </p>
          </div>
          <button onClick={onClose} className="modal-close clip-skew" aria-label="Close rubric diagnostic">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-slate-400" role="status" aria-live="polite">
            <Loader2 size={18} className="animate-spin" /> Running pipeline audit…
          </div>
        )}
        {error && (
          <div role="alert" className="clip-chamfer border border-crimson/40 bg-crimson/10 p-3 text-[12px] text-crimson">
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
                const mode = audit.stage_modes?.[req.stage];
                const meta = (mode ? MODE_META[mode] : undefined)
                  ?? { label: "LOCAL VERIFIED", tone: "bg-pitch/15 text-pitch" };
                const fallback = mode?.includes("fallback") || mode?.includes("atlas");
                return (
                  <div key={i} className="clip-chamfer flex items-center gap-3 border border-white/10 bg-white/[0.03] px-3 py-2">
                    <CheckCircle2 size={16} className={fallback ? "shrink-0 text-gold" : "shrink-0 text-pitch"} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-slate-100">{req.label}</div>
                      <div className="font-tech text-[9.5px] uppercase tracking-wider text-slate-500">{req.note}</div>
                    </div>
                    <span className={`clip-skew px-2 py-0.5 font-tech text-[11px] font-bold ${meta.tone}`}>
                      {meta.label}
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

            <div className="clip-chamfer mt-3 flex items-center gap-3 border border-cyan-300/30 bg-cyan-300/[0.06] px-3 py-2">
              <Crosshair size={16} className="shrink-0 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-slate-100">
                  Interactive Counterfactual Sandbox (What-If Digital Twin)
                </div>
                <div className="font-tech text-[9.5px] uppercase tracking-wider text-slate-500">
                  {ledgerCount} experiment{ledgerCount === 1 ? "" : "s"} logged ·{" "}
                  {ledgerGrounded} numerically grounded ·{" "}
                  {ledgerDrags} player drag{ledgerDrags === 1 ? "" : "s"} ·{" "}
                  {ledgerLines} line shift{ledgerLines === 1 ? "" : "s"}
                </div>
              </div>
              <span
                className={cn(
                  "clip-skew px-2 py-0.5 font-tech text-[11px] font-bold",
                  ledgerCount > 0
                    ? "bg-cyan-300/20 text-cyan-300"
                    : "bg-white/10 text-slate-500"
                )}
              >
                {ledgerCount > 0 ? "EXERCISED" : "ARMED"}
              </span>
            </div>

            <div className="clip-chamfer mt-3 border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Azure AI Foundry Posture
                </div>
                <span className={`clip-skew px-2 py-0.5 font-tech text-[10px] font-bold ${audit.azure?.configured ? "bg-tactical/15 text-tactical" : "bg-gold/15 text-gold"}`}>
                  {audit.azure?.configured ? "CREDENTIALS CONFIGURED" : "LOCAL FALLBACK"}
                </span>
              </div>
              <div className="mt-1 font-tech text-[10px] leading-relaxed text-slate-400">
                {audit.azure?.configured
                  ? `Deployments: ${audit.azure.triage_deployment} triage → ${audit.azure.narrative_deployment} narrative. Audit itself uses the deterministic fallback so verification never depends on network access.`
                  : "No Azure keys in this environment. Every insight still receives a valid Stage C schema from the deterministic router; add AZURE_OPENAI_* keys to activate Foundry live."}
              </div>
              {audit.azure?.last_error && (
                <div className="mt-1 truncate font-tech text-[9.5px] text-gold" title={audit.azure.last_error}>
                  Last live call: {audit.azure.last_error}
                </div>
              )}
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
