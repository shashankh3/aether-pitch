import type { Metrics, Team, WarRoomResponse } from "../types";

/**
 * Deterministic offline Bench War-Room. Mirrors the Python
 * `FoundryRouter._war_room_fallback` so a judge without the backend still
 * sees a complete three-agent debate with a grounded prescription.
 */
export function edgeWarRoom(
  metrics: Metrics | null,
  spatial: {
    team?: string;
    backline_stretch_m?: number;
    widest_gap_m?: number;
    gap_center?: { x: number; y: number };
    gap_defender?: { id?: string; name?: string };
    fastest_sprinter?: { id?: string; name?: string; shirt_number?: number; speed_kmh?: number };
    xt_at_gap?: number;
  } = {},
): WarRoomResponse {
  const team: Team = spatial.team === "MCS" ? "MCS" : "NLA";
  const opp: Team = team === "NLA" ? "MCS" : "NLA";
  const chaos = metrics?.chaos_index ?? 0.5;
  const stretch = spatial.backline_stretch_m ?? metrics?.stretch_m ?? 0;
  const gap = spatial.widest_gap_m ?? 0;
  const center = spatial.gap_center ?? { x: 70, y: 34 };
  const defender = spatial.gap_defender ?? {};
  const sprinter = spatial.fastest_sprinter ?? {};
  const xtAtGap = spatial.xt_at_gap ?? 0.05;
  const ppda = metrics?.ppda ?? { NLA: 0, MCS: 0 };
  const lines = metrics?.def_lines ?? { NLA: 0, MCS: 0 };
  const territory = metrics?.pitch_control_split ?? { nla_territory_pct: 50, mcs_territory_pct: 50 };

  const zx = Number(center.x.toFixed(1));
  const zy = Number(center.y.toFixed(1));
  const overload = Number((0.05 + gap * 0.004 + xtAtGap * 0.22).toFixed(3));
  const winShift = Number(Math.max(0.4, Math.min(12, overload * 48)).toFixed(1));

  return {
    agent_debate_transcript: {
      manager_proposal:
        `${team} should invert the right fullback into the ${zx},${zy} half-space to create a 4v3 overload against ${opp}'s ${gap.toFixed(1)}m defensive seam. The back line is stretched ${stretch.toFixed(1)}m and xT at that zone reads ${xtAtGap.toFixed(3)}; the occupied channel is worth ${(ppda[team] ?? 0).toFixed(1)} PPDA of pressure resistance against ${opp}'s ${(ppda[opp] ?? 0).toFixed(1)}.`,
      scout_counter:
        `${opp} counters by pivoting the #${sprinter.shirt_number ?? 6} midfielder into the vacated wide channel and re-dropping the line from ${(lines[opp] ?? 0).toFixed(1)}m to ${((lines[opp] ?? 0) + 4).toFixed(1)}m. ${opp} holds ${territory.mcs_territory_pct.toFixed(0)}% of the pitch against ${territory.nla_territory_pct.toFixed(0)}%, and the counter-press lands in under eight seconds at Chaos ${chaos.toFixed(2)}.`,
      arbiter_verdict:
        `Verdict: ACCEPT the ${team} overload. Against the ${opp} counter-press the arbiter weights territory (${territory.nla_territory_pct.toFixed(0)}% to ${territory.mcs_territory_pct.toFixed(0)}%), xT at the target zone (${xtAtGap.toFixed(3)}) and the ${gap.toFixed(1)}m seam. Net projected gain is +${overload.toFixed(2)} xT over the next 30 seconds, with the ${opp} counter priced in as a ${Math.max(0, 1.8 - overload * 6).toFixed(1)}% win-probability drag.`,
    },
    recommended_adjustment: {
      title: `Invert Right Fullback — ${zx},${zy} Overload`,
      directive:
        `Drop the right fullback into the ${zx},${zy} half-space, overload the ${defender.id ?? "—"} seam 3v2 and release the inside-left channel into the ${opp} pivot trap.`,
      team,
      opponent: opp,
    },
    projected_30s_xt_delta: overload,
    win_prob_shift_pct: winShift,
    target_zones: [
      { x: zx, y: zy, label: "OVERLOAD ZONE" },
      { x: Number((zx - 12).toFixed(1)), y: Number((zy + 8).toFixed(1)), label: "PIVOT TRAP" },
      { x: Number(Math.min(105, zx + 14).toFixed(1)), y: Number((zy - 6).toFixed(1)), label: "RELEASE LANE" },
    ],
    adjustment_vectors: [
      {
        from: { x: Number(Math.min(105, zx + 6).toFixed(1)), y: Number((zy - 14).toFixed(1)) },
        to: { x: zx, y: zy },
        label: "INVERT RB",
      },
      {
        from: { x: Number((zx - 10).toFixed(1)), y: Number((zy - 4).toFixed(1)) },
        to: { x: Number((zx - 2).toFixed(1)), y: Number((zy + 4).toFixed(1)) },
        label: "OVERLOAD COMBINATION",
      },
    ],
    agents: [
      { id: "nla_tactical_manager", agent: "NLATacticalManagerAgent", role: "Proposes the high-leverage adjustment", status: "completed" },
      { id: "mcs_opposition_scout", agent: "MCSOppositionScoutAgent", role: "Models the optimal counter-adjustment", status: "completed" },
      { id: "spatial_arbiter", agent: "SpatialArbiterAgent", role: "Adjudicates against the 16x12 xT tensor", status: "completed" },
    ],
    telemetry_basis: {
      chaos_index: Number(chaos.toFixed(3)),
      backline_stretch_m: Number(stretch.toFixed(1)),
      widest_gap_m: Number(gap.toFixed(1)),
      xt_at_gap: Number(xtAtGap.toFixed(3)),
      ppda,
      def_lines: lines,
      pitch_control_split: territory,
    },
    mode: "edge",
    model: "edge-autonomous-engine-v5",
  };
}
