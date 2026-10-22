import {
  ARCHETYPES, STORIES, TRANSLATIONS, fillTemplate,
} from "../narrativeAtlas";
import type { Archetype } from "../narrativeAtlas";
import type {
  AgentTrace, BioLoadProfile, BioLoadSummary, MatchEvent, MatchMetadata, MatchTick, Metrics,
  Insight, Pipeline, PlayerStats, PitchControlSplit, PassingNetworkEdge, PlayStyleBadge,
  PoseState, Role, Team, TeamStats, WarRoomResponse,
} from "../types";
import type { EdgePlayer, Flight } from "./core";
import {
  BIO_LOAD_RECOVERY_TAU_S, EDGE_MATCH_METADATA, EDGE_STAT_BASELINE, PITCH_L, PITCH_W,
  SQUADS, buildEdgeTrace, clamp, classifyArchetype, clockOf, makeEventId, xtValue,
} from "./core";
import { computePitchControlSplit } from "./math";
import { computeBioLoadProfile, computeBioLoadSummary } from "./bioLoad";
import { computePassingNetworkEdges } from "./network";

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
    ghostActualDelta: null as number | null,
    ghostTargetId: null as string | null,
    ghostCompletion: null as number | null,
    ghostNetGain: null as number | null,
  };
  private flight: Flight | null = null;
  private scenarioName: string | null = null;
  private scenarioLeft = 0;
  private passTimer = 1.1;
  private turnoverTimer = 17;
  private eventSeq = 0;
  private passSeq = 0;
  private insightSeq = 0;
  private teamStats: Record<Team, TeamStats> = {
    NLA: {
      ...EDGE_STAT_BASELINE.NLA, pass_accuracy: 0, shot_accuracy: 0,
      possession_pct: 0, distance_km: 0, sprint_distance_km: 0, goals: 1,
    },
    MCS: {
      ...EDGE_STAT_BASELINE.MCS, pass_accuracy: 0, shot_accuracy: 0,
      possession_pct: 0, distance_km: 0, sprint_distance_km: 0, goals: 1,
    },
  };
  private playerStats: Record<string, {
    passes: number; passes_completed: number; shots: number;
    shots_on_target: number; tackles: number;
  }> = {};
  private possessionS: Record<Team, number> = { NLA: 3720 * 0.54, MCS: 3720 * 0.46 };
  private chaos = 0.52;
  private lastChaos = 0.52;
  private chaosHistory: number[] = [];
  private ballSpeeds: number[] = [0];
  private lastMetrics: Metrics | null = null;
  private passStreak = 0;
  private lastMilestoneClock = -999;
  private pending: MatchEvent[] = [];
  private ghost: { x: number; y: number; delta: number; targetId: string | null } | null = null;
  private lastTrace: AgentTrace | null = null;

  constructor(seed = 7) {
    let n = seed;
    const rand = () => {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n / 0x7fffffff;
    };
    for (const squad of SQUADS) {
      for (const [number, name, role, bx, by, maxSpeed] of squad.rows) {
        const baseX = squad.team === "NLA" ? bx * PITCH_L : PITCH_L - bx * PITCH_L;
        const distanceM = role === "GK" ? 3100 : role === "DEF" ? 6700 : role === "MID" ? 7800 : 7200;
        const sprintDistanceM = distanceM * 0.13;
        // The edge engine mirrors Stage A's minute-62 physiological seed:
        // remaining stamina and metabolic load both reflect the work already
        // done, so the bio-load twin reads the same in either engine.
        const baselineKm = role === "GK" ? 3.1 : role === "DEF" ? 6.7 : role === "MID" ? 7.8 : 7.2;
        const staminaSeed = clamp(100 - baselineKm * 2.2, 58, 97);
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
          stamina: Number((staminaSeed + (rand() - 0.5) * 0.7).toFixed(1)),
          distanceM: distanceM + (rand() - 0.5) * 700,
          sprintDistanceM,
          topSpeedKmh: 28.5 + rand() * 6.0,
          nextDistanceAlertM: distanceM + 250,
          pose: "IDLE",
          badge: null,
          bioLoad: Number(clamp(sprintDistanceM * 0.052, 0, 78).toFixed(1)),
          highIntensitySeconds: Number((sprintDistanceM / 7.4).toFixed(1)),
          pressSeconds: 0,
        };
        const baseline = role === "GK" ? [20, 17, 0, 0] : role === "DEF" ? [36, 30, 0, 2] : role === "MID" ? [48, 41, 1, 1] : [28, 22, 2, 0];
        this.playerStats[player.id] = {
          passes: baseline[0], passes_completed: baseline[1],
          shots: baseline[2], shots_on_target: Math.min(baseline[2], 1), tackles: baseline[3],
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
    this.possessionS[this.possession] += dt;
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
    const archetype = classifyArchetype(event, metrics);
    const team = event.team ?? "NLA";
    const player = event.player_name ?? "The carrier";
    const opponent = team === "NLA" ? "MCS" : "NLA";
    const teamRow = metrics.team_stats?.[team];
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
    const story = fillTemplate(
      STORIES[archetype] ?? STORIES.rhythm_shift,
      {
        team,
        opp: opponent,
        player,
        speed: event.speed_kmh ?? event.ball_speed_kmh ?? 30,
      },
    );
    const atlas = TRANSLATIONS[archetype] ?? TRANSLATIONS.rhythm_shift;
    const translations = {
      en: story,
      es: fillTemplate(atlas.es, { team, opp: opponent, player }),
      ar: fillTemplate(atlas.ar, { team, opp: opponent, player }),
      hi: fillTemplate(atlas.hi, { team, opp: opponent, player }),
    };
    const eventId = event.id;
    const trace = buildEdgeTrace(event, tick, metrics, archetype, pdr, dxt, ghost, this.insightSeq);
    this.lastTrace = trace;
    return {
      id: `edge_insight_${String(this.insightSeq).padStart(4, "0")}`,
      event_id: eventId,
      created_at: new Date().toISOString(),
      model: "edge-autonomous-engine-v5",
      archetype,
      agent_trace: trace,
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
          metrics_summary: `PPDA ${metrics.ppda.NLA.toFixed(1)}/${metrics.ppda.MCS.toFixed(1)} | ΔxT ${dxt.toFixed(3)} | Pass Diff ${pdr.toFixed(1)}% | Pass Acc ${(teamRow?.pass_accuracy ?? 0).toFixed(1)}% | Shots ${teamRow?.shots ?? 0} | Chaos ${metrics.chaos_index.toFixed(2)}`,
          tactical_note: ghost
            ? `Optimal alternative was ${ghost.target_id ?? "a free man"} (+${ghost.delta_xt.toFixed(2)} xT, ${(ghost.openness_m ?? 0).toFixed(0)}m of space) vs ${dxt.toFixed(2)} on the actual ball.`
            : `No higher-value option available — the executed ball was already the spatial optimum.`,
          metric_focus_note: "EDGE AUTONOMOUS ENGINE: full metric set unavailable while the backend reconnects.",
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
      agent_trace: this.lastTrace,
      gate: this.lastTrace?.compute,
    };
  }

  private state(): MatchTick {
    return {
      t_match: Number(this.t.toFixed(2)),
      clock: clockOf(this.t),
      score: { ...this.score },
      possession: this.possession,
      match_metadata: EDGE_MATCH_METADATA,
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
        distance_m: Number(p.distanceM.toFixed(1)),
        sprint_distance_m: Number(p.sprintDistanceM.toFixed(1)),
        top_speed_kmh: Number(p.topSpeedKmh.toFixed(1)),
        pose_state: p.pose,
        playstyle_badge: p.badge,
        bio_load_profile: computeBioLoadProfile({
          number: p.number,
          role: p.role,
          stamina: p.stamina,
          bioLoad: p.bioLoad,
          highIntensitySeconds: p.highIntensitySeconds,
          pressSeconds: p.pressSeconds,
        }),
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
        ghost_actual_delta_xt: this.ball.ghostActualDelta,
        ghost_target_id: this.ball.ghostTargetId,
        ghost_completion_probability: this.ball.ghostCompletion,
        ghost_net_xt_gain: this.ball.ghostNetGain,
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
    const prevX = p.x;
    const prevY = p.y;
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
    // Pressing pose mirrors Stage A: a defender within 5.2 m of the ball
    // while the opposition has it is in a PRESS pose.
    const pressing =
      p.role !== "GK"
      && p.team !== this.possession
      && Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < 5.2;
    p.pose = pressing
      ? "PRESS"
      : p.speedKmh >= 27
        ? "SPRINT"
        : p.speedKmh >= 8
          ? "JOG"
          : "IDLE";
    const moved = Math.hypot(p.x - prevX, p.y - prevY);
    p.distanceM += moved;
    if (p.speedKmh >= 30) p.sprintDistanceM += moved;
    p.topSpeedKmh = Math.max(p.topSpeedKmh, p.speedKmh);
    // ---- v6.2 bio-mechanical load accumulation (mirrors Stage A) -------
    // Metabolic cost scales with the cube of relative intensity and decays
    // with a long recovery time constant, so recent efforts dominate but
    // fatigue is sticky. A press adds a discrete high-intensity cost.
    const intensity = p.maxSpeed > 0 ? v / p.maxSpeed : 0;
    if (intensity >= 0.55) {
      p.highIntensitySeconds += dt;
    }
    let cost = intensity ** 3 * 0.9;
    if (p.pose === "PRESS") {
      p.pressSeconds += dt;
      cost += 0.25;
    }
    p.bioLoad = clamp(p.bioLoad + dt * cost, 0, 100);
    p.bioLoad *= Math.exp(-dt / BIO_LOAD_RECOVERY_TAU_S);
    if (p.role !== "GK" && p.distanceM >= p.nextDistanceAlertM) {
      p.nextDistanceAlertM += 250;
      this.eventSeq += 1;
      this.pending.push({
        id: makeEventId(this.eventSeq),
        type: "AUTO_DISTANCE_ALERT",
        clock: clockOf(this.t),
        t_match: Number(this.t.toFixed(2)),
        team: p.team,
        player_id: p.id,
        player_name: p.name,
        distance_m: Number(p.distanceM.toFixed(1)),
        distance_km: Number((p.distanceM / 1000).toFixed(2)),
        threshold_km: Number((p.distanceM / 1000).toFixed(2)),
        speed_kmh: Number(p.speedKmh.toFixed(1)),
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        ai_gate: { should_explain: false, reasons: ["Distance threshold"] },
      });
    }
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
    const ghostDistance = ghostTarget
      ? Math.hypot(ghostTarget.p.x - start[0], ghostTarget.p.y - start[1])
      : 0;
    const ghostDelta = ghostTarget
      ? Number((dxt + 0.05 + ghostTarget.openness * 0.005).toFixed(3))
      : 0;
    const ghostCompletion = ghostTarget
      ? Number(clamp(52 + ghostTarget.openness * 2.8 - Math.max(0, ghostDistance - 20) * 0.35, 18, 97).toFixed(1))
      : 0;
    const ghost = ghostTarget
      ? {
          x: Number(ghostTarget.p.x.toFixed(2)),
          y: Number(ghostTarget.p.y.toFixed(2)),
          delta_xt: ghostDelta,
          target_id: ghostTarget.p.id,
          openness_m: Number(ghostTarget.openness.toFixed(1)),
          distance_m: Number(ghostDistance.toFixed(1)),
          actual_delta_xt: Number(dxt.toFixed(3)),
          ghost_delta_xt: ghostDelta,
          net_xt_gain: Number((ghostDelta - dxt).toFixed(3)),
          completion_probability: ghostCompletion,
          receiver_target_xy: {
            x: Number(ghostTarget.p.x.toFixed(2)),
            y: Number(ghostTarget.p.y.toFixed(2)),
          },
        }
      : null;
    this.eventSeq += 1;
    this.passSeq += 1;
    this.teamStats[carrier.team].passes += 1;
    const passerStats = this.playerStats[carrier.id];
    if (passerStats) passerStats.passes += 1;
    const event: MatchEvent = {
      id: makeEventId(this.eventSeq),
      type: "PASS",
      clock: clockOf(this.t),
      t_match: Number(this.t.toFixed(2)),
      team: carrier.team,
      player_id: carrier.id,
      player_name: carrier.name,
      // The receiver is what makes the pass network and the receiver pill
      // work; without it the edge engine's 3D passing lanes stay empty.
      target_id: target.id,
      target_name: target.name,
      // The Stage A engine tags every pass with a decision reason; the twin
      // must carry the same field so both engines expose one contract.
      reason: dxt > 0.06 ? "line_breaking" : "buildup",
      line_breaking: dxt > 0.06,
      pass_seq: this.passSeq,
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
      scenario_signature: this.scenarioName === "chaos_counter" && dxt > 0.06,
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
      fromName: carrier.name,
      passSeq: this.passSeq,
      elapsed: 0,
      duration,
      speedKmh,
      distance,
      lofted: distance > 28,
    };
    this.carrierId = target.id;
    this.ball.passStart = event.start ?? null;
    this.ball.passEnd = event.end ?? null;
    this.ball.lofted = distance > 28;
    this.ball.ghostEnd = ghost ? [ghost.x, ghost.y] : null;
    this.ball.ghostDelta = ghost ? ghost.delta_xt : null;
    this.ball.ghostActualDelta = ghost ? ghost.actual_delta_xt : null;
    this.ball.ghostTargetId = ghost ? ghost.target_id : null;
    this.ball.ghostCompletion = ghost ? ghost.completion_probability : null;
    this.ball.ghostNetGain = ghost ? ghost.net_xt_gain : null;
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
    this.teamStats[opponent.team].tackles += 1;
    this.teamStats[opponent.team].turnovers_won += 1;
    const tacklerStats = this.playerStats[opponent.id];
    if (tacklerStats) tacklerStats.tackles += 1;
    this.eventSeq += 1;
    this.pending.push({
      id: makeEventId(this.eventSeq),
      type: "TACKLE",
      clock: clockOf(this.t),
      t_match: Number(this.t.toFixed(2)),
      team: opponent.team,
      player_id: opponent.id,
      player_name: opponent.name,
      opponent_id: current.id,
      opponent_name: current.name,
      x: Number(opponent.x.toFixed(2)),
      y: Number(opponent.y.toFixed(2)),
      outcome: "WON",
      detail: "Edge fallback pressing tackle wins possession",
      ai_gate: { should_explain: false, reasons: ["Change of possession"] },
    });
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
    if (this.flight.elapsed < this.flight.duration) return;
    const f = this.flight;
    const target = this.byId.get(f.toId);
    const team = target?.team ?? this.possession;
    this.teamStats[team].passes_completed += 1;
    const passerStats = this.playerStats[f.fromId];
    if (passerStats) passerStats.passes_completed += 1;
    this.eventSeq += 1;
    this.pending.push({
      id: makeEventId(this.eventSeq),
      type: "PASS_COMPLETE",
      clock: clockOf(this.t),
      t_match: Number(this.t.toFixed(2)),
      team,
      player_id: f.fromId,
      player_name: f.fromName,
      target_id: f.toId,
      target_name: target?.name ?? null,
      pass_seq: f.passSeq,
      distance_m: Number(f.distance.toFixed(1)),
      ai_gate: { should_explain: false, reasons: [] },
    });
    this.flight = null;
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
      p.badge = p.speedKmh >= 30 ? "RAPID" : null;
    }
    if (this.scenarioName === "chaos_counter") {
      const p = this.byId.get("NLA_7");
      if (p) {
        p.badge = "RAPID";
        p.stamina = clamp(p.stamina - 0.004, 42, 100);
      }
    }
  }

  private buildStats(tick: MatchTick): Pick<Metrics, "team_stats" | "player_stats" | "leaders"> {
    const totalPoss = this.possessionS.NLA + this.possessionS.MCS || 1;
    const teamStats = {} as Record<Team, TeamStats>;
    for (const team of ["NLA", "MCS"] as Team[]) {
      const squad = tick.players.filter((p) => p.team === team);
      const raw = this.teamStats[team];
      const distance = squad.reduce((sum, p) => sum + p.distance_m, 0) / 1000;
      const sprint = squad.reduce((sum, p) => sum + p.sprint_distance_m, 0) / 1000;
      teamStats[team] = {
        ...raw,
        pass_accuracy: raw.passes ? Number((100 * raw.passes_completed / raw.passes).toFixed(1)) : 0,
        shot_accuracy: raw.shots ? Number((100 * raw.shots_on_target / raw.shots).toFixed(1)) : 0,
        possession_pct: Number((100 * this.possessionS[team] / totalPoss).toFixed(1)),
        distance_km: Number(distance.toFixed(2)),
        sprint_distance_km: Number(sprint.toFixed(2)),
        goals: tick.score[team],
      };
    }
    const playerStats: Record<string, PlayerStats> = {};
    for (const p of tick.players) {
      const raw = this.playerStats[p.id];
      if (!raw) continue;
      playerStats[p.id] = {
        ...raw,
        pass_accuracy: raw.passes
          ? Number((100 * raw.passes_completed / raw.passes).toFixed(1))
          : 0,
        distance_km: Number((p.distance_m / 1000).toFixed(2)),
        top_speed_kmh: p.top_speed_kmh,
      };
    }
    const fastest = [...tick.players].sort((a, b) => b.top_speed_kmh - a.top_speed_kmh)[0];
    const farthest = [...tick.players].sort((a, b) => b.distance_m - a.distance_m)[0];
    return {
      team_stats: teamStats,
      player_stats: playerStats,
      leaders: {
        fastest: fastest ? {
          player_id: fastest.id, player_name: fastest.name,
          team: fastest.team, top_speed_kmh: fastest.top_speed_kmh,
        } : undefined,
        farthest: farthest ? {
          player_id: farthest.id, player_name: farthest.name,
          team: farthest.team, distance_km: Number((farthest.distance_m / 1000).toFixed(2)),
        } : undefined,
      },
    };
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
      pitch_control_split: computePitchControlSplit(tick),
      passing_network_edges: computePassingNetworkEdges(tick),
      bio_load_summary: computeBioLoadSummary(tick),
      ...this.buildStats(tick),
    };
  }
}

