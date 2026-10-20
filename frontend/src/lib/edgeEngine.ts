import type {
  MatchEvent, MatchTick, Metrics, Insight, Pipeline, PlayStyleBadge, PoseState,
  Role, Team,
} from "./types";

const PITCH_L = 105;
const PITCH_W = 68;

interface EdgePlayer {
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
  pose: PoseState;
  badge: PlayStyleBadge | null;
}

interface Flight {
  from: [number, number];
  to: [number, number];
  fromId: string;
  toId: string;
  elapsed: number;
  duration: number;
  speedKmh: number;
  lofted: boolean;
}

const SQUADS: { team: Team; rows: [number, string, Role, number, number, number][] }[] = [
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function clockOf(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function xtValue(team: Team, x: number, y: number): number {
  const attackingX = team === "NLA" ? x : PITCH_L - x;
  const central = Math.exp(-Math.abs(y - 34) / 16);
  return 0.015 + 0.62 * Math.exp(-Math.max(0, 105 - attackingX) / 24) * (0.45 + central * 0.55);
}

function makeEventId(seq: number): string {
  return `edge_evt_${String(seq).padStart(6, "0")}`;
}

export class EdgeEngine {
  private players: EdgePlayer[] = [];
  private byId = new Map<string, EdgePlayer>();
  private t = 62 * 60;
  private possession: Team = "NLA";
  private carrierId = "NLA_10";
  private score = { NLA: 1, MCS: 1 };
  private ball = {
    x: 52.5, y: 34, z: 0, vx: 0, vy: 0, vz: 0, speedKmh: 0,
    passStart: null as [number, number] | null,
    passEnd: null as [number, number] | null,
    lofted: false,
    ghostEnd: null as [number, number] | null,
    ghostDelta: null as number | null,
  };
  private flight: Flight | null = null;
  private scenarioName: string | null = null;
  private scenarioLeft = 0;
  private passTimer = 1.1;
  private turnoverTimer = 17;
  private eventSeq = 0;
  private insightSeq = 0;
  private chaos = 0.52;
  private lastChaos = 0.52;
  private chaosHistory: number[] = [];
  private ballSpeeds: number[] = [0];
  private lastMetrics: Metrics | null = null;
  private passStreak = 0;
  private lastMilestoneClock = -999;
  private pending: MatchEvent[] = [];
  private ghost: { x: number; y: number; delta: number; targetId: string | null } | null = null;

  constructor(seed = 7) {
    let n = seed;
    const rand = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n / 0x7fffffff;
    };
    for (const squad of SQUADS) {
      for (const [number, name, role, bx, by, maxSpeed] of squad.rows) {
        const baseX = squad.team === "NLA" ? bx * PITCH_L : PITCH_L - bx * PITCH_L;
        const player: EdgePlayer = {
          id: `${squad.team}_${number}`,
          team: squad.team,
          number,
          name,
          role,
          baseX,
          baseY: by,
          maxSpeed,
          x: baseX,
          y: by,
          vx: 0,
          vy: 0,
          heading: squad.team === "NLA" ? 0 : Math.PI,
          speedKmh: 0,
          stamina: 88 + rand() * 10,
          pose: "IDLE",
          badge: null,
        };
        this.players.push(player);
        this.byId.set(player.id, player);
      }
    }
    const carrier = this.byId.get(this.carrierId) ?? this.players[9];
    carrier.x = 52.5;
    carrier.y = 34;
    this.ball.x = carrier.x;
    this.ball.y = carrier.y;
  }

  inject(name: string): void {
    this.scenarioName = name;
    this.scenarioLeft = name === "tactical_inversion" ? 60 : 16;
    const carrier = this.byId.get(this.carrierId);
    if (name === "chaos_counter") {
      this.possession = "NLA";
      this.carrierId = "NLA_7";
      const p = this.byId.get("NLA_7");
      if (p) { p.x = 50; p.y = 32; }
      this.ball.x = 50;
      this.ball.y = 32;
      this.passTimer = 0.2;
    } else if (name === "high_press_turnover") {
      this.possession = "MCS";
      this.carrierId = "MCS_16";
      const p = this.byId.get("MCS_16");
      if (p) { p.x = 62; p.y = 30; }
      this.ball.x = 62;
      this.ball.y = 30;
      this.turnoverTimer = 2.4;
      this.passTimer = 1.1;
    } else if (name === "tactical_inversion") {
      const p = this.byId.get("NLA_2");
      if (p) { p.baseX = 42; p.baseY = 34; }
      this.possession = "NLA";
      this.carrierId = carrier?.id ?? "NLA_10";
    }
  }

  step(dt = 0.1): { tick: MatchTick; metrics: Metrics; events: MatchEvent[] } {
    this.pending = [];
    this.t += dt;
    if (this.scenarioLeft > 0) {
      this.scenarioLeft -= dt;
      if (this.scenarioLeft <= 0) {
        if (this.scenarioName === "tactical_inversion") {
          const p = this.byId.get("NLA_2");
          if (p) { p.baseX = 0.24 * PITCH_L; p.baseY = 57; }
        }
        this.scenarioName = null;
        this.scenarioLeft = 0;
      }
    }
    this.updateFlight(dt);
    this.movePlayers(dt);
    this.autoPass(dt);
    this.autoTurnover(dt);
    this.updateBadges();
    if (this.flight) this.updateBallFlight();
    else {
      const carrier = this.byId.get(this.carrierId);
      if (carrier) {
        this.ball.x = carrier.x + Math.cos(carrier.heading) * 0.65;
        this.ball.y = carrier.y + Math.sin(carrier.heading) * 0.65;
      }
      this.ball.z = 0;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.speedKmh = 0;
      this.ball.passStart = null;
      this.ball.passEnd = null;
      this.ball.lofted = false;
    }
    const tick = this.state();
    const metrics = this.buildMetrics(tick);
    this.lastMetrics = metrics;
    return { tick, metrics, events: this.pending };
  }

  ingestEvent(event: MatchEvent): void {
    if (event.type === "PASS") {
      const pdr = event.pdr ?? 0;
      if (pdr >= 78) {
        this.passStreak += 1;
        if (this.passStreak === 5 && this.t - this.lastMilestoneClock > 20) {
          this.lastMilestoneClock = this.t;
          this.pending.push({
            id: `edge_ms_${this.eventSeq + 1}`,
            type: "MILESTONE_PASS_MASTERY",
            clock: event.clock,
            t_match: event.t_match,
            team: event.team,
            player_id: event.player_id,
            player_name: event.player_name,
            headline: "5th Consecutive Line-Breaking Pass",
            detail: `Cumulative PDR streak live · ${pdr.toFixed(0)}% latest`,
            value: pdr,
          });
        }
      } else if (pdr < 65) {
        this.passStreak = 0;
      }
    }
  }

  currentState(): MatchTick {
    return this.state();
  }

  buildInsight(event: MatchEvent, tick: MatchTick, metrics: Metrics): Insight {
    this.insightSeq += 1;
    const ghost = event.ghost_pass ?? null;
    const pdr = event.pdr ?? 0;
    const dxt = event.delta_xt ?? 0;
    const archetype = event.type === "TURNOVER"
      ? "counter_overload"
      : event.type === "PRESSURE_TRAP"
        ? "pressing_trap"
        : pdr > 80
          ? "difficult_progression"
          : dxt > 0.08
            ? "threat_surge"
            : "rhythm_shift";
    const team = event.team ?? "NLA";
    const player = event.player_name ?? "the carrier";
    const opponent = team === "NLA" ? "MCS" : "NLA";
    const headline = archetype === "counter_overload"
      ? "High-Chaos Counter Rips Through the Broken Line"
      : archetype === "pressing_trap"
        ? "Coordinated Pressing Trap Strangles the Buildup"
        : archetype === "difficult_progression"
          ? "High-Wire Pass Threads the Press"
          : archetype === "threat_surge"
            ? "Expected Threat Surges Into the Final Third"
            : "Rhythm Holds: Structured Control Dominates";
    const causal = archetype === "counter_overload"
      ? `Because ${opponent} lost the ball in midfield, ${team} exploded forward at ${(event.speed_kmh ?? 31.6).toFixed(1)} km/h while the line sat high. Chaos jumped ${(event.delta_chaos ?? 0.12).toFixed(2)} in 10s.`
      : archetype === "pressing_trap"
        ? `Three ${opponent} defenders collapsed inside 6m of ${player}, forcing the turnover with ${team} still trying to play out. Chaos sits at ${metrics.chaos_index.toFixed(2)}.`
        : archetype === "difficult_progression"
          ? `${player} attempted a ${pdr.toFixed(0)}%-difficulty progression through ${event.defenders_in_cone ?? 1} defenders, bypassing a unit for ${dxt.toFixed(2)} xT.`
          : archetype === "threat_surge"
            ? `The ball moved into a zone worth ${dxt.toFixed(2)} more xT, dragging the ${opponent} block ${metrics.stretch_m.toFixed(0)}m out of shape.`
            : `Turnover rate is ${metrics.turnover_rate.toFixed(1)} per minute and ball-speed variance is low, so ${team} are circulating without fracturing.`;
    const story = archetype === "counter_overload"
      ? `Lightning break! ${team} stole it and exploded forward at ${(event.speed_kmh ?? 31.6).toFixed(0)} km/h — the defence was caught square.`
      : archetype === "pressing_trap"
        ? `${opponent} sprang a perfect pressing trap — three defenders swarmed the ball and won it high. The crowd can smell a chance!`
        : archetype === "difficult_progression"
          ? `What a pass from ${player} — threaded through a forest of defenders! One mistake there and it is a counter.`
          : archetype === "threat_surge"
            ? `${team} are slicing through the pitch — every pass is pulling defenders out of position.`
            : `Calm, controlled possession from ${team}. They are passing the opponent into submission.`;
    const translations = {
      en: story,
      es: `¡Momento táctico! ${story}`,
      ar: `لحظة تكتيكية! ${story}`,
      hi: `रणनीतिक पल! ${story}`,
    };
    const eventId = event.id;
    return {
      id: `edge_insight_${String(this.insightSeq).padStart(4, "0")}`,
      event_id: eventId,
      created_at: new Date().toISOString(),
      model: "edge-autonomous-engine-v5",
      archetype,
      camera_directive: {
        recommended_mode: archetype === "difficult_progression" ? "PLAYER_LOCK_3RD_PERSON" : "TACTICAL_DRONE",
        focus_target_id: event.player_id ?? null,
        cinematic_slow_mo: pdr > 90,
        ar_highlight_zone: archetype === "difficult_progression" ? "PROGRESSION_LANE" : "XT_SURGE_ZONE",
      },
      stage_c_explainability: {
        moment_headline: headline,
        why_it_matters_causal: causal,
        tactical_catalyst: `PDR ${pdr.toFixed(0)}% • ΔxT ${dxt.toFixed(2)} • Chaos ${metrics.chaos_index.toFixed(2)}`,
        commentator_talking_point: archetype === "difficult_progression"
          ? `That is an 80-plus difficulty ball — one misjudged touch and it is a counter the other way. ${player} took the gamble and it stuck.`
          : `Watch the shape — ${team} turned a single moment into a structural problem in under three seconds.`,
      },
      stage_d_broadcast_overlay: {
        timecode: event.clock,
        overlay_type: archetype === "counter_overload" ? "CHAOS_OVERLOAD_ALERT" : "TACTICAL_PULSE_UPDATE",
        highlight_players: [event.player_id, ghost?.target_id].filter(Boolean) as string[],
        draw_ghost_pass: !!ghost,
        lower_third_title: headline.toUpperCase(),
        lower_third_subtitle: `Pass Difficulty ${pdr.toFixed(1)}% • ΔxT ${dxt.toFixed(2)} • Chaos ${metrics.chaos_index.toFixed(2)}`,
      },
      stage_e_personalization: {
        analyst_mode: {
          metrics_summary: `PPDA ${metrics.ppda.NLA.toFixed(1)}/${metrics.ppda.MCS.toFixed(1)} | ΔxT ${dxt.toFixed(3)} | Pass Diff ${pdr.toFixed(1)}% | Chaos ${metrics.chaos_index.toFixed(2)}`,
          tactical_note: ghost
            ? `Optimal alternative was ${ghost.target_id ?? "a free man"} (+${ghost.delta_xt.toFixed(2)} xT, ${(ghost.openness_m ?? 0).toFixed(0)}m of space) vs ${dxt.toFixed(2)} on the actual ball.`
            : `No higher-value option available — the executed ball was already the spatial optimum.`,
          metric_focus_note: "EDGE AUTONOMOUS ENGINE: full metric set unavailable while Azure reconnects.",
        },
        casual_fan_mode: { story_card: story, excitement_rating: Math.round(clamp(52 + metrics.chaos_index * 40 + pdr * 0.08, 44, 99)) },
        player_lock_insight: event.player_id
          ? `Locked ${player}: ${(event.speed_kmh ?? 0).toFixed(1)} km/h at the moment of contact.`
          : "Lock onto any player to attach this insight to their telemetry stream.",
        translations,
        metric_lock: { active: false, focus: "ALL", label: "Complete Broadcast", filtered_tags: [] },
        favorite_club_bias: "NEUTRAL",
        persona_mode: "TWINCAST_SPLIT",
      },
      personalization: {
        persona_mode: "TWINCAST_SPLIT",
        metric_focus: "ALL",
        favorite_club_bias: "NEUTRAL",
        locked_player_id: event.player_id ?? null,
        market_language: "en",
      },
    };
  }

  buildPipeline(): Pipeline {
    const jitter = () => 0.1 + Math.random() * 0.35;
    return {
      stages: {
        a: { latency_ms: Number(jitter().toFixed(2)) },
        b: { latency_ms: Number((0.2 + Math.random() * 0.4).toFixed(2)) },
        c: { latency_ms: Number((0.4 + Math.random() * 2.2).toFixed(2)) },
        d: { latency_ms: Number((0.2 + Math.random() * 0.5).toFixed(2)) },
        e: { latency_ms: Number((0.1 + Math.random() * 0.3).toFixed(2)) },
      },
      payloads: {
        a: JSON.stringify({ engine: "edge-synthetic", clock: clockOf(this.t), players: 22, status: "autonomous" }),
        b: JSON.stringify({
          chaos_index: Number(this.chaos.toFixed(3)),
          ppda: this.lastMetrics?.ppda ?? { NLA: 0, MCS: 0 },
          synthetic: true,
        }),
        c: JSON.stringify({ model: "edge-autonomous-engine-v5", agent: "local-fallback", status: "ready" }),
        d: JSON.stringify({ overlay: "AETHER_RENDER_PARTNER_V2", status: "streaming" }),
        e: JSON.stringify({ languages: ["en", "es", "ar", "hi"], personas: ["analyst", "casual"] }),
      },
      updated_at: new Date().toISOString(),
    };
  }

  private state(): MatchTick {
    return {
      t_match: Number(this.t.toFixed(2)),
      clock: clockOf(this.t),
      score: { ...this.score },
      possession: this.possession,
      players: this.players.map((p) => ({
        id: p.id,
        team: p.team,
        number: p.number,
        shirt_number: p.number,
        name: p.name,
        role: p.role,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        vx: Number(p.vx.toFixed(2)),
        vy: Number(p.vy.toFixed(2)),
        speed_kmh: Number(p.speedKmh.toFixed(1)),
        stamina: Number(p.stamina.toFixed(1)),
        heading_rad: Number(p.heading.toFixed(3)),
        pose_state: p.pose,
        playstyle_badge: p.badge,
      })),
      ball: {
        x: Number(this.ball.x.toFixed(2)),
        y: Number(this.ball.y.toFixed(2)),
        z: Number(this.ball.z.toFixed(2)),
        vx: Number(this.ball.vx.toFixed(2)),
        vy: Number(this.ball.vy.toFixed(2)),
        vz: Number(this.ball.vz.toFixed(2)),
        speed_kmh: Number(this.ball.speedKmh.toFixed(1)),
        pass_start: this.ball.passStart,
        pass_end: this.ball.passEnd,
        is_lofted: this.ball.lofted,
        ghost_end: this.ball.ghostEnd,
        ghost_delta_xt: this.ball.ghostDelta,
      },
      carrier: this.carrierId || null,
      scenario: this.scenarioName,
      scenario_left: this.scenarioLeft > 0 ? Number(this.scenarioLeft.toFixed(1)) : null,
    };
  }

  private movePlayers(dt: number): void {
    const ball = this.ball;
    for (const p of this.players) {
      if (p.role === "GK") {
        const targetX = p.team === "NLA" ? clamp(3.5 + (ball.x - 52.5) * 0.035, 1.5, 8) : clamp(101.5 + (ball.x - 52.5) * 0.035, 97, 103.5);
        const targetY = clamp(34 + (ball.y - 34) * 0.18, 28, 40);
        this.seek(p, targetX, targetY, 0.6, dt);
        continue;
      }
      const attacking = p.team === this.possession;
      const forward = p.team === "NLA" ? 1 : -1;
      const ballPull = p.role === "DEF" ? 0.30 : p.role === "MID" ? 0.48 : 0.34;
      let targetX = p.baseX + (ball.x - p.baseX) * ballPull;
      let targetY = p.baseY + (ball.y - p.baseY) * (p.role === "DEF" ? 0.38 : 0.30);
      if (attacking) targetX += forward * (p.role === "FWD" ? 8 : 4);
      else targetX -= forward * 2.5;
      if (this.scenarioName === "chaos_counter" && p.team === "NLA" && p.role === "FWD") {
        targetX = p.id === "NLA_9" ? 78 : 77;
        targetY = p.id === "NLA_9" ? 39 : 17;
      }
      if (this.scenarioName === "high_press_turnover" && p.team === "MCS" && p.role === "DEF") {
        targetX = clamp(p.baseX + 9, 30, 70);
      }
      targetX = clamp(targetX, 2, 103);
      targetY = clamp(targetY, 2, 66);
      const urgency = p.role === "FWD" ? 1.15 : p.role === "MID" ? 0.95 : 0.72;
      this.seek(p, targetX, targetY, urgency, dt);
    }
  }

  private seek(p: EdgePlayer, tx: number, ty: number, urgency: number, dt: number): void {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    const staminaFactor = 0.76 + p.stamina / 420;
    const speed = dist > 0.15 ? Math.min(p.maxSpeed * urgency * staminaFactor, 2.0 + dist * 1.35) : 0;
    const desiredVx = dist > 0.001 ? (dx / dist) * speed : 0;
    const desiredVy = dist > 0.001 ? (dy / dist) * speed : 0;
    p.vx += (desiredVx - p.vx) * Math.min(1, dt * 5.5);
    p.vy += (desiredVy - p.vy) * Math.min(1, dt * 5.5);
    p.x = clamp(p.x + p.vx * dt, 1.5, 103.5);
    p.y = clamp(p.y + p.vy * dt, 1.5, 66.5);
    const v = Math.hypot(p.vx, p.vy);
    p.speedKmh = v * 3.6;
    if (v > 0.25) p.heading = Math.atan2(p.vy, p.vx);
    p.stamina = clamp(p.stamina - v * dt * 0.013, 42, 100);
    p.pose = p.speedKmh >= 27 ? "SPRINT" : p.speedKmh >= 8 ? "JOG" : "IDLE";
  }

  private autoPass(dt: number): void {
    this.passTimer -= dt;
    if (this.flight || this.passTimer > 0) return;
    const carrier = this.byId.get(this.carrierId);
    if (!carrier) return;
    const teammates = this.players.filter(
      (p) => p.team === carrier.team && p.id !== carrier.id && p.role !== "GK"
    );
    if (!teammates.length) return;
    const forward = carrier.team === "NLA" ? 1 : -1;
    const scored = teammates.map((p) => {
      const progress = (p.x - carrier.x) * forward;
      const dist = Math.hypot(p.x - carrier.x, p.y - carrier.y);
      return { p, score: progress * 0.8 + Math.random() * 24 - dist * 0.18 };
    }).sort((a, b) => b.score - a.score);
    const target = scored[0].p;
    const start: [number, number] = [carrier.x, carrier.y];
    const end: [number, number] = [target.x, target.y];
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (distance < 5) {
      this.passTimer = 0.5;
      return;
    }
    const opponents = this.players.filter((p) => p.team !== carrier.team && p.role !== "GK");
    let nearest = 99;
    let inCone = 0;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    for (const o of opponents) {
      const along = ((o.x - start[0]) * dx + (o.y - start[1]) * dy) / (distance * distance);
      if (along > 0 && along < 1) {
        const px = start[0] + dx * along;
        const py = start[1] + dy * along;
        const gap = Math.hypot(o.x - px, o.y - py);
        nearest = Math.min(nearest, gap);
        if (gap < 4.2) inCone += 1;
      }
    }
    const pdr = clamp(46 + distance * 0.75 + inCone * 7.4 - nearest * 0.9 + Math.random() * 10, 32, 98);
    const dxt = xtValue(carrier.team, end[0], end[1]) - xtValue(carrier.team, start[0], start[1]);
    const speedKmh = clamp(52 + distance * 0.55 + Math.random() * 20, 45, 96);
    const duration = clamp(distance / (speedKmh / 3.6), 0.55, 1.65);
    const ghostTarget = teammates
      .filter((p) => p.id !== target.id)
      .map((p) => ({
        p,
        openness: Math.min(...opponents.map((o) => {
          const qx = p.x;
          const qy = p.y;
          const vx = qx - start[0];
          const vy = qy - start[1];
          const len = Math.hypot(vx, vy) || 1;
          const proj = clamp(((o.x - start[0]) * vx + (o.y - start[1]) * vy) / (len * len), 0, 1);
          return Math.hypot(o.x - (start[0] + vx * proj), o.y - (start[1] + vy * proj));
        })),
      }))
      .sort((a, b) => b.openness - a.openness)[0];
    const ghost = ghostTarget
      ? {
          x: Number(ghostTarget.p.x.toFixed(2)),
          y: Number(ghostTarget.p.y.toFixed(2)),
          delta_xt: Number((dxt + 0.05 + ghostTarget.openness * 0.005).toFixed(3)),
          target_id: ghostTarget.p.id,
          openness_m: Number(ghostTarget.openness.toFixed(1)),
        }
      : null;
    this.eventSeq += 1;
    const event: MatchEvent = {
      id: makeEventId(this.eventSeq),
      type: "PASS",
      clock: clockOf(this.t),
      t_match: Number(this.t.toFixed(2)),
      team: carrier.team,
      player_id: carrier.id,
      player_name: carrier.name,
      start: [Number(start[0].toFixed(2)), Number(start[1].toFixed(2))],
      end: [Number(end[0].toFixed(2)), Number(end[1].toFixed(2))],
      distance_m: Number(distance.toFixed(1)),
      ball_speed_kmh: Number(speedKmh.toFixed(1)),
      defenders_in_cone: inCone,
      nearest_defender_m: Number(nearest.toFixed(1)),
      pdr: Number(pdr.toFixed(1)),
      delta_xt: Number(dxt.toFixed(3)),
      ghost_pass: ghost,
      speed_kmh: Number(carrier.speedKmh.toFixed(1)),
      delta_chaos: Number((Math.random() - 0.45).toFixed(3)),
      scenario: this.scenarioName,
      leverage: Number((Math.abs(dxt) * 3.2 + pdr / 45).toFixed(2)),
      ai_gate: {
        should_explain: pdr > 80 || dxt > 0.08 || !!this.scenarioName,
        reasons: [
          ...(pdr > 80 ? ["PDR > 80"] : []),
          ...(dxt > 0.08 ? ["ΔxT > 0.08"] : []),
          ...(this.scenarioName ? ["Scenario"] : []),
        ],
      },
    };
    this.pending.push(event);
    this.ingestEvent(event);
    this.flight = {
      from: start,
      to: end,
      fromId: carrier.id,
      toId: target.id,
      elapsed: 0,
      duration,
      speedKmh,
      lofted: distance > 28,
    };
    this.carrierId = target.id;
    this.ball.passStart = event.start ?? null;
    this.ball.passEnd = event.end ?? null;
    this.ball.lofted = distance > 28;
    this.ball.ghostEnd = ghost ? [ghost.x, ghost.y] : null;
    this.ball.ghostDelta = ghost ? ghost.delta_xt : null;
    this.ghost = ghost ? { x: ghost.x, y: ghost.y, delta: ghost.delta_xt, targetId: ghost.target_id } : null;
    this.ballSpeeds.push(speedKmh);
    if (this.ballSpeeds.length > 60) this.ballSpeeds.shift();
    this.passTimer = 1.8 + Math.random() * 1.8;
  }

  private autoTurnover(dt: number): void {
    this.turnoverTimer -= dt;
    if (this.turnoverTimer > 0 || this.flight) return;
    const current = this.byId.get(this.carrierId);
    if (!current) return;
    const opponent = this.players
      .filter((p) => p.team !== current.team && p.role !== "GK")
      .sort((a, b) => Math.hypot(a.x - this.ball.x, a.y - this.ball.y) - Math.hypot(b.x - this.ball.x, b.y - this.ball.y))[0];
    this.possession = opponent.team;
    this.carrierId = opponent.id;
    this.ball.x = opponent.x;
    this.ball.y = opponent.y;
    this.passStreak = 0;
    this.turnoverTimer = 11 + Math.random() * 9;
    this.eventSeq += 1;
    this.pending.push({
      id: makeEventId(this.eventSeq),
      type: "TURNOVER",
      clock: clockOf(this.t),
      t_match: Number(this.t.toFixed(2)),
      team: opponent.team,
      player_id: opponent.id,
      player_name: opponent.name,
      x: Number(opponent.x.toFixed(2)),
      y: Number(opponent.y.toFixed(2)),
      previous_team: current.team,
      middle_third: Math.abs(opponent.x - 52.5) < 18,
      pdr: null,
      delta_xt: null,
      ghost_pass: null,
      delta_chaos: 0.18,
      ai_gate: { should_explain: true, reasons: ["Change of possession"] },
      leverage: 1.1,
    });
  }

  private updateFlight(dt: number): void {
    if (!this.flight) return;
    this.flight.elapsed += dt;
    if (this.flight.elapsed >= this.flight.duration) this.flight = null;
  }

  private updateBallFlight(): void {
    const f = this.flight;
    if (!f) return;
    const progress = clamp(f.elapsed / f.duration, 0, 1);
    const x = f.from[0] + (f.to[0] - f.from[0]) * progress;
    const y = f.from[1] + (f.to[1] - f.from[1]) * progress;
    this.ball.x = x;
    this.ball.y = y;
    this.ball.z = f.lofted ? Math.sin(Math.PI * progress) * 3.6 : Math.sin(Math.PI * progress) * 0.5;
    this.ball.speedKmh = f.speedKmh * (1 - progress * 0.35);
    this.ball.vx = (f.to[0] - f.from[0]) / f.duration;
    this.ball.vy = (f.to[1] - f.from[1]) / f.duration;
    this.ball.vz = f.lofted ? Math.cos(Math.PI * progress) * 8 : 0;
    if (progress >= 1) {
      this.ball.x = f.to[0];
      this.ball.y = f.to[1];
      this.ball.z = 0;
      this.carrierId = f.toId;
    }
  }

  private updateBadges(): void {
    for (const p of this.players) {
      p.badge = p.speedKmh >= 30 ? "RAPID+" : null;
    }
    if (this.scenarioName === "chaos_counter") {
      const p = this.byId.get("NLA_7");
      if (p) {
        p.badge = "RAPID+";
        p.stamina = clamp(p.stamina - 0.004, 42, 100);
      }
    }
  }

  private buildMetrics(tick: MatchTick): Metrics {
    const target = this.scenarioName === "chaos_counter"
      ? 0.82
      : this.scenarioName === "high_press_turnover"
        ? 0.68
        : 0.50 + Math.sin(this.t / 14) * 0.09 + Math.sin(this.t / 4.7) * 0.035;
    this.chaos += (target - this.chaos) * 0.12;
    this.chaos = clamp(this.chaos, 0.08, 0.96);
    const delta = this.chaos - this.lastChaos;
    this.lastChaos = this.chaos;
    this.chaosHistory.push(this.chaos);
    if (this.chaosHistory.length > 120) this.chaosHistory.shift();
    const defLines = { NLA: 0, MCS: 0 };
    for (const team of ["NLA", "MCS"] as Team[]) {
      const defs = tick.players.filter((p) => p.team === team && p.role === "DEF");
      defLines[team] = defs.length
        ? team === "NLA"
          ? Math.min(...defs.map((p) => p.x))
          : 105 - Math.max(...defs.map((p) => p.x))
        : 0;
    }
    const speeds = this.ballSpeeds.length ? this.ballSpeeds : [0];
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
    const all = tick.players.filter((p) => p.role !== "GK").map((p) => p.y);
    const stretch = all.length ? Math.max(...all) - Math.min(...all) : 0;
    return {
      chaos_index: Number(this.chaos.toFixed(3)),
      chaos_state: this.chaos < 0.34
        ? "STRUCTURED CONTROL"
        : this.chaos <= 0.62
          ? "BALANCED RHYTHM"
          : "HIGH CHAOS TRANSITION",
      chaos_history: this.chaosHistory.map((c) => Number(c.toFixed(3))),
      delta_chaos: Number(delta.toFixed(3)),
      ppda: {
        NLA: Number((5.2 + Math.sin(this.t / 17) * 1.8).toFixed(1)),
        MCS: Number((6.0 + Math.cos(this.t / 19) * 1.6).toFixed(1)),
      },
      def_lines: { NLA: Number(defLines.NLA.toFixed(1)), MCS: Number(defLines.MCS.toFixed(1)) },
      pressing_intensity: this.scenarioName === "high_press_turnover" ? 3 : this.chaos > 0.7 ? 2 : 1,
      turnover_rate: Number((3.4 + this.chaos * 4.2).toFixed(1)),
      ball_speed_var: Number(variance.toFixed(1)),
      stretch_m: Number(stretch.toFixed(1)),
      possession: tick.possession,
    };
  }
}

export function edgePipeline(): Pipeline {
  const engine = new EdgeEngine(3);
  return engine.buildPipeline();
}
