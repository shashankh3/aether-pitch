import type { MatchTick, PitchControlSplit, Team } from "../types";
import { PITCH_L, PITCH_W, XT_COLS, XT_ROWS, clamp, xtValue } from "./core";

/**
 * Expected Threat at a pitch coordinate for a team. This is the public
 * accessor for the same surface the tactical math uses, so the interactive
 * sandbox and the live pipeline can never disagree.
 */
export function calculateXTAtCoord(team: Team, x: number, y: number): number {
  // The same value the Stage B engine returns, to the same precision. It
  // used to round to four decimals here, which made the offline sandbox's
  // what-if baseline differ from the cloud one in the fifth decimal.
  return xtValue(team, x, y);
}

/** Defensive line height bounds (metres from the team's own goal line). */
export const DEF_LINE_MIN_M = 18;
export const DEF_LINE_MAX_M = 52;
/** Midfield compression ratio relative to the backline slide. */
export const DEF_LINE_MIDFIELD_COMPRESSION = 0.45;

/** Area of the convex hull of 2D points (Andrew's monotone chain). */
export function convexHullArea(points: [number, number][]): number {
  const pts = Array.from(new Set(points.map(([x, y]) => [x, y] as [number, number])))
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (pts.length < 3) return 0;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < hull.length; i += 1) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/** How many central pitch-control cells the opposition can still use. */
export function centralUsableCells(
  players: MatchTick["players"],
  defendingTeam: Team,
  overrides?: { playerId: string; x: number; y: number }[],
): number {
  const outfield = players.filter((p) => p.role !== "GK");
  if (!outfield.length) return 0;
  // Every override applies. A collective line shift relocates a whole
  // block, so taking only the first one reported a different answer to the
  // Stage B engine.
  const { nla, mcs } = influenceSurface(outfield, overrides);
  let usable = 0;
  for (let i = 0; i < nla.length; i += 1) {
    const cx = GRID_CX[i];
    if (!(cx >= PITCH_L * 0.33 && cx <= PITCH_L * 0.67)) continue;
    const n = nla[i];
    const m = mcs[i];
    const attacker = defendingTeam === "NLA" ? m : n;
    const defender = defendingTeam === "NLA" ? n : m;
    if (attacker > defender * 1.02) usable += 1;
  }
  return usable;
}

export interface DefensiveLineShift {
  team: Team;
  current_line_height_m: number;
  target_line_height_m: number;
  delta_m: number;
  compactness_area_m2: number;
  compactness_area_after_m2: number;
  through_ball_exposure_xt: number;
  offside_trap_catch_prob_pct: number;
  press_compression_gain_pct: number;
  line_cohesion: number;
  backline_player_ids: string[];
  midfield_player_ids: string[];
}

/**
 * Browser twin of `TacticalMathEngine.evaluate_defensive_line_shift`.
 *
 * The backline unit (four players closest to their own goal) slides as one
 * to the target height, the midfield compresses proportionally, and the
 * consequence is measured on the same 16x12 xT grid and pitch-control
 * attribution the live pipeline uses.
 */
export function evaluateDefensiveLineShift(
  tick: MatchTick,
  team: Team,
  targetLineHeightM: number,
): DefensiveLineShift {
  const target = clamp(targetLineHeightM, DEF_LINE_MIN_M, DEF_LINE_MAX_M);
  const outfield = tick.players.filter((p) => p.team === team && p.role !== "GK");
  if (!outfield.length) {
    return {
      team,
      current_line_height_m: 0,
      target_line_height_m: target,
      delta_m: 0,
      compactness_area_m2: 0,
      compactness_area_after_m2: 0,
      through_ball_exposure_xt: 0,
      offside_trap_catch_prob_pct: 50,
      press_compression_gain_pct: 0,
      line_cohesion: 0,
      backline_player_ids: [],
      midfield_player_ids: [],
    };
  }
  const sign = team === "NLA" ? 1 : -1;
  const depth = (p: { x: number }) => (team === "NLA" ? p.x : PITCH_L - p.x);
  const byDepth = [...outfield].sort((a, b) => depth(a) - depth(b));
  const backline = byDepth.slice(0, 4);
  const midfield = byDepth.slice(4, 8);
  const backlineIds = new Set(backline.map((p) => p.id));
  const midfieldIds = new Set(midfield.map((p) => p.id));
  const currentHeight =
    backline.reduce((sum, p) => sum + depth(p), 0) / Math.max(1, backline.length);
  const delta = target - currentHeight;

  const areaBefore = convexHullArea(outfield.map((p) => [p.x, p.y]));
  const shifted = outfield.map((p) => {
    if (backlineIds.has(p.id)) return { ...p, x: p.x + sign * delta };
    if (midfieldIds.has(p.id)) {
      return { ...p, x: p.x + sign * delta * DEF_LINE_MIDFIELD_COMPRESSION };
    }
    return p;
  });
  const areaAfter = convexHullArea(shifted.map((p) => [p.x, p.y]));

  const opponents = tick.players.filter((p) => p.team !== team && p.role !== "GK");
  let exposure = 0;
  for (const p of opponents) {
    const forward = p.vx * (team === "MCS" ? 1 : -1);
    if (forward <= 0.2) continue;
    const attackerDepth = team === "NLA" ? p.x : PITCH_L - p.x;
    if (attackerDepth >= target) continue;
    const weight = Math.min(1.6, forward / 5);
    exposure += xtValue(team, p.x, p.y) * weight;
  }

  const depths = backline.map((p) => depth(p));
  const cohesion = depths.length
    ? Math.max(0, 1 - (Math.max(...depths) - Math.min(...depths)) / 12)
    : 0;
  let nearestGap = 99;
  for (const p of opponents) {
    nearestGap = Math.min(nearestGap, Math.abs(depth(p) - target));
  }
  const proximity = clamp(1 - nearestGap / 9, 0, 1);
  const logit = 1.35 * proximity + 0.75 * cohesion - 0.9;
  const catchProb = clamp(5 + 90 / (1 + Math.exp(-logit)), 5, 95);

  const centralBefore = centralUsableCells(tick.players, team);
  const centralAfter = centralUsableCells(
    tick.players,
    team,
    shifted.map((p) => ({ playerId: p.id, x: p.x, y: p.y })),
  );
  const pressGain =
    centralBefore <= 0
      ? 0
      : clamp(((centralBefore - centralAfter) / centralBefore) * 100, -100, 100);

  return {
    team,
    current_line_height_m: Number(currentHeight.toFixed(1)),
    target_line_height_m: Number(target.toFixed(1)),
    delta_m: Number(delta.toFixed(1)),
    compactness_area_m2: Number(areaBefore.toFixed(1)),
    compactness_area_after_m2: Number(areaAfter.toFixed(1)),
    through_ball_exposure_xt: Number(exposure.toFixed(4)),
    offside_trap_catch_prob_pct: Number(catchProb.toFixed(1)),
    press_compression_gain_pct: Number(pressGain.toFixed(1)),
    line_cohesion: Number(cohesion.toFixed(3)),
    backline_player_ids: backline.map((p) => p.id),
    midfield_player_ids: midfield.map((p) => p.id),
  };
}

/** Browser-native mirror of the Stage B 16x12 territory attribution. */
/**
 * Cell-centre grid for the 16x12 xT surface, pre-computed once.
 * Flat index `i` maps to row = floor(i / XT_COLS), col = i % XT_COLS.
 */
const GRID_CX = Array.from({ length: XT_ROWS * XT_COLS }, (_, i) =>
  ((i % XT_COLS) + 0.5) * (PITCH_L / XT_COLS),
);
const GRID_CY = Array.from({ length: XT_ROWS * XT_COLS }, (_, i) =>
  (Math.floor(i / XT_COLS) + 0.5) * (PITCH_W / XT_ROWS),
);

/**
 * Per-team influence over the 16x12 grid.
 *
 * Vectorised the same way as the Stage B engine: one flat pass per player
 * with the reach test before the exponential. The browser twin runs at 12 Hz
 * while a judge drags a player, so this is on the critical path for the
 * 60 FPS claim.
 */
function influenceSurface(
    players: MatchTick["players"],
    moved?: { playerId: string; x: number; y: number }[],
  ): { nla: Float64Array; mcs: Float64Array } {
    const cells = XT_ROWS * XT_COLS;
    const nla = new Float64Array(cells);
    const mcs = new Float64Array(cells);
    // Every relocated player is applied, not just the first. The Stage B
    // engine relocates a whole defensive block in one go, so a twin that
    // moved one player reported a different press-compression gain.
    const movedById = new Map<string, { x: number; y: number }>();
    for (const m of moved ?? []) movedById.set(m.playerId, m);
    for (const p of players) {
      if (p.role === "GK") continue;
      const mv = movedById.get(p.id);
      const isMoved = mv !== undefined;
      const px = (isMoved ? (mv as { x: number; y: number }).x : p.x) + p.vx * 0.45;
      const py = (isMoved ? (mv as { x: number; y: number }).y : p.y) + p.vy * 0.45;
    // Corrupt telemetry: the player is absent from the surface, exactly like
    // the Stage B engine — one NaN must not neutralise a team's whole grid.
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const factor = 0.55 + Math.min(0.75, p.speed_kmh / 45);
    const target = p.team === "NLA" ? nla : mcs;
    for (let i = 0; i < cells; i += 1) {
      const dx = GRID_CX[i] - px;
      const dy = GRID_CY[i] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > 400) continue;
      target[i] += Math.exp(-d2 / 144) * factor;
    }
  }
  return { nla, mcs };
}

export function computePitchControlSplit(
  tick: MatchTick,
  override?: { playerId: string; x: number; y: number },
): PitchControlSplit {
  const players = tick.players.filter((p) => p.role !== "GK");
  if (!players.length) {
    return { nla_territory_pct: 50, mcs_territory_pct: 50, neutral_pct: 0 };
  }
    const { nla, mcs } = influenceSurface(players, override ? [override] : undefined);
  let nlaCells = 0;
  let mcsCells = 0;
  let neutral = 0;
  for (let i = 0; i < nla.length; i += 1) {
    const n = nla[i];
    const m = mcs[i];
    if (n > m * 1.02) nlaCells += 1;
    else if (m > n * 1.02) mcsCells += 1;
    else neutral += 1;
  }
  const total = Math.max(1, nlaCells + mcsCells + neutral);
  return {
    nla_territory_pct: Number(((nlaCells / total) * 100).toFixed(1)),
    mcs_territory_pct: Number(((mcsCells / total) * 100).toFixed(1)),
    neutral_pct: Number(((neutral / total) * 100).toFixed(1)),
  };
}

/**
 * Pitch control with one player relocated — the counterfactual the
 * interactive sandbox evaluates.
 */
export function evaluateSimulatedPitchControl(
  tick: MatchTick,
  playerId: string,
  x: number,
  y: number,
): PitchControlSplit {
  return computePitchControlSplit(tick, { playerId, x, y });
}
