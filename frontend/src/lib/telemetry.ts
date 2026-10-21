// AETHER PITCH v2.0 — mutable 60fps telemetry store.
// The 10Hz WebSocket stream lands here; R3F components sample it inside
// useFrame with velocity extrapolation, so the 3D scene never re-renders
// React at tick rate.

import type { Insight, MatchMetadata, MatchTick, Metrics } from "./types";

export interface PlayerSample {
  id: string;
  team: "NLA" | "MCS";
  shirt_number: number;
  name: string;
  role: string;
  // previous / current tick snapshots for interpolation
  px: number; py: number; ph: number;
  x: number; y: number; h: number;
  vx: number; vy: number;
  speed_kmh: number;
  stamina: number;
  distance_m: number;
  sprint_distance_m: number;
  top_speed_kmh: number;
  pose_state: string;
  playstyle_badge: string | null;
  prevTickAt: number;
  currTickAt: number;
  kickT0: number;
}

export interface BallSample {
  px: number; py: number; pz: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  speed_kmh: number;
  pass_start: [number, number] | null;
  pass_end: [number, number] | null;
  is_lofted: boolean;
  prevTickAt: number;
  currTickAt: number;
}

export interface GhostSample {
  x: number;
  y: number;
  delta_xt: number;
  actual_delta_xt: number | null;
  target_id: string | null;
  completion_probability: number | null;
  net_xt_gain: number | null;
  at: number;
}

export interface PassLink {
  key: string;
  from: string;
  to: string;
  team: "NLA" | "MCS";
  count: number;
  deltaXt: number;
  start: [number, number] | null;
  end: [number, number] | null;
  lastAt: number;
}

/** One 10Hz snapshot in the 15-second DVR circular buffer. */
export interface MatchSnapshot {
  seq: number;
  t_match: number;
  clock: string;
  tick: MatchTick;
  metrics: Metrics | null;
  insightId: string | null;
  isMarker: boolean;          // high-chaos spike / high-PDR pass on the timeline
}

const HISTORY_CAP = 150; // 15.0 s at 10Hz

class TelemetryStore {
  players = new Map<string, PlayerSample>();
  ball: BallSample = {
    px: 0, py: 0, pz: 0,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    speed_kmh: 0,
    pass_start: null, pass_end: null, is_lofted: false,
    prevTickAt: 0, currTickAt: 0,
  };
  match = {
    t_match: 0,
    clock: "--:--",
    score: { NLA: 0, MCS: 0 },
    possession: "NLA" as "NLA" | "MCS",
    carrier: null as string | null,
    scenario: null as string | null,
    scenario_left: null as number | null,
    metadata: null as MatchMetadata | null,
  };
  metrics: Metrics | null = null;
  insight: Insight | null = null;
  ghost: GhostSample | null = null;
  pdrByPlayer = new Map<string, number>();
  passLinks = new Map<string, PassLink>();

  // ---- v3.0 DVR circular buffer + playback ----
  history: MatchSnapshot[] = [];
  historyVersion = 0;
  playbackPaused = false;
  passReceiver: { id: string; at: number } | null = null;
  telestratorSpotlightIds: string[] = [];

  setPdr(pid: string, pdr: number) {
    this.pdrByPlayer.set(pid, pdr);
  }

  setPassReceiver(id: string | null) {
    this.passReceiver = id ? { id, at: performance.now() } : null;
  }

  recordPassLink(
    from: string,
    to: string,
    team: "NLA" | "MCS",
    start?: [number, number] | null,
    end?: [number, number] | null,
    deltaXt = 0
  ) {
    if (!from || !to || from === to) return;
    const key = [from, to].sort().join("|");
    const existing = this.passLinks.get(key);
    if (existing) {
      existing.count = Math.min(40, existing.count + 1);
      existing.deltaXt += deltaXt;
      existing.lastAt = performance.now();
      if (start) existing.start = start;
      if (end) existing.end = end;
      return;
    }
    this.passLinks.set(key, {
      key, from, to, team, count: 1, deltaXt,
      start: start ?? null, end: end ?? null, lastAt: performance.now(),
    });
    if (this.passLinks.size > 96) {
      const oldest = Array.from(this.passLinks.values())
        .sort((a, b) => a.lastAt - b.lastAt)[0];
      if (oldest) this.passLinks.delete(oldest.key);
    }
  }

  private recordHistory(tick: MatchTick, metrics: Metrics | null) {
    const last = this.history[this.history.length - 1];
    const isMarker =
      (this.metrics ? Math.abs(this.metrics.delta_chaos) > 0.15 : false) ||
      (tick.players.some((p) => p.speed_kmh >= 30));
    if (last) {
      if (tick.t_match < last.t_match - 1.0) {
        this.history = []; // backend clock reset -> start a fresh session
      } else if (Math.abs(tick.t_match - last.t_match) < 0.05) {
        return; // dedupe restarts
      }
    }
    this.history.push({
      seq: this.history.length ? last.seq + 1 : 0,
      t_match: tick.t_match,
      clock: tick.clock,
      tick,
      metrics,
      insightId: this.insight?.id ?? null,
      isMarker,
    });
    if (this.history.length > HISTORY_CAP) this.history.shift();
    this.historyVersion++;
  }

  /** Snapshot at `offsetTicks` back from the newest (0 = newest, -150 = -15s). */
  snapshotAt(offsetTicks: number): MatchSnapshot | null {
    if (!this.history.length) return null;
    const idx = this.history.length - 1 + offsetTicks;
    return this.history[Math.max(0, Math.min(this.history.length - 1, Math.round(idx)))] ?? null;
  }

  /** Apply a historical snapshot to the live scene (DVR scrub / freeze). */
  replay(offsetTicks: number) {
    const snap = this.snapshotAt(offsetTicks);
    if (snap) this.applyTick(snap.tick, false);
  }

  applyTick(tick: MatchTick, record = true) {
    const now = performance.now();
    for (const p of tick.players) {
      const cur = this.players.get(p.id);
      if (!cur) {
        this.players.set(p.id, {
          id: p.id, team: p.team, shirt_number: p.shirt_number,
          name: p.name, role: p.role,
          px: p.x, py: p.y, ph: p.heading_rad,
          x: p.x, y: p.y, h: p.heading_rad,
          vx: p.vx, vy: p.vy,
          speed_kmh: p.speed_kmh, stamina: p.stamina,
          distance_m: p.distance_m, sprint_distance_m: p.sprint_distance_m,
          top_speed_kmh: p.top_speed_kmh,
          pose_state: p.pose_state, playstyle_badge: p.playstyle_badge,
          prevTickAt: now, currTickAt: now, kickT0: 0,
        });
        continue;
      }
      cur.px = cur.x; cur.py = cur.y; cur.ph = cur.h;
      cur.x = p.x; cur.y = p.y; cur.h = p.heading_rad;
      cur.vx = p.vx; cur.vy = p.vy;
      cur.speed_kmh = p.speed_kmh;
      cur.stamina = p.stamina;
      cur.distance_m = p.distance_m;
      cur.sprint_distance_m = p.sprint_distance_m;
      cur.top_speed_kmh = p.top_speed_kmh;
      if (p.pose_state === "KICK" && cur.pose_state !== "KICK") cur.kickT0 = now;
      cur.pose_state = p.pose_state;
      cur.playstyle_badge = p.playstyle_badge;
      cur.prevTickAt = cur.currTickAt;
      cur.currTickAt = now;
    }
    const b = tick.ball;
    const bl = this.ball;
    bl.px = bl.x; bl.py = bl.y; bl.pz = bl.z;
    bl.x = b.x; bl.y = b.y; bl.z = b.z;
    bl.vx = b.vx; bl.vy = b.vy; bl.vz = b.vz;
    bl.speed_kmh = b.speed_kmh;
    bl.pass_start = b.pass_start;
    bl.pass_end = b.pass_end;
    bl.is_lofted = b.is_lofted;
    bl.prevTickAt = bl.currTickAt;
    bl.currTickAt = now;
    if (b.ghost_end) {
      const traceActual = this.insight?.agent_trace?.gate.delta_xt;
      const actual = typeof b.ghost_actual_delta_xt === "number"
        ? b.ghost_actual_delta_xt
        : typeof traceActual === "number" ? traceActual : null;
      this.ghost = {
        x: b.ghost_end[0], y: b.ghost_end[1],
        delta_xt: b.ghost_delta_xt ?? 0.08,
        actual_delta_xt: actual,
        target_id: b.ghost_target_id ?? null,
        completion_probability: b.ghost_completion_probability ?? null,
        net_xt_gain: b.ghost_net_xt_gain ?? null,
        at: now,
      };
    } else {
      this.ghost = null;
    }
    this.match = {
      t_match: tick.t_match,
      clock: tick.clock,
      score: tick.score,
      possession: tick.possession,
      carrier: tick.carrier,
      scenario: tick.scenario,
      scenario_left: tick.scenario_left,
      metadata: tick.match_metadata ?? this.match.metadata,
    };
    if (record) this.recordHistory(tick, this.metrics);
  }

  /** Live stream entry: frozen playback stops the buffer so scrubs stay anchored. */
  recordLive(tick: MatchTick) {
    if (this.playbackPaused) return;
    this.recordHistory(tick, this.metrics);
    this.applyTick(tick, false);
  }

  applyMetrics(m: Metrics) {
    this.metrics = m;
  }

  applyInsight(i: Insight) {
    this.insight = i;
  }

  /** Interpolation factor for a sample: 1.0 = current tick reached, >1 extrapolates. */
  static alpha(s: { prevTickAt: number; currTickAt: number }, now: number): number {
    const span = s.currTickAt - s.prevTickAt || 100;
    return Math.min(1.35, (now - s.currTickAt) / span);
  }
}

export const telemetry = new TelemetryStore();
export const tickAlpha = TelemetryStore.alpha;
