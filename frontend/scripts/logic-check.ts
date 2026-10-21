/**
 * AETHER PITCH — headless frontend logic checks.
 *
 * Runs the browser-side deterministic logic with zero extra dependencies:
 * Node 24 strips the TypeScript types natively, so this needs no test
 * framework, no bundler and no network.
 *
 *   npm run check:logic
 *
 * It covers the parts of the interactive sandbox that a browser test would
 * otherwise be needed for: the Stage B twins, the counterfactual request
 * builder, the session ledger, and the dossier serialization.
 */
import assert from "node:assert/strict";

import {
  computeBioLoadProfile,
  computeBioLoadSummary,
  computePassingNetworkEdges,
  computePitchControlSplit,
  calculateXTAtCoord,
  evaluateDefensiveLineShift,
  evaluateSimulatedPitchControl,
  EdgeEngine,
} from "../src/lib/edgeEngine";
import {
  buildCounterfactualRequest,
  evaluateSandbox,
  lineShiftedPlayers,
  lineScrubber,
  activateSandbox,
  clearSandbox,
  moveSandboxPlayer,
  setLineShift,
  setLineTarget,
  setLineTeam,
} from "../src/lib/sandboxStore";
import {
  annotateWithEvaluation,
  clearLedger,
  counterfactualLedger,
  logExperiment,
} from "../src/lib/ledgerStore";
import { buildDossier, dossierToMarkdown } from "../src/lib/dossier";

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) {
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failures += 1;
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------------
// A live synthetic frame
// ---------------------------------------------------------------------------
const engine = new EdgeEngine(19);
let tick: any = null;
for (let i = 0; i < 300; i += 1) tick = engine.step(0.1).tick;

// --- Stage B twins ----------------------------------------------------------
const split = computePitchControlSplit(tick);
check(
  "pitch control split is a valid partition",
  split.nla_territory_pct >= 0
    && split.mcs_territory_pct >= 0
    && Math.abs(split.nla_territory_pct + split.mcs_territory_pct + (split.neutral_pct ?? 0) - 100) <= 1.5,
  JSON.stringify(split),
);

const edges = computePassingNetworkEdges(tick);
check(
  "passing network returns weighted lanes",
  edges.length > 0
    && edges.length <= 5
    && edges.every((e) => e.xt_weight > 0 && e.from_id !== e.to_id)
    && edges.some((e) => e.team === "NLA")
    && edges.some((e) => e.team === "MCS"),
  `${edges.length} edges`,
);

const rb = tick.players.find((p: any) => p.id === "NLA_2");
const liveBaseline = computePitchControlSplit(tick);
const zeroMove = evaluateSimulatedPitchControl(tick, "NLA_2", rb.x, rb.y);
const after = evaluateSimulatedPitchControl(tick, "NLA_2", rb.x - 15, rb.y);
check(
  "a zero-move counterfactual is exactly neutral",
  zeroMove.nla_territory_pct === liveBaseline.nla_territory_pct
    && zeroMove.mcs_territory_pct === liveBaseline.mcs_territory_pct
    && zeroMove.neutral_pct === liveBaseline.neutral_pct,
  `live=${liveBaseline.nla_territory_pct} zero=${zeroMove.nla_territory_pct}`,
);
check(
  "moving a defender changes the territory split",
  zeroMove.nla_territory_pct !== after.nla_territory_pct
    || zeroMove.mcs_territory_pct !== after.mcs_territory_pct,
  `${zeroMove.nla_territory_pct} -> ${after.nla_territory_pct}`,
);

// --- defensive line scrubber ------------------------------------------------
const line = evaluateDefensiveLineShift(tick, "NLA", 45);
check(
  "line shift returns the full contract",
  typeof line.current_line_height_m === "number"
    && typeof line.target_line_height_m === "number"
    && typeof line.delta_m === "number"
    && typeof line.compactness_area_m2 === "number"
    && typeof line.compactness_area_after_m2 === "number"
    && typeof line.through_ball_exposure_xt === "number"
    && line.offside_trap_catch_prob_pct >= 5
    && line.offside_trap_catch_prob_pct <= 95
    && typeof line.press_compression_gain_pct === "number"
    && line.backline_player_ids.length === 4
    && line.midfield_player_ids.length === 4,
  JSON.stringify({
    cur: line.current_line_height_m,
    d: line.delta_m,
    area: line.compactness_area_after_m2,
    exp: line.through_ball_exposure_xt,
    trap: line.offside_trap_catch_prob_pct,
    press: line.press_compression_gain_pct,
  }),
);
check(
  "line shift target is clamped to [18, 52]",
  evaluateDefensiveLineShift(tick, "NLA", 5).target_line_height_m === 18
    && evaluateDefensiveLineShift(tick, "NLA", 90).target_line_height_m === 52,
);
check(
  "line shift is deterministic",
  JSON.stringify(evaluateDefensiveLineShift(tick, "NLA", 45))
    === JSON.stringify(line),
);
const high = evaluateDefensiveLineShift(tick, "NLA", 50);
const low = evaluateDefensiveLineShift(tick, "NLA", 20);
check(
  "a higher line trades block area for central compression",
  high.compactness_area_after_m2 < low.compactness_area_after_m2
    && high.press_compression_gain_pct > low.press_compression_gain_pct,
  `area ${low.compactness_area_after_m2} -> ${high.compactness_area_after_m2}`,
);
// Publish the shift the way the scrubber does, then check the 3D relocation.
setLineShift(line);
const shiftedPlayers = lineShiftedPlayers(tick.players);
const movedBackline = shiftedPlayers.find((p: any) => p.id === line.backline_player_ids[0])!;
const liveBackline = tick.players.find((p: any) => p.id === line.backline_player_ids[0])!;
check(
  "the shifted backline is actually relocated for the 3D overlays",
  Math.abs(movedBackline.x - liveBackline.x - line.delta_m) < 0.001,
  `dx=${(movedBackline.x - liveBackline.x).toFixed(2)}m`,
);

// --- bio-load twin ---------------------------------------------------------
const bio = computeBioLoadProfile({
  number: 7,
  role: "MID",
  stamina: 80,
  bioLoad: 55,
  highIntensitySeconds: 12,
  pressSeconds: 3,
});
const bioSummary = computeBioLoadSummary(tick);
check(
  "bio-load profile is bounded and advisory",
  bio.sprint_load_index >= 0
    && bio.sprint_load_index <= 100
    && bio.projected_stamina_10m >= 30
    && bio.projected_stamina_10m <= 100
    && bio.fatigue_pdr_penalty >= 0
    && bio.fatigue_pdr_penalty <= 30
    && bio.tactical_relief_directive.length > 20,
);
check(
  "bio-load summary ranks the weakest links",
  bioSummary.most_at_risk.length <= 3
    && bioSummary.at_risk_count >= 0
    && bioSummary.mean_sprint_load_index >= 0,
);

// --- sandbox store ---------------------------------------------------------
clearSandbox();
clearLedger();
setLineTarget(40);
setLineTeam("NLA");
setLineShift(evaluateDefensiveLineShift(tick, "NLA", 40));

activateSandbox("NLA_2", rb.x, rb.y);
moveSandboxPlayer(rb.x - 12, rb.y - 4);
const delta = evaluateSandbox(tick);
check(
  "sandbox evaluates the dragged player",
  delta != null
    && delta.playerId === "NLA_2"
    && Math.abs(delta.displacementM - Math.hypot(12, 4)) < 0.2
    && typeof delta.deltaXT === "number"
    && typeof delta.deltaControlPct === "number",
  delta ? `d=${delta.displacementM}m dxt=${delta.deltaXT}` : "null",
);

const request = buildCounterfactualRequest(tick, delta, 0.52);
check(
  "counterfactual request matches the wire contract",
  request != null
    && request.match_id.length > 0
    && request.displacements.length === 1
    && request.displacements[0].player_id === delta!.shirtNumber
    && request.displacements[0].canonical_player_id === "NLA_2"
    && request.displacements[0].original_coords.length === 2
    && request.displacements[0].displaced_coords.length === 2
    && request.displacements[0].delta_distance_m > 0
    && typeof request.baseline_xt === "number"
    && typeof request.baseline_pitch_control.nla_territory_pct === "number"
    && typeof request.current_chaos_index === "number",
);
check(
  "counterfactual request refuses to build without a scenario",
  buildCounterfactualRequest(tick, null, 0.5) == null,
);

// --- ledger ----------------------------------------------------------------
logExperiment({
  kind: "player_drag",
  clock: "62:30",
  minute: 62,
  summary: "NLA #2 moved 12.6m",
  deltaXT: -0.021,
  deltaControlPct: 1.4,
  displacementM: 12.6,
  vulnerabilityIndex: null,
  throughBallExposureXt: null,
  pressCompressionGainPct: null,
  offsideTrapCatchPct: null,
  scenarioId: null,
  traceId: null,
  numericGroundingVerified: null,
  team: "NLA",
});
logExperiment({
  kind: "defensive_line_shift",
  clock: "62:40",
  minute: 62,
  summary: "NLA defensive line 20.6m -> 45.0m",
  deltaXT: 0,
  deltaControlPct: 0,
  displacementM: 0,
  vulnerabilityIndex: null,
  throughBallExposureXt: 0.11,
  pressCompressionGainPct: 42.6,
  offsideTrapCatchPct: 58.5,
  scenarioId: null,
  traceId: null,
  numericGroundingVerified: null,
  team: "NLA",
});
check(
  "the ledger records every experiment kind",
  counterfactualLedger.length === 2
    && counterfactualLedger.filter((e) => e.kind === "player_drag").length === 1
    && counterfactualLedger.filter((e) => e.kind === "defensive_line_shift").length === 1
    && counterfactualLedger.every((e) => e.id.startsWith("cfx_") && e.at.length > 10),
  `${counterfactualLedger.length} entries`,
);
annotateWithEvaluation(
  {
    scenario_id: "cf_test",
    projected_xt_shift: -0.021,
    pitch_control_shift_pct: { nla_territory_pct: 1.4, mcs_territory_pct: -1.4 },
    structural_vulnerability_index: 0.31,
    arbiter_verdict: "The relocation surrenders 0.021 xT.",
    recommended_compensation_move: { player_id: 5, target_xy: [29.4, 55.1] },
    numeric_grounding_verified: true,
    trace_id: "trace_abc123",
  },
  "player_drag",
);
check(
  "the arbiter verdict annotates the matching experiment",
  counterfactualLedger.find((e) => e.kind === "player_drag")?.traceId === "trace_abc123"
    && counterfactualLedger.find((e) => e.kind === "player_drag")?.numericGroundingVerified === true
    && counterfactualLedger.find((e) => e.kind === "player_drag")?.vulnerabilityIndex === 0.31,
);

// --- dossier serialization --------------------------------------------------
const storyboard: any = {
  title: "The Championship Finale",
  subtitle: "Three acts",
  timecode: "78:00",
  score: { NLA: 3, MCS: 2 },
  model: "aether-recap-storyboard-v5",
  milestones: [{ id: "m1", type: "MILESTONE_SPRINT_PEAK", clock: "70:00", headline: "Sprint", detail: "peak" }],
  acts: [
    {
      act: 1,
      title: "The Tactical Catalyst",
      subtitle: "inversion",
      clock: "70:00",
      score: { NLA: 1, MCS: 1 },
      team: "NLA",
      event_type: "PASS",
      player_id: "NLA_2",
      player_name: "D. Keswick",
      pdr: 84,
      delta_xt: 0.12,
      chaos: 0.62,
      actual_pass: { start: { x: 50, y: 34 }, end: { x: 70, y: 34 } },
      ghost_pass: {
        start: { x: 50, y: 34 },
        end: { x: 82, y: 48 },
        delta_xt: 0.214,
        target_id: "NLA_11",
        openness_m: 12,
        actual_delta_xt: 0.12,
        ghost_delta_xt: 0.214,
        net_xt_gain: 0.094,
        completion_probability: 71,
        receiver_target_xy: { x: 82, y: 48 },
      },
      key_player_ids: ["NLA_2"],
      highlight_zone: { x_min: 0, x_max: 10, y_min: 0, y_max: 10, label: "X" },
      camera_mode: "TACTICAL_DRONE_ORBIT",
      snapshot: tick,
      analyst_tactical_summary: "summary",
      casual_story: "story",
      localized_commentary: { en: "Act one", es: "Acto uno", ar: "الفصل", hi: "अंक" },
    },
  ],
};
const dossier: any = buildDossier({ data: storyboard, tick, audit: null });
check(
  "the dossier carries the counterfactual lab",
  dossier != null
    && dossier.counterfactual_lab.experiment_count === 2
    && dossier.counterfactual_lab.player_drags === 1
    && dossier.counterfactual_lab.line_shifts === 1
    && dossier.counterfactual_lab.grounded_experiments === 1
    && dossier.counterfactual_lab.experiments.length === 2,
  JSON.stringify({
    n: dossier?.counterfactual_lab.experiment_count,
    grounded: dossier?.counterfactual_lab.grounded_experiments,
  }),
);
check(
  "the dossier keeps its compliance attestation",
  dossier?.compliance?.no_external_video === true
    && dossier?.compliance?.fictional_entities === true
    && dossier?.compliance?.synthetic_data_compliance === true,
);
const md = dossierToMarkdown(dossier, "en");
check(
  "the markdown dossier serializes the ledger",
  md.includes("## 5 · Counterfactual experiment ledger")
    && md.includes("Experiments: 2")
    && md.includes("NLA #2 moved 12.6m")
    && md.includes("Through-ball exposure")
    && md.includes("trace_abc123")
    && md.includes("Numeric grounding VERIFIED")
    && md.includes("## 6 · Compliance & provenance"),
);
check(
  "the markdown dossier keeps the provenance section",
  md.includes("Data lineage:") && md.includes("AETHER Synthetic League"),
);

// --- cleanup ----------------------------------------------------------------
clearSandbox();
clearLedger();
setLineShift(null);
check(
  "clearing the sandbox resets the stores",
  counterfactualLedger.length === 0 && lineScrubber.shift === null,
);

console.log("");
console.log(
  failures === 0
    ? `RESULT: ALL ${checks} FRONTEND LOGIC CHECKS PASSED`
    : `RESULT: ${failures} FAILED of ${checks} -> ${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
