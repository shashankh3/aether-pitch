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
import type {
  MatchRecapStoryboard, MatchTick, PlayerTick, RecapAct, Team,
} from "../src/lib/types";

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
let tick = engine.step(0.1).tick as MatchTick;
for (let i = 1; i < 300; i += 1) tick = engine.step(0.1).tick as MatchTick;

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

const rb = tick.players.find((p) => p.id === "NLA_2")!;
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

// --- the vectorised browser twin must equal the scalar reference -----------
function scalarSplit(
  t: MatchTick,
  override?: { playerId: string; x: number; y: number },
) {
  const players = t.players.filter((p) => p.role !== "GK");
  if (!players.length) return { nla_territory_pct: 50, mcs_territory_pct: 50, neutral_pct: 0 };
  let nla = 0;
  let mcs = 0;
  let neutral = 0;
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const cx = (col + 0.5) * (105 / 16);
      const cy = (row + 0.5) * (68 / 12);
      let ni = 0;
      let mi = 0;
      for (const p of players) {
        const moved = override !== undefined && p.id === override.playerId;
        const px = (moved ? override.x : p.x) + p.vx * 0.45;
        const py = (moved ? override.y : p.y) + p.vy * 0.45;
        const d2 = (cx - px) ** 2 + (cy - py) ** 2;
        if (d2 > 400) continue;
        const w = Math.exp(-d2 / 144) * (0.55 + Math.min(0.75, p.speed_kmh / 45));
        if (p.team === "NLA") ni += w;
        else mi += w;
      }
      if (ni > mi * 1.02) nla += 1;
      else if (mi > ni * 1.02) mcs += 1;
      else neutral += 1;
    }
  }
  const total = Math.max(1, nla + mcs + neutral);
  return {
    nla_territory_pct: Number(((nla / total) * 100).toFixed(1)),
    mcs_territory_pct: Number(((mcs / total) * 100).toFixed(1)),
    neutral_pct: Number(((neutral / total) * 100).toFixed(1)),
  };
}

let parityOk = true;
for (let i = 0; i < 40 && parityOk; i += 1) {
  const frame = engine.step(0.1);
  const live = frame.tick as MatchTick;
  if (JSON.stringify(scalarSplit(live)) !== JSON.stringify(computePitchControlSplit(live))) {
    parityOk = false;
  }
  const ov = [{ playerId: "NLA_2", x: 40, y: 30 }];
  if (
    JSON.stringify(scalarSplit(live, ov[0])) !==
    JSON.stringify(computePitchControlSplit(live, ov[0]))
  ) {
    parityOk = false;
  }
}
check(
  "the vectorised browser twin equals the scalar reference",
  parityOk,
  "192-cell x 22-player attribution",
);

// --- Stage B spatial invariants (property-style, parity with Stage B) ------
let lcg = 20261022;
const rand = () => {
  lcg = (lcg * 1103515245 + 12345) % 2147483648;
  return lcg / 2147483648;
};
// xT bounds are XT_MIN = 0.004 / XT_MAX = 0.35 (module-private constants).
let xtBounded = true;
for (let i = 0; i < 600; i += 1) {
  const fx = -60 + rand() * 225;
  const fy = -40 + rand() * 148;
  const v = calculateXTAtCoord(i % 2 === 0 ? "NLA" : "MCS", fx, fy);
  if (!(v >= 0.004 - 1e-9 && v <= 0.35 + 1e-9)) xtBounded = false;
}
check(
  "xT stays inside [0.004, 0.350] for any coordinate",
  xtBounded
    && calculateXTAtCoord("NLA", Number.NaN, 34) === 0.004
    && calculateXTAtCoord("MCS", 50, Number.POSITIVE_INFINITY) === 0.004,
  "600 fuzzed points; corrupt telemetry reads as minimum threat",
);
let xtMirror = true;
for (let i = 0; i < 421 && xtMirror; i += 1) {
  const fx = i * 0.25; // 0.25 m grid: 105 - (105 - x) is bit-exact
  for (let j = 0; j < 12; j += 1) {
    const fy = rand() * 68;
    const a = calculateXTAtCoord("NLA", fx, fy);
    const b = calculateXTAtCoord("MCS", 105 - fx, fy);
    if (Math.abs(a - b) > 5e-4) { // 4dp rounding + 1 ulp; a real bug is O(0.01)
      xtMirror = false;
      break;
    }
  }
}
check(
  "xT is mirror-symmetric about the halfway line",
  xtMirror,
  "xt(NLA, x, y) == xt(MCS, 105-x, y), 5052 samples",
);
let xtMono = true;
for (const fy of [2, 17, 34, 51, 66]) {
  let prev = -1;
  for (let i = 0; i <= 210 && xtMono; i += 1) {
    const v = calculateXTAtCoord("NLA", (i * 104.9) / 210, fy);
    if (v < prev) xtMono = false;
    prev = v;
  }
}
check(
  "xT never decreases toward the attacking goal",
  xtMono,
  "5 horizontal sweeps x 211 samples",
);

const NEUTRAL_SPLIT = JSON.stringify({
  nla_territory_pct: 50,
  mcs_territory_pct: 50,
  neutral_pct: 0,
});
check(
  "pitch control degrades gracefully for an empty squad",
  JSON.stringify(computePitchControlSplit({ ...tick, players: [] })) === NEUTRAL_SPLIT
    && JSON.stringify(computePitchControlSplit({
      ...tick,
      players: tick.players.filter((p) => p.role === "GK"),
    })) === NEUTRAL_SPLIT,
  "empty and keeper-only squads both yield 50-50",
);
const donor = tick.players.find((p) => p.role !== "GK")!;
const corruptTick = {
  ...tick,
  players: [
    ...tick.players,
    { ...donor, id: "NLA_NAN", x: Number.NaN },
    { ...donor, id: "NLA_NANV", vx: Number.NaN },
  ],
};
check(
  "a corrupt player is absent from the territory surface",
  JSON.stringify(computePitchControlSplit(corruptTick))
    === JSON.stringify(computePitchControlSplit(tick)),
  "NaN position / velocity cannot neutralise a team's grid",
);
const mirrorY = (t: MatchTick): MatchTick => ({
  ...t,
  players: t.players.map((p) => ({ ...p, y: 68 - p.y, vy: -p.vy })),
});
const mirrorXSwap = (t: MatchTick): MatchTick => ({
  ...t,
  players: t.players.map((p) => ({
    ...p,
    x: 105 - p.x,
    vx: -p.vx,
    team: (p.team === "NLA" ? "MCS" : "NLA") as Team,
  })),
});
let partitionOk = true;
let mirrorOk = true;
let swapOk = true;
let cursor = tick;
for (let i = 0; i < 12; i += 1) {
  const base = computePitchControlSplit(cursor);
  const total = base.nla_territory_pct + base.mcs_territory_pct + (base.neutral_pct ?? 0);
  if (
    base.nla_territory_pct < 0 || base.nla_territory_pct > 100
    || base.mcs_territory_pct < 0 || base.mcs_territory_pct > 100
    || Math.abs(total - 100) > 0.3
  ) {
    partitionOk = false;
  }
  if (JSON.stringify(computePitchControlSplit(mirrorY(cursor))) !== JSON.stringify(base)) {
    mirrorOk = false;
  }
  const swapped = computePitchControlSplit(mirrorXSwap(cursor));
  if (
    swapped.nla_territory_pct !== base.mcs_territory_pct
    || swapped.mcs_territory_pct !== base.nla_territory_pct
    || swapped.neutral_pct !== base.neutral_pct
  ) {
    swapOk = false;
  }
  cursor = engine.step(0.1).tick as MatchTick;
}
check(
  "territory is always a [0,100] partition of ~100%",
  partitionOk,
  "12 simulated ticks",
);
check(
  "a width-axis mirror leaves the split identical",
  mirrorOk,
  "y -> 68-y, vy -> -vy",
);
check(
  "a length-axis mirror swaps the two teams' shares",
  swapOk,
  "x -> 105-x with the team labels exchanged",
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
const movedBackline = shiftedPlayers.find((p) => p.id === line.backline_player_ids[0])!;
const liveBackline = tick.players.find((p) => p.id === line.backline_player_ids[0])!;
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
const storyboard: MatchRecapStoryboard = {
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
const dossier = buildDossier({ data: storyboard, tick, audit: null })!;
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

// --- DVR buffer invariants ------------------------------------------------
import { telemetry } from "../src/lib/telemetry";

const dvrEngine = new EdgeEngine(23);
for (let i = 0; i < 400; i += 1) {
  const frame = dvrEngine.step(0.1);
  telemetry.recordLive(frame.tick as MatchTick);
  for (const event of frame.events) {
    if (event.type === "PASS" && event.player_id && event.start && event.end && event.team) {
      telemetry.recordPassLink(
        event.player_id,
        event.target_id || "",
        event.team,
        event.start,
        event.end,
        event.delta_xt ?? 0,
      );
    }
  }
}
check(
  "DVR: the history buffer is capped at 15 s (150 frames)",
  telemetry.history.length === 150,
  `${telemetry.history.length} frames held`,
);
check(
  "DVR: snapshotAt clamps an offset past the start of the buffer",
  telemetry.snapshotAt(-9999) != null
    && telemetry.snapshotAt(-9999) === telemetry.history[0],
  "clamps to the oldest frame",
);
check(
  "DVR: snapshotAt clamps an offset past the live edge",
  telemetry.snapshotAt(9999) != null
    && telemetry.snapshotAt(9999) === telemetry.history[telemetry.history.length - 1],
  "clamps to the newest frame",
);
check(
  "DVR: the buffer is strictly chronological",
  telemetry.history.every((s, i) => i === 0 || s.t_match >= telemetry.history[i - 1].t_match),
);
check(
  "DVR: a paused store stops recording so scrubs stay anchored",
  (() => {
    const before = telemetry.history.length;
    telemetry.playbackPaused = true;
    telemetry.recordLive(dvrEngine.step(0.1).tick as MatchTick);
    const after = telemetry.history.length;
    telemetry.playbackPaused = false;
    return after === before;
  })(),
  "a frozen feed does not grow the buffer",
);
check(
  "DVR: the pass-link table is bounded",
  telemetry.passLinks.size > 0 && telemetry.passLinks.size <= 96,
  `${telemetry.passLinks.size} links held (cap 96)`,
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
