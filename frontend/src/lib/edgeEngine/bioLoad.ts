import type { BioLoadProfile, BioLoadSummary, MatchTick, Role } from "../types";
import { clamp } from "./core";

/** Browser-native mirror of the Stage A bio-mechanical fatigue projection. */
export function computeBioLoadProfile(p: {
  number: number;
  role: Role;
  stamina: number;
  bioLoad: number;
  highIntensitySeconds: number;
  pressSeconds: number;
}): BioLoadProfile {
  const load = Number(clamp(p.bioLoad ?? 0, 0, 100).toFixed(1));
  const stamina = Number((p.stamina ?? 100).toFixed(1));
  const pressSeconds = p.pressSeconds ?? 0;
  const highIntensitySeconds = p.highIntensitySeconds ?? 0;
  const drainPerMinute = 0.008 * 60 + 0.05 * 0.62 * 60 - 0.02 * 60;
  const loadScaledDrain = drainPerMinute * (1 + load / 60);
  const pressPenalty = Math.min(4, pressSeconds * 0.035);
  const projected = Number(
    clamp(stamina - (loadScaledDrain + pressPenalty) * 10, 30, 100).toFixed(1),
  );
  const penalty = Number(
    Math.min(24, load * 0.24 + Math.max(0, 70 - projected) * 0.18).toFixed(1),
  );
  const needsRelief = projected < 65 || load >= 70;
  const n = p.number;
  let directive: string;
  if (!needsRelief) {
    directive = `#${n} is within the sustainable band; no relief required.`;
  } else if (p.role === "DEF") {
    directive = `Shift #${n} to a compact mid-block; delegate the wide pressing trigger to the inverted fullback and preserve the cover shadow.`;
  } else if (p.role === "MID") {
    directive = `Pull #${n} into a lower tempo; let the 8 hold the wide half-space and keep the counter-press outlet short.`;
  } else if (p.role === "FWD") {
    directive = `Rotate #${n} off the press line; keep the far post runner isolated and reduce the recovery sprint to one transition.`;
  } else if (p.role === "GK") {
    directive = `Hold #${n} on a conservative starting line; delay the sweeper activation while the load recovers.`;
  } else {
    directive = `Rotate #${n} out of the high-intensity band and re-enter once the projected load drops below the threshold.`;
  }
  return {
    sprint_load_index: load,
    projected_stamina_10m: projected,
    fatigue_pdr_penalty: penalty,
    high_intensity_seconds: Number(highIntensitySeconds.toFixed(1)),
    press_seconds: Number(pressSeconds.toFixed(1)),
    stamina_now: stamina,
    tactical_relief_directive: directive,
    relief_required: needsRelief,
  };
}

/** Browser-native mirror of the Stage B team fatigue read-out. */
export function computeBioLoadSummary(tick: MatchTick): BioLoadSummary {
  const profiles = tick.players
    .map((p) => ({
      player_id: p.id,
      player_name: p.name,
      team: p.team,
      role: p.role,
      profile: p.bio_load_profile,
    }))
    .filter((row) => !!row.profile);
  if (!profiles.length) {
    return {
      mean_sprint_load_index: 0,
      mean_projected_stamina_10m: 100,
      max_fatigue_pdr_penalty: 0,
      at_risk_count: 0,
      most_at_risk: [],
    };
  }
  const loads = profiles.map((r) => r.profile!.sprint_load_index);
  const projections = profiles.map((r) => r.profile!.projected_stamina_10m);
  const penalties = profiles.map((r) => r.profile!.fatigue_pdr_penalty);
  const atRisk = profiles
    .filter((r) => r.profile!.relief_required)
    .sort(
      (a, b) =>
        a.profile!.projected_stamina_10m - b.profile!.projected_stamina_10m ||
        b.profile!.sprint_load_index - a.profile!.sprint_load_index,
    )
    .slice(0, 3)
    .map((r) => ({
      player_id: r.player_id,
      player_name: r.player_name,
      team: r.team,
      role: r.role,
      sprint_load_index: r.profile!.sprint_load_index,
      projected_stamina_10m: r.profile!.projected_stamina_10m,
      fatigue_pdr_penalty: r.profile!.fatigue_pdr_penalty,
      relief_required: r.profile!.relief_required,
    }));
  return {
    mean_sprint_load_index: Number(
      (loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(1),
    ),
    mean_projected_stamina_10m: Number(
      (projections.reduce((a, b) => a + b, 0) / projections.length).toFixed(1),
    ),
    max_fatigue_pdr_penalty: Number(Math.max(...penalties).toFixed(1)),
    at_risk_count: profiles.filter((r) => r.profile!.relief_required).length,
    most_at_risk: atRisk,
  };
}
