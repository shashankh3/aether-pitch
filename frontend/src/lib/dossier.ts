"use client";
// AETHER PITCH — Match audit dossier serialization.
//
// Kept out of the modal so it can be unit-tested headlessly: the dossier is
// the artifact a judge exports, so its shape matters as much as the UI.

import type { MatchRecapStoryboard, MatchTick, PipelineAudit } from "./types";
import { counterfactualLedger, type LedgerExperiment } from "./ledgerStore";

export interface DossierInput {
  data: MatchRecapStoryboard;
  tick: MatchTick | null;
  audit: PipelineAudit | null;
  ledger?: LedgerExperiment[];
}

export function buildDossier(input: DossierInput): Record<string, unknown> | null {
  const { data, tick, audit } = input;
  if (!data) return null;
  const metadata = tick?.match_metadata;
  const ledger = (input.ledger ?? counterfactualLedger).slice();
  const sorted = [...data.acts].sort((a, b) => b.delta_xt - a.delta_xt);
  const topDelta = sorted.slice(0, 3).map((act) => ({
    clock: act.clock,
    player: act.player_name,
    team: act.team,
    type: act.event_type,
    delta_xt: act.delta_xt,
    pdr: act.pdr,
    ghost_delta_xt: act.ghost_pass.delta_xt,
  }));
  const ghostAct = data.acts.find((act) => act.ghost_pass) ?? data.acts[0];
  const stageB = audit?.stage_b_summary ?? {
    peak_chaos_index: Number(Math.max(...data.acts.map((act) => act.chaos)).toFixed(3)),
    team_ppda: {},
    top_delta_xt: topDelta,
    ghost_counterfactual: ghostAct ? {
      clock: ghostAct.clock,
      team: ghostAct.team,
      player_id: ghostAct.player_id,
      player_name: ghostAct.player_name,
      target_id: ghostAct.ghost_pass.target_id,
      actual_delta_xt: ghostAct.ghost_pass.actual_delta_xt ?? ghostAct.delta_xt,
      ghost_delta_xt: ghostAct.ghost_pass.ghost_delta_xt ?? ghostAct.ghost_pass.delta_xt,
      net_xt_gain: ghostAct.ghost_pass.net_xt_gain
        ?? (ghostAct.ghost_pass.delta_xt - ghostAct.delta_xt),
      completion_probability: ghostAct.ghost_pass.completion_probability ?? null,
      receiver_target_xy: ghostAct.ghost_pass.receiver_target_xy
        ?? ghostAct.ghost_pass.end,
    } : null,
  };
  const trace = audit?.agent_trace;

  return {
    schema_version: "aether.audit.dossier.v1",
    artifact: "AETHER PITCH — Full Match & Foundry Audit Dossier",
    generated_at: new Date().toISOString(),
    provenance: {
      league: "AETHER Synthetic League",
      teams: ["North Larchmont Athletic (NLA)", "Meridian City SC (MCS)"],
      data_path: "Stage A 10Hz synthetic feed → Stage B deterministic math → Stage C Foundry router → Stage D WebGL → Stage E Atlas",
      synthetic: metadata?.synthetic ?? true,
      no_external_video: true,
    },
    match_summary: audit?.match_summary ?? {
      home: metadata?.home_team.short_name ?? "NLA",
      away: metadata?.away_team.short_name ?? "MCS",
      competition: metadata?.competition ?? "AETHER Synthetic League",
      venue: metadata?.venue ?? "AETHER 3D DIGITAL TWIN",
      clock: data.timecode,
      score: data.score,
      synthetic_provenance: metadata?.synthetic ?? true,
      data_source: metadata?.data_source ?? "Stage A deterministic 10Hz synthetic engine",
      provenance: "No real footage, third-party broadcast marks, or external video assets.",
    },
    stage_b: stageB,
    storyboard: {
      title: data.title,
      subtitle: data.subtitle,
      timecode: data.timecode,
      score: data.score,
      model: data.model,
      milestones: data.milestones,
      acts: data.acts.map((act) => ({
        act: act.act,
        title: act.title,
        subtitle: act.subtitle,
        clock: act.clock,
        team: act.team,
        event_type: act.event_type,
        player_name: act.player_name,
        pdr: act.pdr,
        delta_xt: act.delta_xt,
        chaos: act.chaos,
        ghost_pass: act.ghost_pass,
        camera_mode: act.camera_mode,
        localized_commentary: act.localized_commentary,
      })),
    },
    foundry_execution: {
      trace_id: trace?.trace_id ?? "edge-local",
      mode: trace?.mode ?? "edge",
      model: trace?.model ?? data.model,
      anchor_clock: trace?.anchor_clock ?? data.timecode,
      gate: trace?.gate ?? null,
      handoff_chain: trace?.handoff_chain ?? [],
      grounding: trace?.grounding ?? null,
      guardrail: trace?.guardrail ?? null,
      latency_p95: audit?.latency_p95 ?? {},
      handoff_counts: audit?.handoff_counts ?? null,
      gate_efficiency: audit?.gate_efficiency ?? null,
      stage_timings: audit?.audit ?? null,
      stage_modes: audit?.stage_modes ?? {},
      azure: audit?.azure ?? null,
    },
    counterfactual_lab: {
      experiment_count: ledger.length,
      player_drags: ledger.filter((e) => e.kind === "player_drag").length,
      line_shifts: ledger.filter((e) => e.kind === "defensive_line_shift").length,
      grounded_experiments: ledger.filter((e) => e.numericGroundingVerified === true).length,
      experiments: ledger,
    },
    compliance: {
      synthetic_data_compliance: audit?.synthetic_data_compliance ?? true,
      no_external_video: true,
      fictional_entities: true,
      disclaimer: metadata?.disclaimer
        ?? "All teams, players, kits, marks and competition names are fictional.",
      human_review: "Human-in-the-loop review required before publishing generated commentary.",
    },
  };
}

/** The Markdown rendering of the dossier. */
export function dossierToMarkdown(
  dossier: Record<string, unknown>,
  lang: "en" | "es" | "ar" | "hi" = "en",
): string {
  const storyboard = dossier.storyboard as Record<string, unknown>;
  const stageB = dossier.stage_b as Record<string, unknown>;
  const foundry = dossier.foundry_execution as Record<string, unknown>;
  const compliance = dossier.compliance as Record<string, unknown>;
  const match = dossier.match_summary as Record<string, unknown>;
  const lab = dossier.counterfactual_lab as {
    experiment_count: number;
    player_drags: number;
    line_shifts: number;
    grounded_experiments: number;
    experiments: {
      id: string;
      kind: string;
      clock: string;
      summary: string;
      deltaXT: number;
      deltaControlPct: number;
      vulnerabilityIndex: number | null;
      throughBallExposureXt: number | null;
      pressCompressionGainPct: number | null;
      offsideTrapCatchPct: number | null;
      traceId: string | null;
      numericGroundingVerified: boolean | null;
    }[];
  };
  const topDelta = (stageB.top_delta_xt ?? []) as {
    clock: string;
    player: string;
    delta_xt: number;
  }[];
  const ghost = stageB.ghost_counterfactual as {
    player_name: string | null;
    player_id: string | null;
    target_id: string | null;
    actual_delta_xt: number;
    ghost_delta_xt: number;
    net_xt_gain: number;
    completion_probability: number | null;
  } | null;
  const acts = (storyboard.acts ?? []) as {
    act: number;
    title: string;
    subtitle: string;
    clock: string;
    pdr: number;
    delta_xt: number;
    ghost_pass: { delta_xt: number; net_xt_gain?: number | null };
    localized_commentary?: Record<string, string>;
  }[];

  const lines = [
    "# AETHER PITCH — Full Match & Foundry Audit Dossier",
    "",
    `Generated: ${String(dossier.generated_at)}`,
    `Schema: ${String(dossier.schema_version)}`,
    "",
    "## 1 · Match summary",
    `- Fixture: ${String(match.home)} vs ${String(match.away)}`,
    `- Competition: ${String(match.competition)}`,
    `- Venue: ${String(match.venue)}`,
    `- Clock / score: ${String(match.clock ?? "n/a")} · NLA ${(storyboard.score as { NLA: number }).NLA}–${(storyboard.score as { MCS: number }).MCS} MCS`,
    `- Synthetic provenance: ${match.synthetic_provenance ? "yes" : "no"}`,
    `- Source: ${String(match.data_source)}`,
    "",
    "## 2 · Deterministic Stage B",
    `- Peak chaos index: ${Number(stageB.peak_chaos_index).toFixed(3)}`,
    `- Team PPDA: ${JSON.stringify(stageB.team_ppda)}`,
    `- Top ΔxT: ${topDelta.map((row) => `${row.clock} ${row.player} ${row.delta_xt.toFixed(3)}`).join("; ") || "n/a"}`,
    ghost
      ? `- Ghost counterfactual: ${ghost.player_name ?? ghost.player_id ?? "carrier"} → ${ghost.target_id ?? "target"} · actual ${ghost.actual_delta_xt.toFixed(3)} xT · ghost ${ghost.ghost_delta_xt.toFixed(3)} xT · net ${ghost.net_xt_gain.toFixed(3)} xT · ${ghost.completion_probability?.toFixed(0) ?? "n/a"}% completion`
      : "- Ghost counterfactual: unavailable",
    "",
    "## 3 · Three-act storyboard",
    ...acts.flatMap((act) => [
      `### Act ${act.act} — ${act.title} (${act.clock})`,
      act.subtitle,
      `PDR ${act.pdr.toFixed(0)}% · Actual ${act.delta_xt.toFixed(2)} xT · Ghost ${act.ghost_pass.delta_xt.toFixed(2)} xT · Net ${(act.ghost_pass.net_xt_gain ?? (act.ghost_pass.delta_xt - act.delta_xt)).toFixed(2)} xT`,
      act.localized_commentary?.[lang] ?? "",
      "",
    ]),
    "## 4 · Foundry + multi-agent execution",
    `- Trace: ${String(foundry.trace_id)}`,
    `- Mode / model: ${String(foundry.mode)} / ${String(foundry.model)}`,
    `- Anchor: ${String(foundry.anchor_clock)}`,
    `- Handoffs: ${(foundry.handoff_chain as { agent: string; status: string }[]).map((span) => `${span.agent} [${span.status}]`).join(" → ") || "edge-local"}`,
    `- Gate: ${JSON.stringify(foundry.gate)}`,
    `- Grounding: ${JSON.stringify(foundry.grounding)}`,
    `- Guardrail: ${JSON.stringify(foundry.guardrail)}`,
    `- Handoff counts: ${JSON.stringify(foundry.handoff_counts)}`,
    `- Latency P95: ${JSON.stringify(foundry.latency_p95)}`,
    "",
    "## 5 · Counterfactual experiment ledger",
    lab.experiment_count === 0
      ? "- No what-if experiments were run in this session."
      : [
          `- Experiments: ${lab.experiment_count} (${lab.player_drags} player drags, ` +
            `${lab.line_shifts} defensive-line shifts, ` +
            `${lab.grounded_experiments} numerically grounded)`,
          "",
          ...lab.experiments.map((e) => {
            const bits = [
              `### ${e.id} · ${e.kind.replace(/_/g, " ")} · ${e.clock}`,
              e.summary,
              `- ΔxT ${e.deltaXT >= 0 ? "+" : ""}${e.deltaXT.toFixed(3)}`,
            ];
            if (e.deltaControlPct) bits.push(`- Δ pitch control ${e.deltaControlPct.toFixed(1)} pts`);
            if (e.throughBallExposureXt != null) {
              bits.push(`- Through-ball exposure ${e.throughBallExposureXt.toFixed(3)} xT`);
            }
            if (e.pressCompressionGainPct != null) {
              bits.push(`- Press compression ${e.pressCompressionGainPct.toFixed(1)}%`);
            }
            if (e.offsideTrapCatchPct != null) {
              bits.push(`- Offside trap catch ${e.offsideTrapCatchPct.toFixed(0)}%`);
            }
            if (e.vulnerabilityIndex != null) {
              bits.push(`- Structural vulnerability ${e.vulnerabilityIndex.toFixed(2)}`);
            }
            if (e.traceId) bits.push(`- Trace \`${e.traceId}\``);
            if (e.numericGroundingVerified != null) {
              bits.push(`- Numeric grounding ${e.numericGroundingVerified ? "VERIFIED" : "REVIEW"}`);
            }
            return bits.join("\n");
          }),
        ].flat(),
    "",
    "## 6 · Compliance & provenance",
    ...Object.entries(compliance).map(([key, value]) => `- ${key}: ${String(value)}`),
    `- Data lineage: ${(dossier.provenance as { data_path: string }).data_path}`,
    "",
  ];
  return lines.join("\n");
}
