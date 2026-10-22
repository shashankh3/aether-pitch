import type {
  AgentTrace, MatchEvent, MatchMetadata, MatchTick, Metrics, PlayStyleBadge, PoseState,
  Role, Team, TeamStats,
} from "../types";
import type { Archetype } from "../narrativeAtlas";

export const PITCH_L = 105;
export const PITCH_W = 68;
export const BIO_LOAD_RECOVERY_TAU_S = 150;

export function buildEdgeTrace(
  event: MatchEvent,
  tick: MatchTick,
  metrics: Metrics,
  archetype: string,
  pdr: number,
  dxt: number,
  ghost: MatchEvent["ghost_pass"],
  seq: number,
): AgentTrace {
  const gate = event.ai_gate ?? { should_explain: true, reasons: ["edge fallback event"] };
  const deltaChaos = event.delta_chaos ?? metrics.delta_chaos;
  const ticks = Math.max(1, Math.round(tick.t_match * 10));
  const ghostDelta = ghost?.delta_xt ?? null;
  return {
    trace_id: `trace_edge_${String(seq).padStart(4, "0")}`,
    event_id: event.id,
    anchor_clock: tick.clock,
    created_at: new Date().toISOString(),
    mode: "edge",
    archetype,
    model: "edge-autonomous-engine-v5",
    gate: {
      should_explain: gate.should_explain,
      reasons: gate.reasons ?? [],
      pdr,
      delta_xt: dxt,
      delta_chaos: deltaChaos,
    },
    handoff_chain: [
      {
        id: "sentinel",
        agent: "Spatial Sentinel",
        role: "Deterministic gate",
        status: "completed",
        latency_ms: 0,
        summary: `PDR ${pdr.toFixed(0)}% · ΔxT ${dxt >= 0 ? "+" : ""}${dxt.toFixed(2)} · ΔChaos ${deltaChaos >= 0 ? "+" : ""}${deltaChaos.toFixed(2)}`,
        detail: gate.reasons?.join("; ") || "Edge threshold gate",
      },
      {
        id: "triage",
        agent: "Tactical Triage",
        role: "Archetype router",
        status: "fallback",
        latency_ms: 0,
        summary: archetype.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        detail: "Browser-native local router",
      },
      {
        id: "analyst",
        agent: "Causal Analyst + Critic",
        role: "Narrative + numeric critic",
        status: "fallback",
        latency_ms: 0,
        summary: "Deterministic edge template · 100% grounded",
        detail: ghostDelta != null
          ? `Ghost lane ${ghostDelta >= 0 ? "+" : ""}${ghostDelta.toFixed(2)} xT vs actual ${dxt >= 0 ? "+" : ""}${dxt.toFixed(2)} xT.`
          : "No higher-value ghost lane in the edge scan.",
      },
      {
        id: "director",
        agent: "Broadcast Director",
        role: "Overlay + camera + i18n",
        status: "completed",
        latency_ms: 0,
        summary: "Tactical pulse · auto camera · 4 languages",
        detail: "Edge render contract active while the backend reconnects.",
      },
    ],
    grounding: {
      status: "fallback_verified",
      score: 1,
      checked_numbers: 0,
      unmatched_numbers: [],
      source: "deterministic_edge_template",
      note: "Edge templates are generated from the browser simulation snapshot.",
    },
    compute: {
      considered_events: seq,
      gated_events: seq,
      filtered_events: 0,
      filter_ratio: 0,
      ticks,
      insights: seq,
      ticks_per_insight: Number((ticks / Math.max(1, seq)).toFixed(1)),
    },
    languages: ["en", "es", "ar", "hi"],
  };
}

export const EDGE_MATCH_METADATA: MatchMetadata = {
  match_id: "SYN-PL-2026-1019-NLA-MCS",
  competition: "AETHER Synthetic League",
  season: "2026/27",
  matchday: 9,
  venue: "Aether Arena",
  city: "Synthetic City",
  kickoff_utc: "2026-10-19T19:45:00Z",
  home_team: {
    id: "NLA", name: "North Larchmont Athletic", short_name: "NLA", kit: "crimson/gold",
  },
  away_team: {
    id: "MCS", name: "Meridian City SC", short_name: "MCS", kit: "cyan/navy",
  },
  data_source: "AETHER edge fallback engine",
  synthetic: true,
  disclaimer: "All clubs, players, crests and tracking samples are fictional.",
};

export interface EdgePlayer {
  id: string;
  team: Team;
  number: number;
  name: string;
  role: Role;
  baseX: number;
  baseY: number;
  maxSpeed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  speedKmh: number;
  stamina: number;
  distanceM: number;
  sprintDistanceM: number;
  topSpeedKmh: number;
  nextDistanceAlertM: number;
  pose: PoseState;
  badge: PlayStyleBadge | null;
  bioLoad: number;
  highIntensitySeconds: number;
  pressSeconds: number;
}

export interface Flight {
  from: [number, number];
  to: [number, number];
  fromId: string;
  toId: string;
  fromName: string;
  passSeq: number;
  elapsed: number;
  duration: number;
  speedKmh: number;
  distance: number;
  lofted: boolean;
}

export const EDGE_STAT_BASELINE: Record<Team, Omit<TeamStats, "pass_accuracy" | "shot_accuracy" | "possession_pct" | "distance_km" | "sprint_distance_km" | "goals">> = {
  NLA: {
    passes: 431, passes_completed: 368, shots: 12, shots_on_target: 6,
    tackles: 15, turnovers_won: 9,
  },
  MCS: {
    passes: 398, passes_completed: 339, shots: 9, shots_on_target: 4,
    tackles: 17, turnovers_won: 7,
  },
};

export const SQUADS: { team: Team; rows: [number, string, Role, number, number, number][] }[] = [
  {
    team: "NLA",
    rows: [
      [31, "A. Mercer", "GK", 0.045, 34.0, 6.4],
      [2, "D. Keswick", "DEF", 0.24, 57.0, 8.2],
      [5, "M. Okonjo", "DEF", 0.20, 43.5, 8.0],
      [6, "L. Brandt", "DEF", 0.20, 24.5, 8.1],
      [3, "R. Salcedo", "DEF", 0.24, 11.0, 8.3],
      [8, "T. Almeida", "MID", 0.36, 42.0, 7.9],
      [16, "K. Nwosu", "MID", 0.36, 26.0, 8.0],
      [7, "J. Ardaiz", "MID", 0.55, 56.0, 8.7],
      [10, "S. Marchetti", "MID", 0.52, 34.0, 8.2],
      [11, "E. Toussaint", "MID", 0.55, 12.0, 8.6],
      [9, "V. Sorensen", "FWD", 0.76, 34.0, 8.6],
    ],
  },
  {
    team: "MCS",
    rows: [
      [31, "P. Vantera", "GK", 0.045, 34.0, 6.4],
      [2, "K. Whitmore", "DEF", 0.24, 57.0, 8.2],
      [4, "R. Steiner", "DEF", 0.20, 43.5, 8.0],
      [5, "J. Mensah", "DEF", 0.20, 24.5, 8.2],
      [24, "T. Okafor", "DEF", 0.24, 11.0, 8.3],
      [16, "H. Alvarez", "MID", 0.36, 42.0, 7.9],
      [22, "N. Petrov", "MID", 0.36, 26.0, 8.0],
      [7, "C. Ambrose", "MID", 0.55, 56.0, 8.7],
      [20, "F. Delacroix", "MID", 0.52, 34.0, 8.2],
      [11, "S. Ibarra", "MID", 0.55, 12.0, 8.6],
      [19, "B. Kovac", "FWD", 0.68, 34.0, 8.7],
    ],
  },
];

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function clockOf(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The 16x12 Expected Threat surface — the browser twin of the Stage B grid.
 *
 * It is built with the same formula, the same cell centres and the same
 * normalisation as `TacticalMathEngine._build_xt_grid`, so the browser and
 * the server produce numerically identical xT. That is what lets the
 * interactive sandbox show a delta and then hand the same scenario to the
 * backend arbiter without the numbers moving.
 */
export const XT_COLS = 16;
export const XT_ROWS = 12;
export const XT_MIN = 0.004;
export const XT_MAX = 0.35;

const XT_GRID: number[][] = (() => {
  const grid: number[][] = [];
  let gmin = Infinity;
  let gmax = -Infinity;
  for (let r = 0; r < XT_ROWS; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < XT_COLS; c += 1) {
      const cx = (c + 0.5) * (PITCH_L / XT_COLS);
      const cy = (r + 0.5) * (PITCH_W / XT_ROWS);
      const dGoal = Math.hypot(PITCH_L - cx, 34 - cy);
      const dCentral = Math.abs(cy - 34);
      const v = 0.35 * Math.exp(-dGoal / 30) + 0.05 * Math.exp(-dCentral / 18);
      row.push(v);
      if (v < gmin) gmin = v;
      if (v > gmax) gmax = v;
    }
    grid.push(row);
  }
  for (let r = 0; r < XT_ROWS; r += 1) {
    for (let c = 0; c < XT_COLS; c += 1) {
      grid[r][c] = XT_MIN + ((grid[r][c] - gmin) / (gmax - gmin)) * (XT_MAX - XT_MIN);
    }
  }
  return grid;
})();

export function xtValue(team: Team, x: number, y: number): number {
  const xs = team === "NLA" ? x : PITCH_L - x;
  // Corrupt telemetry is out of play: it reads as the minimum-threat cell,
  // identical to the Stage B engine, instead of poisoning a sandbox delta.
  if (!Number.isFinite(xs) || !Number.isFinite(y)) return XT_MIN;
  const fx = clamp(xs / PITCH_L * XT_COLS - 0.5, 0, XT_COLS - 1.001);
  const fy = clamp(y / PITCH_W * XT_ROWS - 0.5, 0, XT_ROWS - 1.001);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, XT_COLS - 1);
  const y1 = Math.min(y0 + 1, XT_ROWS - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = XT_GRID[y0][x0] * (1 - tx) + XT_GRID[y0][x1] * tx;
  const bot = XT_GRID[y1][x0] * (1 - tx) + XT_GRID[y1][x1] * tx;
  return top * (1 - ty) + bot * ty;
}

export function makeEventId(seq: number): string {
  return `edge_evt_${String(seq).padStart(6, "0")}`;
}

/**
 * The browser twin's archetype classifier.
 *
 * A faithful port of the engine's `pick_archetype`, branch for branch and in
 * the same order. The twin used its own conditions (a TURNOVER meant a
 * counter-attack, any high-PDR event meant a difficult progression) and it
 * had no `inversion` branch at all, so the same event could be told as a
 * different story offline than it was online.
 */
export function classifyArchetype(
    event: { type?: string; scenario?: string | null; pdr?: number | null; delta_xt?: number | null },
    metrics?: { chaos_state?: string } | null,
  ): Archetype {
  const sc = event.scenario ?? null;
  if (sc === "chaos_counter") return "counter_overload";
  if (sc === "high_press_turnover" || event.type === "PRESSURE_TRAP") return "pressing_trap";
  if (sc === "tactical_inversion" || event.type === "TACTICAL_INVERSION") return "inversion";
  if ((event.type === "PASS" || event.type === "SHOT") && (event.pdr ?? 0) > 80) {
    return "difficult_progression";
  }
  if ((event.delta_xt ?? 0) > 0.08) return "threat_surge";
  if (metrics?.chaos_state === "HIGH CHAOS TRANSITION") return "counter_overload";
  return "rhythm_shift";
}
