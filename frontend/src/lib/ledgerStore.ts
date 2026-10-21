"use client";
// AETHER PITCH — Counterfactual experiment ledger.
//
// Every what-if a judge runs (a single-player drag, a collective defensive
// line shift, an arbiter adjudication) is logged here. The ledger is the
// evidence trail: it is serialized into the match dossier exports and
// surfaced in the rubric verifier.
//
// It is a module-level store (like `telemetry`) so logging an experiment
// never re-renders the broadcast.

import type { CounterfactualEvaluation } from "./types";

export type ExperimentKind = "player_drag" | "defensive_line_shift";

export interface LedgerExperiment {
  id: string;
  kind: ExperimentKind;
  at: string;
  clock: string;
  minute: number;
  summary: string;
  deltaXT: number;
  deltaControlPct: number;
  displacementM: number;
  vulnerabilityIndex: number | null;
  throughBallExposureXt: number | null;
  pressCompressionGainPct: number | null;
  offsideTrapCatchPct: number | null;
  scenarioId: string | null;
  traceId: string | null;
  numericGroundingVerified: boolean | null;
  team: string | null;
}

const MAX_ENTRIES = 60;

export const counterfactualLedger: LedgerExperiment[] = [];

type LedgerListener = () => void;
const listeners = new Set<LedgerListener>();

export function subscribeLedger(listener: LedgerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach((l) => l());
}

let seq = 0;

export function logExperiment(entry: Omit<LedgerExperiment, "id" | "at">): LedgerExperiment {
  seq += 1;
  const record: LedgerExperiment = {
    ...entry,
    id: `cfx_${String(seq).padStart(3, "0")}`,
    at: new Date().toISOString(),
  };
  counterfactualLedger.unshift(record);
  if (counterfactualLedger.length > MAX_ENTRIES) {
    counterfactualLedger.length = MAX_ENTRIES;
  }
  notify();
  return record;
}

/** Fold an arbiter evaluation into the most recent experiment of a kind. */
export function annotateWithEvaluation(
  evaluation: CounterfactualEvaluation,
  kind: ExperimentKind,
): void {
  const match = counterfactualLedger.find((e) => e.kind === kind);
  if (!match) return;
  match.vulnerabilityIndex = evaluation.structural_vulnerability_index;
  match.scenarioId = evaluation.scenario_id;
  match.traceId = evaluation.trace_id;
  match.numericGroundingVerified = evaluation.numeric_grounding_verified;
  notify();
}

export function clearLedger(): void {
  counterfactualLedger.length = 0;
  notify();
}
