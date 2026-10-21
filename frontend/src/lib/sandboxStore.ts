"use client";
// AETHER PITCH — Interactive Spatial "What-If" Counterfactual Sandbox.
//
// A judge pauses the match, grabs an avatar and drags it across the grass.
// The browser-native Stage B twin recomputes Expected Threat and Pitch Control
// against the relocated player and publishes the deltas.
//
// The drag state lives in a module-level mutable store (like `telemetry`) so
// a 60 fps pointer drag never triggers a React re-render — the avatars read
// the override directly inside their own `useFrame`.

import {
  calculateXTAtCoord, computePitchControlSplit, evaluateSimulatedPitchControl,
  type DefensiveLineShift,
} from "./edgeEngine";
import type { CounterfactualRequest, MatchTick, Team } from "./types";

export interface SandboxDelta {
  playerId: string;
  playerName: string;
  team: Team;
  shirtNumber: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  displacementM: number;
  originalXT: number;
  newXT: number;
  deltaXT: number;
  originalControlPct: number;
  newControlPct: number;
  deltaControlPct: number;
  opponentControlPct: number;
}

export interface SandboxState {
  active: boolean;
  dragging: boolean;
  playerId: string | null;
  originX: number;
  originY: number;
  x: number;
  y: number;
  moved: boolean;
}

export const sandbox: SandboxState = {
  active: false,
  dragging: false,
  playerId: null,
  originX: 52.5,
  originY: 34,
  x: 52.5,
  y: 34,
  moved: false,
};

export function activateSandbox(playerId: string, x: number, y: number): void {
  sandbox.active = true;
  sandbox.playerId = playerId;
  sandbox.originX = x;
  sandbox.originY = y;
  sandbox.x = x;
  sandbox.y = y;
  sandbox.moved = false;
  sandbox.dragging = false;
}

export function moveSandboxPlayer(x: number, y: number): void {
  sandbox.x = Math.max(1, Math.min(104, x));
  sandbox.y = Math.max(1, Math.min(67, y));
  sandbox.moved = true;
  notifySandbox();
}

/* ------------------------------------------------------------------------
 * A tiny pub/sub so the sandbox HUD can re-render on its own. The page
 * never re-renders during a drag, which is what keeps the scene at 60 FPS.
 * ---------------------------------------------------------------------- */

type SandboxListener = () => void;
const listeners = new Set<SandboxListener>();

export function subscribeSandbox(listener: SandboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySandbox(): void {
  listeners.forEach((l) => l());
}

export function setSandboxDragging(dragging: boolean): void {
  sandbox.dragging = dragging;
  notifySandbox();
}

export function clearSandbox(): void {
  sandbox.active = false;
  sandbox.dragging = false;
  sandbox.playerId = null;
  sandbox.moved = false;
  sandbox.x = 52.5;
  sandbox.y = 34;
  notifySandbox();
}

/** The relocated position of a player, or null when it is not being edited. */
export function sandboxOverrideFor(
  playerId: string,
): { x: number; y: number } | null {
  if (!sandbox.active || sandbox.playerId !== playerId) return null;
  return { x: sandbox.x, y: sandbox.y };
}

/* ------------------------------------------------------------------ */
/* Collective defensive line scrubber (shared by the HUD and the DVR)  */
/* ------------------------------------------------------------------ */

export interface LineScrubberState {
  team: Team;
  target: number;
  shift: DefensiveLineShift | null;
}

export const lineScrubber: LineScrubberState = {
  team: "NLA",
  target: 40,
  shift: null,
};

export function setLineTeam(team: Team): void {
  lineScrubber.team = team;
  notifySandbox();
}

export function setLineTarget(target: number): void {
  lineScrubber.target = Math.max(18, Math.min(52, target));
  notifySandbox();
}

export function setLineShift(shift: DefensiveLineShift | null): void {
  lineScrubber.shift = shift;
  notifySandbox();
}

/**
 * The live player list with the collective defensive line shift applied.
 *
 * The 3D offside wall and the compactness hull read this, so dragging the
 * scrubber physically moves the block on the pitch.
 */
export function lineShiftedPlayers<T extends { id: string; team: string; x: number; y: number }>(
  players: T[],
): T[] {
  const shift = lineScrubber.shift;
  if (!shift || !shift.delta_m) return players;
  const sign = shift.team === "NLA" ? 1 : -1;
  const backline = new Set(shift.backline_player_ids);
  const midfield = new Set(shift.midfield_player_ids);
  return players.map((p) => {
    if (p.team !== shift.team) return p;
    if (backline.has(p.id)) return { ...p, x: p.x + sign * shift.delta_m };
    if (midfield.has(p.id)) {
      return { ...p, x: p.x + sign * shift.delta_m * 0.45 };
    }
    return p;
  });
}

/**
 * Build the wire payload for `POST /api/counterfactual-query`.
 *
 * The client sends its own baseline for cross-checking, but the server
 * recomputes every number from the live Stage B engine — the client can
 * never inflate its own result.
 */
export function buildCounterfactualRequest(
  tick: MatchTick | null,
  delta: SandboxDelta | null,
  chaosIndex: number,
): CounterfactualRequest | null {
  if (!tick || !delta || !sandbox.playerId) return null;
  return {
    match_id: tick.match_metadata?.match_id ?? "SYN-PL-2026-1019-NLA-MCS",
    minute: Number((tick.t_match / 60).toFixed(2)),
    displacements: [
      {
        player_id: delta.shirtNumber,
        canonical_player_id: delta.playerId,
        team: delta.team,
        role: "DEF",
        original_coords: [delta.originX, delta.originY],
        displaced_coords: [delta.x, delta.y],
        delta_distance_m: delta.displacementM,
      },
    ],
    baseline_xt: delta.originalXT,
    baseline_pitch_control: {
      nla_territory_pct: delta.originalControlPct,
      mcs_territory_pct: 100 - delta.originalControlPct,
    },
    current_chaos_index: Number(chaosIndex.toFixed(3)),
  };
}

/**
 * Evaluate the counterfactual against the live frame using the *same* Stage B
 * twin that produces the live metrics. The baseline is recomputed without the
 * override, so the delta is exactly the change the move caused.
 */
export function evaluateSandbox(tick: MatchTick | null): SandboxDelta | null {
  if (!tick || !sandbox.active || !sandbox.playerId) return null;
  const player = tick.players.find((p) => p.id === sandbox.playerId);
  if (!player) return null;

  const originalXT = calculateXTAtCoord(player.team, sandbox.originX, sandbox.originY);
  const newXT = calculateXTAtCoord(player.team, sandbox.x, sandbox.y);
  const baseline = computePitchControlSplit(tick);
  const simulated = evaluateSimulatedPitchControl(tick, sandbox.playerId, sandbox.x, sandbox.y);
  const teamKey = player.team === "NLA" ? "nla_territory_pct" : "mcs_territory_pct";
  const opponentKey = player.team === "NLA" ? "mcs_territory_pct" : "nla_territory_pct";
  const originalControl = baseline[teamKey];
  const displacementM = Math.hypot(sandbox.x - sandbox.originX, sandbox.y - sandbox.originY);

  return {
    playerId: player.id,
    playerName: player.name,
    team: player.team,
    shirtNumber: player.shirt_number,
    originX: sandbox.originX,
    originY: sandbox.originY,
    x: sandbox.x,
    y: sandbox.y,
    displacementM: Number(displacementM.toFixed(1)),
    originalXT,
    newXT,
    deltaXT: Number((newXT - originalXT).toFixed(4)),
    originalControlPct: originalControl,
    newControlPct: simulated[teamKey],
    deltaControlPct: Number((simulated[teamKey] - originalControl).toFixed(1)),
    opponentControlPct: simulated[opponentKey],
  };
}
