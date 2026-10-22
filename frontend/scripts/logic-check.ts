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
  clearLedger,  counterfactualLedger,
  logExperiment,
} from "../src/lib/ledgerStore";
import { buildDossier, dossierToMarkdown } from "../src/lib/dossier";
import { FailoverDrill } from "../src/lib/failoverDrill";
import {
  ARCHETYPES, STORIES, TRANSLATIONS, fillTemplate,
} from "../src/lib/narrativeAtlas";
import { TERMS, glossary } from "../src/lib/terminology";
import { classifyArchetype } from "../src/lib/edgeEngine";
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

// --- edge-twin i18n: genuine scripts, no double-encoded UTF-8 --------------
const insightFrame = engine.step(0.1);
const insight = engine.buildInsight(
  {
    id: "evt_i18n",
    type: "PASS",
    clock: "63:05",
    t_match: 3785,
    team: "NLA",
    player_id: "NLA_7",
    player_name: "D. Keswick",
    pdr: 84,
    delta_xt: 0.11,
  },
  insightFrame.tick as MatchTick,
  insightFrame.metrics,
);
const tr = insight.stage_e_personalization.translations as Record<string, string>;
const MOJIBAKE = /[ÃÂÎØÙ]|â€|à¤/;
check(
  "the edge twin ships a genuine 4-language atlas",
  typeof tr.en === "string" && tr.en.length > 20
    && typeof tr.es === "string" && /[¡áéíóúñ]/i.test(tr.es)
    && typeof tr.ar === "string" && /[؀-ۿ]/.test(tr.ar)
    && typeof tr.hi === "string" && /[ऀ-ॿ]/.test(tr.hi)
    && Object.values(tr).every((s) => !MOJIBAKE.test(s)),
  "en/es/ar/hi present, correct scripts, zero mojibake",
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

// ---------------------------------------------------------------------------
// Accessibility gate: the judge-facing HUD is scanned at build time so the
// WCAG AA contrast and the accessible-name rules cannot silently regress.
//
// A screen reader announces an icon-only control as just "button", and the
// default Tailwind slate 500/600 fail AA as body text on the dark studio
// panels (4.02:1 and 2.53:1 against #080F1E). Both are checked here.
// ---------------------------------------------------------------------------
{
  const fs = await import("node:fs");
  const path = await import("node:path");

  const SRC = path.resolve(process.cwd(), "src");
  const TAILWIND = path.resolve(process.cwd(), "tailwind.config.ts");

  const read = (p: string): string => fs.readFileSync(p, "utf8");

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(tsx|ts|css)$/.test(e.name) ? [full] : [];
    });

  // --- WCAG contrast ------------------------------------------------------
  const toLinear = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = (hex: string): number => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  const contrast = (fg: string, bg: string): number => {
    const a = luminance(fg);
    const b = luminance(bg);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  };

  // The panel background the HUD text sits on.
  const PANEL_BG = "#080F1E";
  // Default Tailwind slate, overridden by the project where it fails AA.
  const DEFAULT_SLATE: Record<string, string> = {
    "100": "#F1F5F9", "200": "#E2E8F0",
    "300": "#CBD5E1", "400": "#94A3B8", "500": "#64748B", "600": "#475569",
    "700": "#334155", "800": "#1E293B", "900": "#0F172A",
  };

  const tw = read(TAILWIND);
  const override = /slate:\s*\{([\s\S]*?)\}/.exec(tw);
  const slate: Record<string, string> = { ...DEFAULT_SLATE };
  if (override) {
    for (const m of override[1].matchAll(/(\d{3}):\s*"(#[0-9A-Fa-f]{6})"/g)) {
      slate[m[1]] = m[2];
    }
  }

  const files = walk(SRC);
  const usedTokens = new Set<string>();
  for (const f of files) {
    for (const m of read(f).matchAll(/text-slate-(\d{3})/g)) usedTokens.add(m[1]);
  }
  // 800/900 are backgrounds, not body text; the palette below only claims to
  // cover the tokens the HUD actually renders as text.
  const textTokens = [...usedTokens].filter((t) => Number(t) < 800).sort();

  const failing = textTokens
    .map((t) => ({ t, ratio: contrast(slate[t] ?? "#000000", PANEL_BG) }))
    .filter((x) => x.ratio < 4.5);

  check(
    "A11y: every slate token rendered as text clears WCAG AA (4.5:1)",
    failing.length === 0,
    failing.length === 0
      ? `${textTokens.length} text tokens checked, lowest ${Math.min(
          ...textTokens.map((t) => contrast(slate[t] ?? "#000000", PANEL_BG)),
        ).toFixed(2)}:1`
      : `failing: ${failing.map((f) => `slate-${f.t}=${f.ratio.toFixed(2)}:1`).join(", ")}`,
  );

  // --- accessible names on icon-only buttons -----------------------------
  const BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  const unnamed: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".tsx")) continue;
    const src = read(f);
    for (const m of src.matchAll(BUTTON)) {
      const [, attrs, body] = m;
      if (/aria-label|aria-labelledby|title=/.test(attrs)) continue;
      const withoutTags = body.replace(/<[^>]*>/g, " ");
      const withoutExpr = withoutTags.replace(/\{[^}]*\}/g, " ");
      const hasText = /[A-Za-z]/.test(withoutExpr) || /["'][A-Za-z][^"']*["']/.test(body);
      if (hasText) continue;
      if (!/<(?:[A-Z][A-Za-z0-9]*|svg)\b/.test(body)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      unnamed.push(`${path.relative(process.cwd(), f)}:${line}`);
    }
  }
  check(
    "A11y: every icon-only button carries an accessible name",
    unnamed.length === 0,
    unnamed.length === 0 ? "no unnamed icon buttons" : unnamed.join(", "),
  );

  // --- modal semantics ----------------------------------------------------
  const dialogFiles = files.filter(
    (f) => f.endsWith(".tsx") && /useModalA11y\(/.test(read(f)),
  );
  const badDialogs = dialogFiles.filter((f) => {
    const src = read(f);
    return !/role="dialog"/.test(src) || !/aria-modal/.test(src);
  });
  check(
    "A11y: every focus-trapped panel is announced as a dialog",
    badDialogs.length === 0,
    badDialogs.length === 0
      ? `${dialogFiles.length} focus-trapped panels`
      : badDialogs.map((f) => path.basename(f)).join(", "),
  );
  // --- the alpha clean-feed contract -------------------------------------
  // ?overlay=alpha is a broadcast deliverable: a transparent feed for
  // compositing. Nothing may sit over it. Each surface below is hidden by a
  // different mechanism, so the contract is checked mechanism by mechanism.
  const page = read(path.join(SRC, "app", "page.tsx"));
  const rightDock = read(path.join(SRC, "components", "hud", "RightDock.tsx"));
  const firstRun = read(path.join(SRC, "components", "JudgeFirstRunCard.tsx"));

  check(
    "Alpha feed: the HUD shell is hidden behind a clean feed",
    /alphaMode\s*&&\s*"hidden"/.test(page),
    "the HUD wrapper carries the alpha hide",
  );
  check(
    "Alpha feed: the autopilot banner is disabled",
    /active=\{autopilotActive\s*&&\s*!alphaMode\}/.test(page),
  );
  check(
    "Alpha feed: the control centre closes and renders nothing",
    /!\s*controlCenterOpen\s*\|\|\s*alphaMode\)\s*return null/.test(rightDock),
  );
  check(
    "Alpha feed: the caption strip and the counterfactual HUD are gated",
    /!alphaMode\s*&&\s*!cinemaMode\s*&&\s*<LiveCaptionStrip\s*\/>/.test(page)
    && /!alphaMode\s*&&\s*!cinemaMode\s*&&\s*\(/.test(page),
  );
  check(
    "Alpha feed: the first-run card is suppressed on a clean feed",
    /alphaMode[^)]*\)\s*return null/.test(firstRun),
    "the card's render guard refuses to draw in alpha mode",
  );
  check(
    "Alpha feed: the goal slam and the cinema overlay are gated",
    /goalBanner\s*&&\s*!alphaMode\s*&&/.test(page)
    && /cinemaMode\s*&&\s*!alphaMode\s*&&/.test(page),
  );

  // --- the 10 Hz render budget -------------------------------------------
  // The live tick arrives ten times a second. An effect that depends on it
  // and sets state re-runs on every tick, which both doubles the render
  // count for that panel and tears down its subscriptions each time.
  const deltaHud = read(path.join(SRC, "components", "hud", "CounterfactualDeltaHUD.tsx"));

  // Pair each useEffect call with its dependency array, so a useMemo or a
  // useCallback with a `tick` dependency is not mistaken for one.
  const effectDeps: string[] = [];
  for (const m of deltaHud.matchAll(/useEffect\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let i = open;
    while (i < deltaHud.length) {
      if (deltaHud[i] === "(") depth += 1;
      else if (deltaHud[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
      i += 1;
    }
    const call = deltaHud.slice(open, i + 1).replace(/\)\s*$/, "");
    const dep = /\[\s*([^\][]*)\s*\]\s*$/.exec(call);
    if (dep) effectDeps.push(dep[1]);
  }
  // The rescan loop is the effect that owns the 80 ms interval.
  const rescanDeps = effectDeps.filter((d) => /active/.test(d));
  check(
    "Render budget: the counterfactual rescan does not re-run on every tick",
    rescanDeps.length > 0 && !rescanDeps.some((d) => /(^|[,\s])tick([,\s]|$)/.test(d)),
    `effect deps: ${effectDeps.map((d) => d.trim()).join(" | ") || "none"}`,
  );
  check(
    "Render budget: the live tick is read through a ref, not a dependency",
    /tickRef\.current\s*=\s*tick/.test(deltaHud)
    && /tickRef\.current/.test(deltaHud),
  );
}

// ---------------------------------------------------------------------------
// The cloud-outage failover drill.
//
// The drill is the demo's headline resilience claim and it used to be
// untestable: the state machine lived inside a React effect, so nothing
// verified that the outage actually drops the cloud, that the edge engine
// keeps running through it, or that the phases arrive in order. It is now
// a standalone state machine with an injected clock, so a six-second drill
// can be driven in milliseconds here.
// ---------------------------------------------------------------------------
{
  class ManualClock {
    private t = 0;
    private readonly wall = 1_700_000_000_000;
    private timers: { at: number; fn: () => void; id: number }[] = [];
    private nextId = 1;

    now = (): number => this.t;
    wallNow = (): number => this.wall;
    setTimeout = (fn: () => void, ms: number): unknown => {
      const id = this.nextId++;
      this.timers.push({ at: this.t + ms, fn, id });
      return id;
    };
    clearTimeout = (handle: unknown): void => {
      this.timers = this.timers.filter((x) => x.id !== handle);
    };
    advance(ms: number): void {
      const target = this.t + ms;
      for (;;) {
        const due = this.timers
          .filter((x) => x.at <= target)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        this.timers = this.timers.filter((x) => x.id !== due.id);
        this.t = due.at;
        due.fn();
      }
      this.t = target;
    }
  }

  const phases: string[] = [];
  let outages = 0;
  let reconnects = 0;
  const clock = new ManualClock();
  const drill = new FailoverDrill(
    clock,
    (s) => phases.push(s.phase),
    () => {
      outages += 1;
    },
    () => {
      reconnects += 1;
    },
  );

  check("Drill: it starts idle", drill.snapshot.phase === "idle" && !drill.isActive);

  const started = drill.trigger(6000);
  check("Drill: triggering starts the outage", started && drill.isActive);
  check("Drill: the drill drops the cloud exactly once", outages === 1);
  check("Drill: the outage phase is entered", drill.snapshot.phase === "outage");
  check("Drill: the drill reports zero dropped frames", drill.snapshot.framesDropped === 0);
  check("Drill: the drill is active while the cloud is down", drill.snapshot.active);

  // A second trigger must not restart the timers underneath the first drill.
  const second = drill.trigger(6000);
  check("Drill: a second trigger is refused", second === false && outages === 1);

  // The edge engine keeps producing frames through the outage.
  for (let i = 0; i < 40; i++) drill.frame();
  check("Drill: every edge frame proves continuity", drill.snapshot.reconciledTicks === 40,
    `${drill.snapshot.reconciledTicks} frames`);
  check("Drill: the frame count is republished at 1 Hz, not 10 Hz",
    phases.filter((p) => p === "outage").length <= 6,
    `${phases.filter((p) => p === "outage").length} republishes for 40 frames`);

  // The cloud comes back.
  clock.advance(6000);
  check("Drill: the cloud is reconnected", reconnects === 1);
  check("Drill: the reconciling phase is entered", drill.snapshot.phase === "reconciling");
  check("Drill: the swap latency is measured, not invented",
    drill.snapshot.swapLatencyMs === 6000,
    `${drill.snapshot.swapLatencyMs}ms`);

  // The reconciled state is shown, then the drill is done.
  clock.advance(700);
  check("Drill: the verified phase is reached", drill.snapshot.phase === "verified");
  check("Drill: the drill is no longer active", !drill.isActive && !drill.snapshot.active);
  check("Drill: the reconciled frame count survives", drill.snapshot.reconciledTicks === 40);
  check("Drill: the drill still reports zero dropped frames",
    drill.snapshot.framesDropped === 0);
  check("Drill: the phases arrived in order",
    phases[0] === "outage" && phases.includes("reconciling")
    && phases[phases.length - 1] === "verified",
    phases.join(" -> "));

  // Frames after the drill ends must not be counted against it.
  drill.frame();
  check("Drill: frames after the drill ends are not counted",
    drill.snapshot.reconciledTicks === 40);

  // A fresh drill must work after the previous one.
  phases.length = 0;
  const again = drill.trigger(1000);
  check("Drill: the drill can run again after it finished", again && drill.snapshot.phase === "outage");

  // The socket reopening is the clock cross-check.
  const clock2 = new ManualClock();
  const drill2 = new FailoverDrill(clock2, () => {}, () => {}, () => {});
  drill2.trigger(6000);
  drill2.reconnected();
  check("Drill: a reopened socket moves the drill to reconciling",
    drill2.snapshot.phase === "reconciling" && drill2.snapshot.reconciledTicks === 1,
    `phase=${drill2.snapshot.phase} ticks=${drill2.snapshot.reconciledTicks}`);

  // Disposal must release the timers.
  const clock3 = new ManualClock();
  const drill3 = new FailoverDrill(clock3, () => {}, () => {}, () => {});
  drill3.trigger(6000);
  drill3.dispose();
  clock3.advance(10_000);
  check("Drill: disposal cancels the pending timers", drill3.snapshot.phase === "outage",
    `phase=${drill3.snapshot.phase}`);
}

// ---------------------------------------------------------------------------
// Cross-engine parity: the browser twin must equal the Python engine.
//
// The Stage B engine runs on the backend; the browser twin runs when the
// backend is unreachable. If they ever disagree, a judge sees one product
// online and a different one offline - and the "every number is grounded
// and the twin agrees" claim becomes false.
//
// The Python engine's answers for a deterministic scenario live in
// `parity-fixture.json` (regenerate with `python backend/parity_fixture.py`).
// The backend suite asserts that fixture is still current, so it cannot go
// stale silently.
//
// This is the method that caught the NaN drift: the two engines disagreed on
// a non-finite coordinate and nothing else would have noticed.
// ---------------------------------------------------------------------------
{
  const fs = await import("node:fs");
  const path = await import("node:path");

  const fixturePath = path.resolve(process.cwd(), "scripts", "parity-fixture.json");
  const parsedFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  // The fixture writes non-finite numbers as tagged markers, because JSON has
  // no NaN and a NaN coordinate is one of the boundary cases.
  const reviveNonFinite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reviveNonFinite);
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const tag = obj.__nonfinite__;
      if (typeof tag === "string") {
        if (tag === "NaN") return Number.NaN;
        if (tag === "Infinity") return Number.POSITIVE_INFINITY;
        return Number.NEGATIVE_INFINITY;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) out[k] = reviveNonFinite(v);
      return out;
    }
    return value;
  };
  const fixture = reviveNonFinite(parsedFixture) as {
    state: MatchTick;
    expected: Record<string, unknown>;
    atlas?: { stories: Record<string, string>; translations: Record<string, Record<string, string>> };
    edge_cases?: {
      name: string;
      state: MatchTick;
      expected: {
        pitch_control: { nla_territory_pct: number; mcs_territory_pct: number; neutral_pct?: number };
        passing_network: { from_id: string; to_id: string; team: string; xt_weight: number }[];
        bio_load_summary: { mean_sprint_load_index: number; at_risk_count: number };
        line_shift: Record<string, number>;
      };
    }[];
  };

  const tick = fixture.state;
  const expected = fixture.expected as {
    xt_samples: number[][];
    pitch_control: { nla_territory_pct: number; mcs_territory_pct: number; neutral_pct?: number };
    passing_network: {
      from_id: string; to_id: string; team: string;
      xt_weight: number; distance_m: number;
      from_xy: { x: number; y: number }; to_xy: { x: number; y: number };
    }[];
    bio_load: {
      id: string;
      profile: {
        sprint_load_index: number; projected_stamina_10m: number;
        fatigue_pdr_penalty: number; high_intensity_seconds: number;
        press_seconds: number; stamina_now: number; relief_required: boolean;
        tactical_relief_directive: string;
      };
    }[];
    bio_load_summary: { mean_sprint_load_index: number; at_risk_count: number };
    line_shift: Record<string, Record<string, number>>;
    simulated_pitch_control: {
      player_id: string; x: number; y: number;
      split: { nla_territory_pct: number; mcs_territory_pct: number };
    }[];
  };

  // --- xT at 192 grid points, both attacking directions ------------------
  let xtMismatches: string[] = [];
  for (const [x, y, nla, mcs] of expected.xt_samples as number[][]) {
    const tNla = calculateXTAtCoord("NLA", x, y);
    const tMcs = calculateXTAtCoord("MCS", x, y);
    if (Math.abs(tNla - nla) > 1e-6) {
      xtMismatches.push(`NLA(${x},${y}) twin=${tNla} py=${nla}`);
    }
    if (Math.abs(tMcs - mcs) > 1e-6) {
      xtMismatches.push(`MCS(${x},${y}) twin=${tMcs} py=${mcs}`);
    }
  }
  check(
    "Parity: the twin's xT surface equals the Python engine's at every grid point",
    xtMismatches.length === 0,
    xtMismatches.length === 0
      ? `${(expected.xt_samples as number[][]).length} points x 2 directions`
      : xtMismatches.slice(0, 4).join("; "),
  );

  // --- the pitch-control split -------------------------------------------
  const pc = computePitchControlSplit(tick);
  const pcExpected = expected.pitch_control;
  check(
    "Parity: the twin's pitch-control split equals the Python engine's",
    Math.abs(pc.nla_territory_pct - pcExpected.nla_territory_pct) < 1e-6
    && Math.abs(pc.mcs_territory_pct - pcExpected.mcs_territory_pct) < 1e-6
    && Math.abs((pc.neutral_pct ?? 0) - (pcExpected.neutral_pct ?? 0)) < 1e-6,
    `twin nla=${pc.nla_territory_pct} py=${pcExpected.nla_territory_pct}`,
  );

  // --- the passing network, in the same order -----------------------------
  const net = computePassingNetworkEdges(tick);
  const netExpected = expected.passing_network as {
    from_id: string; to_id: string; team: string;
    xt_weight: number; distance_m: number;
    from_xy: { x: number; y: number }; to_xy: { x: number; y: number };
  }[];
  const netMismatch: string[] = [];
  if (net.length !== netExpected.length) {
    netMismatch.push(`count twin=${net.length} py=${netExpected.length}`);
  }
  for (let i = 0; i < Math.min(net.length, netExpected.length); i += 1) {
    const a = net[i];
    const b = netExpected[i];
    if (a.from_id !== b.from_id || a.to_id !== b.to_id || a.team !== b.team
      || Math.abs(a.xt_weight - b.xt_weight) > 1e-6
      || Math.abs(a.distance_m - b.distance_m) > 1e-6
      || Math.abs(a.from_xy.x - b.from_xy.x) > 1e-6
      || Math.abs(a.to_xy.y - b.to_xy.y) > 1e-6) {
      netMismatch.push(
        `#${i} twin=${a.from_id}->${a.to_id}@${a.xt_weight} `
        + `py=${b.from_id}->${b.to_id}@${b.xt_weight}`,
      );
    }
  }
  check(
    "Parity: the twin's passing network equals the Python engine's, in the same order",
    netMismatch.length === 0,
    netMismatch.length === 0
      ? `${net.length} edges`
      : netMismatch.slice(0, 4).join("; "),
  );

  // --- the per-player bio-load profiles ----------------------------------
  let bioMismatch: string[] = [];
  for (const { id, profile } of expected.bio_load as {
    id: string;
    profile: {
      sprint_load_index: number; projected_stamina_10m: number;
      fatigue_pdr_penalty: number; high_intensity_seconds: number;
      press_seconds: number; stamina_now: number; relief_required: boolean;
      tactical_relief_directive: string;
    };
  }[]) {
    const p = tick.players.find((pl) => pl.id === id);
    if (!p) {
      bioMismatch.push(`${id} missing from the tick`);
      continue;
    }
    const twin = computeBioLoadProfile({
      number: p.number,
      role: p.role,
      stamina: p.stamina,
      bioLoad: profile.sprint_load_index,
      highIntensitySeconds: profile.high_intensity_seconds,
      pressSeconds: profile.press_seconds,
    });
    for (const field of [
      "sprint_load_index", "projected_stamina_10m", "fatigue_pdr_penalty",
      "high_intensity_seconds", "stamina_now",
    ] as const) {
      if (Math.abs(twin[field] - profile[field]) > 1e-6) {
        bioMismatch.push(`${id}.${field} twin=${twin[field]} py=${profile[field]}`);
      }
    }
    if (twin.relief_required !== profile.relief_required) {
      bioMismatch.push(`${id}.relief_required twin=${twin.relief_required} py=${profile.relief_required}`);
    }
    if (twin.tactical_relief_directive !== profile.tactical_relief_directive) {
      bioMismatch.push(`${id}.directive differs`);
    }
  }
  check(
    "Parity: the twin's bio-load profile equals the Python engine's, for every player",
    bioMismatch.length === 0,
    bioMismatch.length === 0
      ? `${(expected.bio_load as unknown[]).length} players`
      : bioMismatch.slice(0, 4).join("; "),
  );

  // --- the collective line shift -----------------------------------------
  const shiftMismatch: string[] = [];
  for (const [key, values] of Object.entries(
    expected.line_shift as Record<string, Record<string, number>>,
  )) {
    const [team, heightText] = key.split("@");
    const twin = evaluateDefensiveLineShift(tick, team as Team, Number(heightText));
    for (const [field, pyValue] of Object.entries(values)) {
      const twinValue = (twin as unknown as Record<string, number>)[field];
      if (typeof twinValue !== "number" || Math.abs(twinValue - pyValue) > 1e-6) {
        shiftMismatch.push(`${key}.${field} twin=${twinValue} py=${pyValue}`);
      }
    }
  }
  check(
    "Parity: the twin's defensive line shift equals the Python engine's",
    shiftMismatch.length === 0,
    shiftMismatch.length === 0
      ? `${Object.keys(expected.line_shift as object).length} shifts`
      : shiftMismatch.slice(0, 4).join("; "),
  );

  // --- the simulated pitch control after a relocation --------------------
  const simMismatch: string[] = [];
  for (const s of expected.simulated_pitch_control as {
    player_id: string; x: number; y: number;
    split: { nla_territory_pct: number; mcs_territory_pct: number };
  }[]) {
    const twin = evaluateSimulatedPitchControl(tick, s.player_id, s.x, s.y);
    if (Math.abs(twin.nla_territory_pct - s.split.nla_territory_pct) > 1e-6
      || Math.abs(twin.mcs_territory_pct - s.split.mcs_territory_pct) > 1e-6) {
      simMismatch.push(
        `${s.player_id} twin=${twin.nla_territory_pct}/${twin.mcs_territory_pct} `
        + `py=${s.split.nla_territory_pct}/${s.split.mcs_territory_pct}`,
      );
    }
  }
  check(
    "Parity: the twin's simulated pitch control equals the Python engine's",
    simMismatch.length === 0,
    simMismatch.length === 0
      ? `${(expected.simulated_pitch_control as unknown[]).length} relocations`
      : simMismatch.slice(0, 3).join("; "),
  );

  // --- the fixture itself must be a real scenario, not an empty one ------
  check(
    "Parity: the fixture is a real scenario, not an empty one",
    tick.players.length === 22
    && (expected.xt_samples as unknown[]).length === 192
    && (expected.passing_network as unknown[]).length > 0
    && (expected.bio_load as unknown[]).length === 22,
    `${tick.players.length} players, ${(expected.xt_samples as unknown[]).length} xt points`,
  );

  // --- the archetype classifier and the narrative atlas ------------------
  // The twin used to classify archetypes with its own conditions and had no
  // `inversion` branch, and it produced English sentences with a translated
  // prefix. The same event must be told the same story, in the same four
  // languages, whether the backend or the twin is answering.
  const archetypeMatrix: {
    event: { type?: string; scenario?: string | null; pdr?: number | null; delta_xt?: number | null };
    metrics?: { chaos_state?: string } | null;
  }[] = [
    { event: { scenario: "chaos_counter" } },
    { event: { scenario: "high_press_turnover" } },
    { event: { type: "PRESSURE_TRAP" } },
    { event: { scenario: "tactical_inversion" } },
    { event: { type: "TACTICAL_INVERSION" } },
    { event: { type: "PASS", pdr: 90 } },
    { event: { type: "SHOT", pdr: 95 } },
    { event: { type: "CLEARANCE", pdr: 95 } },
    { event: { type: "PASS", pdr: 40, delta_xt: 0.1 } },
    { event: { type: "PASS", pdr: 40 }, metrics: { chaos_state: "HIGH CHAOS TRANSITION" } },
    { event: { type: "PASS", pdr: 40 } },
    { event: {} },
  ];
  const expectedArchetypes = [
    "counter_overload", "pressing_trap", "pressing_trap",
    "inversion", "inversion",
    "difficult_progression", "difficult_progression",
    "rhythm_shift",
    "threat_surge",
    "counter_overload",
    "rhythm_shift",
    "rhythm_shift",
  ];
  const archetypeMismatch: string[] = [];
  archetypeMatrix.forEach((row, i) => {
    const got = classifyArchetype(row.event, row.metrics);
    if (got !== expectedArchetypes[i]) {
      archetypeMismatch.push(`#${i} twin=${got} expected=${expectedArchetypes[i]}`);
    }
  });
  check(
    "Parity: the twin's archetype classifier matches the engine's, branch for branch",
    archetypeMismatch.length === 0,
    archetypeMismatch.length === 0
      ? `${archetypeMatrix.length} branches`
      : archetypeMismatch.join("; "),
  );
  check(
    "Parity: the classifier reaches every archetype, including the inversion",
    new Set(expectedArchetypes).size === 6
    && expectedArchetypes.includes("inversion"),
    `${new Set(expectedArchetypes).size} of 6 archetypes reached`,
  );

  // The narrative atlas must be a genuine translation, not English with a
  // translated prefix, and every archetype must have all four languages.
  const atlasProblems: string[] = [];
  const values = { team: "NLA", opp: "MCS", player: "D. Keswick", speed: 31.6 };
  for (const arch of ARCHETYPES) {
    const story = STORIES[arch];
    if (!story || story.length < 40) {
      atlasProblems.push(`${arch} story is missing or too short`);
    }
    for (const lang of ["es", "ar", "hi"] as const) {
      const t = TRANSLATIONS[arch][lang];
      if (!t || t.length < 20) {
        atlasProblems.push(`${arch}.${lang} is missing or too short`);
        continue;
      }
      if (t === story) atlasProblems.push(`${arch}.${lang} is English passthrough`);
      // A genuine translation is not the English sentence with a short
      // prefix glued on: the shared word count has to be low.
      const shared = story
        .split(/\s+/)
        .filter((w) => w.length > 3 && t.includes(w)).length;
      if (shared > story.split(/\s+/).length * 0.5) {
        atlasProblems.push(`${arch}.${lang} is mostly the English sentence`);
      }
      // Rendered, it must have no placeholder left behind.
      const renderedLang = fillTemplate(t, values);
      if (/\{(team|opp|player|speed)[^}]*\}/.test(renderedLang)) {
        atlasProblems.push(`${arch}.${lang} leaves a placeholder unsubstituted`);
      }
    }
    const renderedStory = fillTemplate(story, values);
    if (/\{(team|opp|player|speed)[^}]*\}/.test(renderedStory)) {
      atlasProblems.push(`${arch} story leaves a placeholder unsubstituted`);
    }
  }
  check(
    "Parity: every archetype has a genuine translation in all four languages",
    atlasProblems.length === 0,
    atlasProblems.length === 0
      ? `${ARCHETYPES.length} archetypes x 3 market languages`
      : atlasProblems.slice(0, 4).join("; "),
  );

  // The rendered story must be substituted and must not be the raw template.
  const rendered = fillTemplate(STORIES.counter_overload, {
    team: "NLA", opp: "MCS", player: "D. Keswick", speed: 31.6,
  });
  check(
    "Parity: the rendered story substitutes every placeholder",
    rendered.includes("NLA")
    && rendered.includes("32 km/h")
    && !/\{(team|opp|player|speed)/.test(rendered),
    rendered.slice(0, 80),
  );

  // --- the two atlases must be byte-identical ----------------------------
  // The twin and the engine tell the same story. If the copies drift, a
  // judge reads a different narrative online than offline.
  const atlas = (fixture as { atlas?: { stories: Record<string, string>; translations: Record<string, Record<string, string>> } }).atlas;
  check("Parity: the fixture carries the narrative atlas", !!atlas);
  if (atlas) {
    const atlasProblems: string[] = [];
    for (const [arch, story] of Object.entries(atlas.stories)) {
      if (STORIES[arch as keyof typeof STORIES] !== story) {
        atlasProblems.push(`${arch} story differs`);
      }
      for (const [lang, text] of Object.entries(
        atlas.translations[arch] ?? {},
      )) {
        if (TRANSLATIONS[arch as keyof typeof TRANSLATIONS]?.[lang] !== text) {
          atlasProblems.push(`${arch}.${lang} differs`);
        }
      }
    }
    for (const arch of ARCHETYPES) {
      if (!(arch in atlas.stories)) atlasProblems.push(`${arch} missing from the engine atlas`);
    }
    check(
      "Parity: the twin's narrative atlas is identical to the engine's",
      atlasProblems.length === 0,
      atlasProblems.length === 0
        ? `${Object.keys(atlas.stories).length} archetypes x 4 languages`
        : atlasProblems.slice(0, 4).join("; "),
    );
  }

  // --- the boundary matrix -----------------------------------------------
  // The happy path is not enough. A twin that agrees on a full 22-player
  // state can still disagree on a degenerate one - and degenerate states are
  // exactly what a judge triggers by dragging a player off the pitch.
  const edgeCases = (fixture as {
    edge_cases?: {
      name: string;
      state: MatchTick;
      expected: {
        pitch_control: { nla_territory_pct: number; mcs_territory_pct: number; neutral_pct?: number };
        passing_network: { from_id: string; to_id: string; team: string; xt_weight: number }[];
        bio_load_summary: { mean_sprint_load_index: number; at_risk_count: number };
        line_shift: Record<string, number>;
      };
    }[];
  }).edge_cases ?? [];

  const edgeProblems: string[] = [];
  for (const edge of edgeCases) {
    const eTick = edge.state;
    const eExpected = edge.expected;

    const ePc = computePitchControlSplit(eTick);
    if (Math.abs(ePc.nla_territory_pct - eExpected.pitch_control.nla_territory_pct) > 1e-6
      || Math.abs(ePc.mcs_territory_pct - eExpected.pitch_control.mcs_territory_pct) > 1e-6) {
      edgeProblems.push(
        `${edge.name}: pitch control twin=${ePc.nla_territory_pct}/`
        + `${ePc.mcs_territory_pct} py=${eExpected.pitch_control.nla_territory_pct}/`
        + `${eExpected.pitch_control.mcs_territory_pct}`,
      );
    }

    const eNet = computePassingNetworkEdges(eTick);
    if (eNet.length !== eExpected.passing_network.length) {
      edgeProblems.push(
        `${edge.name}: network count twin=${eNet.length} py=${eExpected.passing_network.length}`,
      );
    } else {
      for (let i = 0; i < eNet.length; i += 1) {
        if (eNet[i].from_id !== eExpected.passing_network[i].from_id
          || eNet[i].to_id !== eExpected.passing_network[i].to_id
          || Math.abs(eNet[i].xt_weight - eExpected.passing_network[i].xt_weight) > 1e-6) {
          edgeProblems.push(
            `${edge.name}: network #${i} twin=${eNet[i].from_id}->${eNet[i].to_id} `
            + `py=${eExpected.passing_network[i].from_id}->${eExpected.passing_network[i].to_id}`,
          );
          break;
        }
      }
    }

    const eBio = computeBioLoadSummary(eTick);
    if (Math.abs(eBio.mean_sprint_load_index - eExpected.bio_load_summary.mean_sprint_load_index) > 1e-6
      || eBio.at_risk_count !== eExpected.bio_load_summary.at_risk_count) {
      edgeProblems.push(
        `${edge.name}: bio-load twin=${eBio.mean_sprint_load_index}/`
        + `${eBio.at_risk_count} py=${eExpected.bio_load_summary.mean_sprint_load_index}/`
        + `${eExpected.bio_load_summary.at_risk_count}`,
      );
    }

    const eShift = evaluateDefensiveLineShift(eTick, "NLA", 40);
    for (const [field, pyValue] of Object.entries(eExpected.line_shift)) {
      const twinValue = (eShift as unknown as Record<string, number>)[field];
      if (typeof twinValue !== "number" || Math.abs(twinValue - pyValue) > 1e-6) {
        edgeProblems.push(`${edge.name}: line shift ${field} twin=${twinValue} py=${pyValue}`);
      }
    }
  }
  check(
    "Parity: the twin matches the engine on the degenerate states too",
    edgeCases.length > 0 && edgeProblems.length === 0,
    edgeProblems.length === 0
      ? `${edgeCases.length} boundary cases: ${edgeCases.map((e) => e.name).join(", ")}`
      : edgeProblems.slice(0, 4).join("; "),
  );

  // --- the plain-language layer ------------------------------------------
  // A fan-facing label that uses a technical term must be explainable in
  // plain English. This scans the fan-facing HUD for technical labels and
  // fails if any of them is missing from the glossary, so nothing can ship
  // unexplained.
  {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const SRC = path.resolve(process.cwd(), "src");

    // The terms a fan would not use on a Saturday morning.
    const TECHNICAL = [
      "xT", "Expected Threat", "PDR", "PPDA", "Bio-Load", "bio-load",
      "Chaos Index", "Pitch Control", "Ghost", "Defline", "Territory",
      "Cognitive Telemetry", "God Mode", "AI GATE", "Tactical Inversion",
      "Sprint Load Index", "High Intensity", "Press Seconds",
      "Compactness Area", "Offside Trap", "Press Compression",
      "Line Cohesion", "Through Ball Exposure", "Target Zones",
      "Pressing Intensity", "Sprinters", "Completion Probability",
    ];

    const read = (p: string): string => fs.readFileSync(p, "utf8");

    // The fan-facing surfaces: what a fan reads on the overlay.
    const FAN_SURFACES = [
      "hud/TopBar.tsx", "hud/BottomDock.tsx", "hud/LeftRail.tsx",
      "hud/ProductionPanel.tsx", "hud/DefensiveLineScrubber.tsx",
      "hud/CounterfactualDeltaHUD.tsx", "hud/RightDock.tsx",
      "ScoreBug.tsx", "TacticalPulseBar.tsx", "LiveCaptionStrip.tsx",
      "TwinCastHUD.tsx", "PlayerLock360.tsx", "VisionAutoEventerHUD.tsx",
      "FanPersonalizationTuner.tsx",
    ];

    // The glossary is written in the case the studio renders it, but a label
    // in the source may be in any case, so the lookup is case-insensitive.
    const explained = new Set(Object.keys(TERMS).map((k) => k.toUpperCase()));
    const unexplained: string[] = [];
    let scanned = 0;
    for (const rel of FAN_SURFACES) {
      const full = path.join(SRC, "components", rel);
      if (!fs.existsSync(full)) continue;
      const src = read(full);
      // A fan-facing label is either JSX text or a string in a label table
      // (TwinCastHUD keeps its metrics in `rows` arrays). Both count.
      const labels: string[] = [];
      for (const m of src.matchAll(/>([^<>{}]+)</g)) {
        const t = m[1].replace(/\s+/g, " ").trim();
        if (t.length >= 2 && t.length <= 80 && /[A-Za-z]/.test(t)) labels.push(t);
      }
      for (const m of src.matchAll(/"([A-Za-z][^"\\]{2,60})"/g)) {
        const t = m[1].replace(/\s+/g, " ").trim();
        if (t.length >= 2 && t.length <= 80) labels.push(t);
      }
      for (const label of labels) {
        const hit = TECHNICAL.find((t) => label.toUpperCase().includes(t.toUpperCase()));
        if (!hit) continue;
        scanned += 1;
        // The label itself may be the explained term ("Cognitive Telemetry
        // Density"), or the jargon fragment it contains may be.
        const labelKey = label.toUpperCase();
        const covered = explained.has(hit.toUpperCase())
          || Object.keys(TERMS).some((k) => k.toUpperCase() === labelKey)
          || Object.keys(TERMS).some(
            (k) => k.toUpperCase().startsWith(hit.toUpperCase()),
          );
        if (!covered) unexplained.push(`${rel}: "${label}"`);
      }
    }
    check(
      "Plain language: every technical label a fan reads has a plain-English reading",
      unexplained.length === 0 && scanned > 0,
      unexplained.length === 0
        ? `${scanned} technical labels scanned, ${Object.keys(TERMS).length} terms explained`
        : unexplained.slice(0, 5).join("; "),
    );

    // Every term must actually be a real explanation, not a repeat of the
    // technical word. A term that is already plain English ("Pass accuracy")
    // is allowed to read as itself; a genuine piece of jargon is not.
    const badTerms: string[] = [];
    for (const [term, meta] of Object.entries(TERMS)) {
      if (!meta.plain || meta.plain.length < 3) badTerms.push(`${term} has no plain reading`);
      if (!meta.detail || meta.detail.length < 25) badTerms.push(`${term} has no explanation`);
      if (meta.detail.includes("{")) badTerms.push(`${term} leaves a placeholder in the explanation`);
      const isJargon = TECHNICAL.some((t) => t.toUpperCase() === term.toUpperCase());
      if (isJargon && meta.plain.toUpperCase() === term.toUpperCase()) {
        badTerms.push(`${term} is jargon and was not simplified`);
      }
    }
    check(
      "Plain language: every explanation is a real sentence a fan could read",
      badTerms.length === 0,
      badTerms.length === 0
        ? `${Object.keys(TERMS).length} explanations`
        : badTerms.slice(0, 5).join("; "),
    );

    // The glossary must be grouped and complete.
    const sheet = glossary();
    check(
      "Plain language: the glossary covers every term and is grouped for reading",
      sheet.length >= 30
      && new Set(sheet.map((e) => e.group)).size === 5
      && sheet.every((e) => e.plain && e.detail),
      `${sheet.length} entries in ${new Set(sheet.map((e) => e.group)).size} groups`,
    );

    // The plain layer is for the fan. The analyst panels - the Pipeline
    // Inspector, the Rubric Verifier, the war-room, the dossier - must keep
    // the analyst terms, or a judge is shown a simplified version of the
    // very thing they are being asked to assess.
    const ANALYST_PANELS = [
      "PipelineInspector.tsx",
      "RubricVerifierModal.tsx",
      "StudioProducer.tsx",
      "MatchRecapStudioModal.tsx",
    ];
    const simplified: string[] = [];
    for (const name of ANALYST_PANELS) {
      const full = path.join(SRC, "components", name);
      if (!fs.existsSync(full)) continue;
      if (read(full).includes("MetricLabel")) simplified.push(name);
    }
    check(
      "Plain language: the analyst panels keep the analyst terms",
      simplified.length === 0,
      simplified.length === 0
        ? `${ANALYST_PANELS.length} panels untouched`
        : simplified.join(", "),
    );
  }

  // --- the right-hand column shares one gutter ---------------------------
  // The Control Center is a drawer under the top bar. If its right edge
  // uses a different gutter than the bar above it, the drawer visibly sits
  // out from under the bar on some breakpoints. The right column is: the
  // top bar container, the scenario chip and the drawer itself.
  {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const SRC = path.resolve(process.cwd(), "src");

    // Tailwind's breakpoint order. A value set at a breakpoint also applies
    // to every larger one, so the comparison has to resolve the cascade
    // rather than compare the raw tokens.
    const BP_ORDER = ["base", "sm", "md", "lg", "xl"];

    /** The right-edge gutter at each breakpoint, as declared. */
    const rightGutters = (className: string): Map<string, string> => {
      const out = new Map<string, string>();
      for (const m of className.matchAll(
        /(?:([a-z]{2}):)?\s*(?:inset-x-|right-)(\d+)/g,
      )) {
        out.set(m[1] ?? "base", `right-${m[2]}`);
      }
      return out;
    };

    /** The gutter actually in force at a breakpoint, cascade resolved. */
    const effective = (entries: Map<string, string>, bp: string): string | undefined => {
      const limit = BP_ORDER.indexOf(bp);
      if (limit < 0) return undefined;
      let value: string | undefined;
      for (let i = 0; i <= limit; i += 1) {
        const v = entries.get(BP_ORDER[i]);
        if (v) value = v;
      }
      return value;
    };

    const pageSrc = fs.readFileSync(path.join(SRC, "app", "page.tsx"), "utf8");
    const dockSrc = fs.readFileSync(path.join(SRC, "components", "hud", "RightDock.tsx"), "utf8");

    // The top bar's container: the element the drawer hangs under.
    const topBarContainer = /absolute inset-x-2 top-2[^"]*"/.exec(pageSrc);
    // The drawer's own panel.
    const drawerPanel = /clip-ea panel-lux animate-slide-up[^"]*"/.exec(dockSrc);
    // The scenario chip, which shares the same column.
    const scenarioChip = /absolute right-2 top-\[62px\][^"]*"/.exec(pageSrc);

    if (!topBarContainer || !drawerPanel || !scenarioChip) {
      check("Alignment: the right column shares one gutter", false,
        "could not find the top bar, the drawer or the scenario chip");
    } else {
      const bar = rightGutters(topBarContainer[0]);
      const drawer = rightGutters(drawerPanel[0]);
      const chip = rightGutters(scenarioChip[0]);

      const misaligned: string[] = [];
      for (const bp of BP_ORDER) {
        if (bp === "base") continue; // the base is the mobile bottom sheet
        const barValue = effective(bar, bp);
        const drawerValue = effective(drawer, bp);
        if (barValue && drawerValue && barValue !== drawerValue) {
          misaligned.push(`drawer ${bp}: ${drawerValue} vs top bar ${barValue}`);
        }
        const chipValue = effective(chip, bp);
        if (chipValue && drawerValue && chipValue !== drawerValue) {
          misaligned.push(`scenario chip ${bp}: ${chipValue} vs drawer ${drawerValue}`);
        }
      }
      check(
        "Alignment: the right column shares one gutter",
        misaligned.length === 0,
        misaligned.length === 0
          ? `top bar ${[...bar.values()].join("/")}, drawer ${[...drawer.values()].join("/")}`
          : misaligned.join("; "),
      );

      // The drawer must start below the top bar, not over it, and not at a
      // magic number that drifts from the bar's height.
      const barHeight = 52; // the top bar panel is h-[52px]
      const barTop = bar.size && /\btop-2\b/.test(topBarContainer[0]) ? 8 : 12;
      const drawerTop = Number(/sm:top-\[(\d+)px\]/.exec(drawerPanel[0])?.[1] ?? 0);
      check(
        "Alignment: the drawer starts just below the top bar",
        drawerTop > barTop + barHeight && drawerTop <= barTop + barHeight + 8,
        `bar ends at ${barTop + barHeight}px, drawer starts at ${drawerTop}px`,
      );
    }
  }
}

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
