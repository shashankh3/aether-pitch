import type { MatchTick, PassingNetworkEdge } from "../types";
import { xtValue } from "./core";

/** Browser-native mirror of the Stage B top-xT passing network. */
export function computePassingNetworkEdges(tick: MatchTick): PassingNetworkEdge[] {
  const outfield = tick.players.filter((p) => p.role !== "GK" && p.role !== "DEF");
  const edges: PassingNetworkEdge[] = [];
  for (const a of outfield) {
    for (const b of outfield) {
      if (a.team !== b.team || a.id === b.id) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 8 || d > 45) continue;
      const weight = xtValue(a.team, b.x, b.y) - xtValue(a.team, a.x, a.y);
      if (weight <= 0) continue;
      edges.push({
        from_id: a.id,
        to_id: b.id,
        team: a.team,
        xt_weight: Number(weight.toFixed(4)),
        distance_m: Number(d.toFixed(1)),
        from_xy: { x: Number(a.x.toFixed(2)), y: Number(a.y.toFixed(2)) },
        to_xy: { x: Number(b.x.toFixed(2)), y: Number(b.y.toFixed(2)) },
      });
    }
  }
    // The same three-key ordering the Stage B engine uses: weight, then
    // from id, then to id. A two-key sort leaves ties to the insertion
    // order, which can order the network differently to the engine.
    const byWeightThenId = (x: PassingNetworkEdge, y: PassingNetworkEdge): number => {
      if (y.xt_weight !== x.xt_weight) return y.xt_weight - x.xt_weight;
      if (x.from_id !== y.from_id) return x.from_id < y.from_id ? -1 : 1;
      if (x.to_id !== y.to_id) return x.to_id < y.to_id ? -1 : 1;
      return 0;
    };
    edges.sort(byWeightThenId);
    const perTeam: Record<string, PassingNetworkEdge[]> = { NLA: [], MCS: [] };
    for (const edge of edges) {
      const bucket = perTeam[edge.team] ?? (perTeam[edge.team] = []);
      if (bucket.length < 3) bucket.push(edge);
    }
    return [...(perTeam.NLA ?? []), ...(perTeam.MCS ?? [])]
      .sort(byWeightThenId)
      .slice(0, 5);
  }
