"""
AETHER PITCH — Stage (b): Real-Time Deterministic Math Engine
=============================================================
No LLM guesses statistics here. Everything in this module is exact, fast,
reproducible spatial math over the Stage (a) coordinate stream:

1. Control vs. Chaos Index  C_t in [0, 1]  (rolling 60s weighted combination)
2. Pass Difficulty Rating   PDR in [0, 100] (logistic model)
3. Expected Threat          16x12 xT grid + bilinear interpolation, ΔxT per pass
4. Counterfactual "Ghost Pass" — optimal alternative pass by openness + ΔxT
5. Deterministic Event Gate — when Stage (c) AI explanation should fire
"""
from __future__ import annotations

import math
from collections import deque
from typing import Dict, List, Optional, Tuple

import numpy as np

PITCH_L, PITCH_W = 105.0, 68.0
XT_COLS, XT_ROWS = 16, 12
XT_MIN, XT_MAX = 0.004, 0.350

# Control-vs-Chaos weights (spec Stage b)
W_TURNOVER, W_VARIANCE, W_STRETCH, W_PRESS = 0.35, 0.25, 0.20, 0.20

CHAOS_CONTROL = 0.40
CHAOS_CHAOS = 0.68

# Synthetic match-to-date baselines at the opening 62nd-minute snapshot. The
# live counters below add to these totals, so the broadcast never opens on a
# zero-pass match.
TEAM_STAT_BASELINE = {
    "NLA": {
        "passes": 431, "passes_completed": 368, "shots": 12,
        "shots_on_target": 6, "tackles": 15, "turnovers_won": 9,
    },
    "MCS": {
        "passes": 398, "passes_completed": 339, "shots": 9,
        "shots_on_target": 4, "tackles": 17, "turnovers_won": 7,
    },
}
PLAYER_STAT_BASELINE = {
    "GK": (20, 17, 0, 0),
    "DEF": (36, 30, 0, 2),
    "MID": (48, 41, 1, 1),
    "FWD": (28, 22, 2, 0),
}


def _clip(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _moved_players(overrides: Optional[List[dict]]) -> Dict[str, Tuple[float, float]]:
    """Normalise a list of player relocations into an id -> (x, y) map.

    Two call sites used two different key names for the same concept
    ("id" and "player_id"). An override whose key did not match was
    silently ignored, so a relocation could be dropped without any error.
    Both spellings are accepted now, and an entry with no usable id is
    rejected loudly rather than ignored.
    """
    moved: Dict[str, Tuple[float, float]] = {}
    for o in (overrides or []):
        pid = o.get("player_id") or o.get("id")
        if not pid:
            raise ValueError("a player relocation needs a 'player_id' or 'id'")
        moved[str(pid)] = (float(o.get("x", 0.0)), float(o.get("y", 0.0)))
    return moved


#: Defensive line height bounds (metres from the team's own goal line).
DEF_LINE_MIN_M = 18.0
DEF_LINE_MAX_M = 52.0
#: Midfield compression ratio relative to the backline slide.
DEF_LINE_MIDFIELD_COMPRESSION = 0.45


def _convex_hull_area(points: List[Tuple[float, float]]) -> float:
    """Area of the convex hull of 2D points (Andrew's monotone chain).

    Used for the compactness of a team's block: the area their outfield shape
    occupies on the pitch.
    """
    pts = sorted({(float(x), float(y)) for x, y in points})
    if len(pts) < 3:
        return 0.0

    def cross(o, a, b) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: List[Tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: List[Tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    if len(hull) < 3:
        return 0.0
    area = 0.0
    for i in range(len(hull)):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % len(hull)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


#: Pre-computed cell-centre grid (row = y, col = x) for the 16x12 xT surface.
_CELL_XS = (np.arange(XT_COLS) + 0.5) * (PITCH_L / XT_COLS)
_CELL_YS = (np.arange(XT_ROWS) + 0.5) * (PITCH_W / XT_ROWS)
_GRID_X, _GRID_Y = np.meshgrid(_CELL_XS, _CELL_YS)
#: A player influences a cell only inside this radius (matches the scalar path).
_REACH_M = 20.0
_REACH_M2 = _REACH_M * _REACH_M
#: Gaussian falloff denominator (sigma = 12 m).
_SIGMA2 = 144.0


def _influence_surface(
    players: List[dict],
    moved: Dict[str, Tuple[float, float]],
) -> Tuple[np.ndarray, np.ndarray]:
    """Per-team influence surfaces over the 16x12 grid.

    Vectorised equivalent of the scalar accumulation: only cells inside a
    player's reach evaluate the exponential, which is ~18% of the grid.
    """
    nla = np.zeros((XT_ROWS, XT_COLS), dtype=float)
    mcs = np.zeros((XT_ROWS, XT_COLS), dtype=float)
    for p in players:
        override = moved.get(p.get("id"))
        base_x = override[0] if override else float(p.get("x", 0.0))
        base_y = override[1] if override else float(p.get("y", 0.0))
        px = base_x + float(p.get("vx", 0.0)) * 0.45
        py = base_y + float(p.get("vy", 0.0)) * 0.45
        if not (math.isfinite(px) and math.isfinite(py)):
            continue  # corrupt telemetry: the player is absent from the surface
        d2 = (_GRID_X - px) ** 2 + (_GRID_Y - py) ** 2
        near = d2 <= _REACH_M2
        if not near.any():
            continue
        factor = 0.55 + min(0.75, float(p.get("speed_kmh", 0.0)) / 45.0)
        weight = np.zeros((XT_ROWS, XT_COLS), dtype=float)
        weight[near] = np.exp(-d2[near] / _SIGMA2) * factor
        if p.get("team") == "NLA":
            nla += weight
        else:
            mcs += weight
    return nla, mcs


def _central_usable_cells(
    state: dict,
    defending_team: str,
    override_players: Optional[List[dict]] = None,
) -> int:
    """How many central pitch-control cells the opposition can still use.

    A cell is usable when the opposition influence clearly exceeds the
    defending side's, measured on the same 16x12 grid the rest of Stage B uses.
    """
    moved = _moved_players(override_players)
    players = [p for p in state.get("players", []) if p.get("role") != "GK"]
    if not players:
        return 0
    nla, mcs = _influence_surface(players, moved)
    central = (_GRID_X >= PITCH_L * 0.33) & (_GRID_X <= PITCH_L * 0.67)
    if defending_team == "NLA":
        usable = (mcs > nla * 1.02) & central
    else:
        usable = (nla > mcs * 1.02) & central
    return int(usable.sum())


class TacticalMathEngine:
    def __init__(self, window_s: float = 60.0):
        self.window_s = window_s
        self.xt_grid = self._build_xt_grid()          # (12, 16) attacking toward +x
        self.stream: deque = deque()                  # (t, kind, payload)
        self.ball_speeds: deque = deque()             # (t, kmh)
        self.chaos_hist: deque = deque(maxlen=600)    # (t, chaos) sampled 2Hz (match time)
        self.chaos = 0.30
        self.scenario_active: Optional[str] = None
        self.scenario_boost = 0.0
        self._last_recompute = -1e9
        self._last_hist = -1e9
        self._stats_ready = False
        self.team_stats: Dict[str, Dict[str, int]] = {}
        self.player_stats: Dict[str, Dict[str, int]] = {}
        self.possession_s: Dict[str, float] = {"NLA": 0.0, "MCS": 0.0}

    # ------------------------------------------------------------------ xT
    @staticmethod
    def _build_xt_grid() -> np.ndarray:
        """Modelled 16x12 Expected Threat surface, 0.004 (own corner) -> 0.350 (six-yard)."""
        grid = np.zeros((XT_ROWS, XT_COLS), dtype=float)
        for r in range(XT_ROWS):
            for c in range(XT_COLS):
                cx = (c + 0.5) * PITCH_L / XT_COLS
                cy = (r + 0.5) * PITCH_W / XT_ROWS
                d_goal = math.hypot(PITCH_L - cx, 34.0 - cy)
                d_central = abs(cy - 34.0)
                grid[r, c] = 0.35 * math.exp(-d_goal / 30.0) + 0.05 * math.exp(-d_central / 18.0)
        gmin, gmax = grid.min(), grid.max()
        grid = XT_MIN + (grid - gmin) / (gmax - gmin) * (XT_MAX - XT_MIN)
        return grid

    def xt_value(self, team: str, x: float, y: float) -> float:
        """Bilinear xT at a point for `team` (grid always points at each team's own attack).

        A non-finite coordinate is corrupt telemetry: it is out of play, so it
        reads as the minimum-threat cell rather than leaking into the surface.
        """
        xs = x if team == "NLA" else PITCH_L - x
        if not (math.isfinite(xs) and math.isfinite(y)):
            return XT_MIN
        fx = _clip(xs / PITCH_L * XT_COLS - 0.5, 0.0, XT_COLS - 1.001)
        fy = _clip(y / PITCH_W * XT_ROWS - 0.5, 0.0, XT_ROWS - 1.001)
        x0, y0 = int(fx), int(fy)
        x1, y1 = min(x0 + 1, XT_COLS - 1), min(y0 + 1, XT_ROWS - 1)
        tx, ty = fx - x0, fy - y0
        g = self.xt_grid
        top = g[y0, x0] * (1 - tx) + g[y0, x1] * tx
        bot = g[y1, x0] * (1 - tx) + g[y1, x1] * tx
        return float(top * (1 - ty) + bot * ty)

    def delta_xt(self, team: str, start: Tuple[float, float], end: Tuple[float, float]) -> float:
        return self.xt_value(team, end[0], end[1]) - self.xt_value(team, start[0], start[1])

    # ----------------------------------------------------------------- PDR
    @staticmethod
    def pass_difficulty(distance_m: float, ball_speed_kmh: float,
                        defenders_in_cone: float, nearest_defender_m: float) -> float:
        logit = (0.08 * distance_m + 0.05 * ball_speed_kmh
                 + 0.65 * defenders_in_cone - 0.30 * nearest_defender_m - 2.5)
        return round(100.0 / (1.0 + math.exp(-logit)), 1)

    # ----------------------------------------------------------- ghost pass
    def ghost_pass(self, state: dict, team: str, carrier_id: Optional[str],
                   start: Tuple[float, float],
                   actual_delta_xt: Optional[float] = None) -> Optional[dict]:
        """Scan all 10 teammates: score by openness + ΔxT; return optimal alternative."""
        opponents = [p for p in state["players"] if p["team"] != team]
        teammates = [p for p in state["players"]
                     if p["team"] == team and p["id"] != carrier_id]
        best = None
        for tm in teammates:
            end = (tm["x"], tm["y"])
            d = math.hypot(end[0] - start[0], end[1] - start[1])
            if d < 5.0:
                continue
            openness = self._segment_openness(start, end, opponents)
            dxt = self.delta_xt(team, start, end)
            score = dxt * 3.0 + openness * 0.06
            if best is None or score > best["score"]:
                best = {"score": score, "x": round(end[0], 2), "y": round(end[1], 2),
                        "distance_m": round(d, 1),
                        "delta_xt": round(dxt, 3), "target_id": tm["id"],
                        "openness_m": round(openness, 1)}
        if best is None:
            return None
        ghost_delta = round(float(best["delta_xt"]), 3)
        actual = round(float(actual_delta_xt), 3) if actual_delta_xt is not None else None
        completion = round(max(18.0, min(97.0,
            52.0 + float(best["openness_m"]) * 2.8
            - max(0.0, float(best["distance_m"]) - 20.0) * 0.35)), 1)
        best.update({
            "actual_delta_xt": actual,
            "ghost_delta_xt": ghost_delta,
            "net_xt_gain": round(ghost_delta - actual, 3) if actual is not None else None,
            "completion_probability": completion,
            "receiver_target_xy": {"x": best["x"], "y": best["y"]},
        })
        return best

    @staticmethod
    def _segment_openness(a, b, opponents) -> float:
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy or 1e-6
        best = 999.0
        for o in opponents:
            t = max(0.0, min(1.0, ((o["x"] - ax) * dx + (o["y"] - ay) * dy) / seg2))
            px, py = ax + t * dx, ay + t * dy
            best = min(best, math.hypot(o["x"] - px, o["y"] - py))
        return best

    # ------------------------------------------------------------ match stats
    def _init_stats(self, state: dict, t: float) -> None:
        """Seed the synthetic match-to-date totals on the first tick."""
        self.team_stats = {
            team: dict(values) for team, values in TEAM_STAT_BASELINE.items()
        }
        self.possession_s = {"NLA": t * 0.54, "MCS": t * 0.46}
        self.player_stats = {}
        for p in state.get("players", []):
            passes, completed, shots, tackles = PLAYER_STAT_BASELINE.get(
                p.get("role", "MID"), (24, 20, 0, 0))
            self.player_stats[p["id"]] = {
                "passes": passes, "passes_completed": completed,
                "shots": shots, "shots_on_target": 0, "tackles": tackles,
            }
        self._stats_ready = True

    def _player_stat(self, pid: Optional[str]) -> Optional[Dict[str, int]]:
        if not pid:
            return None
        if pid not in self.player_stats:
            self.player_stats[pid] = {
                "passes": 0, "passes_completed": 0,
                "shots": 0, "shots_on_target": 0, "tackles": 0,
            }
        return self.player_stats[pid]

    def _track_match_stats(self, state: dict, events: List[dict], t: float,
                           dt: float) -> None:
        if not self._stats_ready:
            self._init_stats(state, t)
        self.possession_s[state.get("possession", "NLA")] = (
            self.possession_s.get(state.get("possession", "NLA"), 0.0) + dt
        )
        for ev in events:
            kind = ev.get("type")
            team = ev.get("team")
            if team not in self.team_stats:
                continue
            stats = self.team_stats[team]
            player = self._player_stat(ev.get("player_id"))
            if kind == "PASS":
                stats["passes"] += 1
                if player is not None:
                    player["passes"] += 1
            elif kind == "PASS_COMPLETE":
                stats["passes_completed"] += 1
                if player is not None:
                    player["passes_completed"] += 1
            elif kind == "SHOT":
                stats["shots"] += 1
                if ev.get("on_target"):
                    stats["shots_on_target"] += 1
                if player is not None:
                    player["shots"] += 1
                    if ev.get("on_target"):
                        player["shots_on_target"] += 1
            elif kind == "TACKLE":
                stats["tackles"] += 1
                if player is not None:
                    player["tackles"] += 1
            elif kind == "TURNOVER":
                stats["turnovers_won"] += 1

    @staticmethod
    def _pct(numerator: float, denominator: float) -> float:
        return round(100.0 * numerator / denominator, 1) if denominator else 0.0

    def _match_stats_snapshot(self, state: dict) -> dict:
        """Team + player totals for the broadcast stats strip and APIs."""
        players = {p.get("id"): p for p in state.get("players", [])}
        total_poss = sum(self.possession_s.values()) or 1.0
        team_stats_out: Dict[str, dict] = {}
        for team, stats in self.team_stats.items():
            team_players = [p for p in state.get("players", []) if p.get("team") == team]
            distance_km = sum((p.get("distance_m") or 0.0) for p in team_players) / 1000.0
            sprint_km = sum((p.get("sprint_distance_m") or 0.0) for p in team_players) / 1000.0
            team_stats_out[team] = {
                **{k: int(v) for k, v in stats.items()},
                "pass_accuracy": self._pct(stats["passes_completed"], stats["passes"]),
                "shot_accuracy": self._pct(stats["shots_on_target"], stats["shots"]),
                "possession_pct": round(100.0 * self.possession_s.get(team, 0.0) / total_poss, 1),
                "distance_km": round(distance_km, 2),
                "sprint_distance_km": round(sprint_km, 2),
                "goals": int(state.get("score", {}).get(team, 0)),
            }
        player_stats_out = {}
        for pid, stats in self.player_stats.items():
            p = players.get(pid) or {}
            if not p:
                continue
            player_stats_out[pid] = {
                **{k: int(v) for k, v in stats.items()},
                "pass_accuracy": self._pct(
                    stats["passes_completed"], stats["passes"]),
                "distance_km": round((p.get("distance_m") or 0.0) / 1000.0, 2),
                "top_speed_kmh": p.get("top_speed_kmh", 0.0),
            }
        leaders = {}
        if players:
            fastest = max(players.values(), key=lambda p: p.get("top_speed_kmh", 0.0))
            farthest = max(players.values(), key=lambda p: p.get("distance_m", 0.0))
            leaders = {
                "fastest": {
                    "player_id": fastest.get("id"), "player_name": fastest.get("name"),
                    "team": fastest.get("team"), "top_speed_kmh": fastest.get("top_speed_kmh", 0.0),
                },
                "farthest": {
                    "player_id": farthest.get("id"), "player_name": farthest.get("name"),
                    "team": farthest.get("team"), "distance_km": round(
                        (farthest.get("distance_m") or 0.0) / 1000.0, 2),
                },
            }
        return {
            "team_stats": team_stats_out,
            "player_stats": player_stats_out,
            "leaders": leaders,
        }

    # ---------------------------------------------------------------- chaos
    def update(self, state: dict, events: List[dict], t: float,
               scenario_active: Optional[str], dt: float) -> dict:
        """Advance rolling windows; recompute chaos at 2Hz; return metrics snapshot."""
        for ev in events:
            self.stream.append((t, ev.get("type", ""), ev))
        self.stream.append((t, "_tick", {}))
        self.ball_speeds.append((t, state["ball"]["speed_kmh"]))
        if self.scenario_active != scenario_active:
            if scenario_active in ("chaos_counter", "high_press_turnover"):
                self.scenario_boost = max(self.scenario_boost, 0.30)
            elif scenario_active == "tactical_inversion":
                self.scenario_boost = max(self.scenario_boost, 0.06)
            self.scenario_active = scenario_active
        self.scenario_boost = max(0.0, self.scenario_boost - dt * 0.022)
        self._prune(t)
        self._track_match_stats(state, events, t, dt)

        if t - self._last_recompute >= 0.5:
            self._last_recompute = t
            self._recompute_chaos(state, t)
        if t - self._last_hist >= 0.5:
            self._last_hist = t
            self.chaos_hist.append((t, self.chaos))
        return self.snapshot(state)

    def _prune(self, t: float) -> None:
        cutoff = t - self.window_s
        while self.stream and self.stream[0][0] < cutoff:
            self.stream.popleft()
        while self.ball_speeds and self.ball_speeds[0][0] < cutoff:
            self.ball_speeds.popleft()

    def _recompute_chaos(self, state: dict, t: float) -> None:
        window = [s for s in self.stream if s[0] >= t - self.window_s]
        turnovers = sum(1 for s in window if s[1] == "TURNOVER")
        tr = _clip(turnovers / 6.0)                       # 6+ per min -> saturated
        speeds = [v for (_, v) in self.ball_speeds] or [0.0]
        var_norm = _clip(float(np.var(speeds)) / 900.0)   # (30 km/h)^2 scale
        stretch = self._line_stretch(state)               # 0..1 via /35 m
        press = _clip(self._pressing_intensity(state) / 3.0)
        raw = (W_TURNOVER * tr + W_VARIANCE * var_norm
               + W_STRETCH * stretch + W_PRESS * press + self.scenario_boost)
        self.chaos = _clip(0.90 * self.chaos + 0.10 * _clip(raw))

    def _line_stretch(self, state: dict) -> float:
        """Vertical stretch of the in-possession structure: deepest DEF -> highest MID, /35 m."""
        team = state["possession"]
        players = [p for p in state["players"] if p["team"] == team and p["role"] != "GK"]
        dfs = [p for p in players if p["role"] == "DEF"] or players
        mfs = [p for p in players if p["role"] == "MID"] or players
        if team == "NLA":
            deepest = min(p["x"] for p in dfs)
            highest = max(p["x"] for p in mfs)
        else:
            deepest = max(p["x"] for p in dfs)
            highest = min(p["x"] for p in mfs)
        return _clip(abs(highest - deepest) / 35.0)

    def _pressing_intensity(self, state: dict) -> float:
        ball = state["ball"]
        defending = "MCS" if state["possession"] == "NLA" else "NLA"
        return float(sum(
            1 for p in state["players"]
            if p["team"] == defending and p["role"] != "GK"
            and math.hypot(p["x"] - ball["x"], p["y"] - ball["y"]) < 8.0
        ))

    def delta_chaos(self, t: float, lookback_s: float = 10.0) -> float:
        target = t - lookback_s
        ref = self.chaos
        for (ts, c) in self.chaos_hist:
            if ts >= target:
                ref = c
                break
        return self.chaos - ref

    @staticmethod
    def classify(c: float) -> str:
        if c < CHAOS_CONTROL:
            return "STRUCTURED CONTROL"
        if c <= CHAOS_CHAOS:
            return "BALANCED RHYTHM"
        return "HIGH CHAOS TRANSITION"

    # --------------------------------------------------------------- metrics
    def ppda(self, t: float) -> Dict[str, float]:
        """Passes allowed per defensive action (rolling window), per team."""
        window = [s for s in self.stream if s[0] >= t - self.window_s]
        out = {}
        for team in ("NLA", "MCS"):
            opp = "MCS" if team == "NLA" else "NLA"
            passes = sum(1 for s in window if s[1] == "PASS" and s[2].get("team") == opp)
            actions = sum(
                1 for s in window
                if s[1] in ("TURNOVER", "PRESSURE_TRAP") and s[2].get("team") == team
            )
            out[team] = round(passes / actions, 1) if actions > 0 else float(passes)
        return out

    def def_lines(self, state: dict) -> Dict[str, float]:
        """Defensive line height in meters from each team's own goal line."""
        out = {}
        for team in ("NLA", "MCS"):
            dfs = [p for p in state["players"] if p["team"] == team and p["role"] == "DEF"]
            if not dfs:
                out[team] = 0.0
            elif team == "NLA":
                out[team] = round(min(p["x"] for p in dfs), 1)
            else:
                out[team] = round(PITCH_L - max(p["x"] for p in dfs), 1)
        return out

    def pitch_control_split(
        self,
        state: dict,
        overrides: Optional[List[dict]] = None,
    ) -> Dict[str, float]:
        """Territory ownership across the 16x12 xT grid.

        Each grid cell is attributed to whichever team has the stronger
        proximity + velocity-weighted influence around it. The result is the
        share of pitch territory currently controlled by NLA vs MCS.

        `overrides` relocates players before the attribution, which is how the
        interactive what-if sandbox evaluates a counterfactual against exactly
        the same surface the live pipeline uses.
        """
        moved = _moved_players(overrides)
        players = [p for p in state.get("players", []) if p.get("role") != "GK"]
        if not players:
            return {"nla_territory_pct": 50.0, "mcs_territory_pct": 50.0,
                    "neutral_pct": 0.0}
        nla, mcs = _influence_surface(players, moved)
        nla_wins = nla > mcs * 1.02
        mcs_wins = (~nla_wins) & (mcs > nla * 1.02)
        nla_cells = int(nla_wins.sum())
        mcs_cells = int(mcs_wins.sum())
        neutral_cells = XT_ROWS * XT_COLS - nla_cells - mcs_cells
        total = max(1, nla_cells + mcs_cells + neutral_cells)
        return {
            "nla_territory_pct": round(nla_cells / total * 100.0, 1),
            "mcs_territory_pct": round(mcs_cells / total * 100.0, 1),
            "neutral_pct": round(neutral_cells / total * 100.0, 1),
        }

    def passing_network_edges(self, state: dict, limit: int = 5) -> List[dict]:
        """Top passing lanes by xT weight across both teams.

        Each candidate lane is scored with the same 16x12 xT surface the rest
        of Stage B uses, so the 3D network overlay and the tactical math never
        disagree. `xt_weight` is the expected threat gained by the receiver.
        """
        outfield = [p for p in state.get("players", [])
                    if p.get("role") != "GK" and p.get("role") != "DEF"]
        edges: List[dict] = []
        for a in outfield:
            for b in outfield:
                if a["team"] != b["team"] or a["id"] == b["id"]:
                    continue
                d = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
                if d < 8.0 or d > 45.0:
                    continue
                weight = self.delta_xt(a["team"], (a["x"], a["y"]), (b["x"], b["y"]))
                if weight <= 0.0:
                    continue
                edges.append({
                    "from_id": a["id"],
                    "to_id": b["id"],
                    "team": a["team"],
                    "xt_weight": round(weight, 4),
                    "distance_m": round(d, 1),
                    "from_xy": {"x": round(a["x"], 2), "y": round(a["y"], 2)},
                    "to_xy": {"x": round(b["x"], 2), "y": round(b["y"], 2)},
                })
        edges.sort(key=lambda e: (-e["xt_weight"], e["from_id"], e["to_id"]))
        # Keep both teams represented in the network overlay: the top lanes of
        # each side are merged, then the strongest survive the global limit.
        per_team: Dict[str, List[dict]] = {"NLA": [], "MCS": []}
        for edge in edges:
            bucket = per_team.setdefault(edge["team"], [])
            if len(bucket) < 3:
                bucket.append(edge)
        merged = per_team.get("NLA", []) + per_team.get("MCS", [])
        merged.sort(key=lambda e: (-e["xt_weight"], e["from_id"], e["to_id"]))
        return merged[:limit]

    def top_xt_zones(self, limit: int = 3) -> List[dict]:
        """The highest-value Expected Threat cells on the 16x12 grid.

        Returned for both attacking directions so an agent can reason about
        where the space actually is, not where it assumes it is.
        """
        cells: List[Tuple[float, float, float]] = []
        for row in range(XT_ROWS):
            for col in range(XT_COLS):
                x = (col + 0.5) * PITCH_L / XT_COLS
                y = (row + 0.5) * PITCH_W / XT_ROWS
                cells.append((float(self.xt_grid[row, col]), x, y))
        cells.sort(reverse=True)
        out: List[dict] = []
        for value, x, y in cells[:max(1, limit)]:
            out.append({
                "x": round(x, 1),
                "y": round(y, 1),
                "xt": round(value, 4),
                "label": "HIGH xT ZONE",
                "attacking_team": "NLA",
                "mirror_x": round(PITCH_L - x, 1),
                "mirror_attacking_team": "MCS",
            })
        return out

    def evaluate_defensive_line_shift(
        self,
        state: dict,
        team: str,
        target_line_height_m: float,
    ) -> dict:
        """Evaluate a collective defensive line shift for one team.

        The backline unit (four deepest outfield players) slides in unison to a
        target height above their own goal line, and the midfield unit
        compresses proportionally so the block keeps a realistic topology.
        Everything returned is derived from the deterministic Stage B surfaces —
        the 16x12 xT tensor, the pitch-control attribution and the geometric
        block shape — so the browser twin can reproduce it exactly.
        """
        target = _clip(float(target_line_height_m), DEF_LINE_MIN_M, DEF_LINE_MAX_M)
        players = [p for p in state.get("players", []) if p.get("team") == team
                   and p.get("role") != "GK"]
        if not players:
            return {
                "team": team,
                "current_line_height_m": 0.0,
                "target_line_height_m": target,
                "delta_m": 0.0,
                "compactness_area_m2": 0.0,
                "compactness_area_after_m2": 0.0,
                "through_ball_exposure_xt": 0.0,
                "offside_trap_catch_prob_pct": 50.0,
                "press_compression_gain_pct": 0.0,
            }

        sign = 1.0 if team == "NLA" else -1.0
        outfield = list(players)

        def depth(p: dict) -> float:
            """Metres from this team's own goal line."""
            return float(p.get("x", 0.0)) if team == "NLA" else PITCH_L - float(p.get("x", 0.0))

        by_depth = sorted(outfield, key=depth)
        # The backline unit is the four players CLOSEST to their own goal.
        backline = by_depth[:4]
        midfield = by_depth[4:8]
        current_height = sum(depth(p) for p in backline) / len(backline)
        delta = target - current_height

        area_before = _convex_hull_area([(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
                                          for p in outfield])

        shifted: List[dict] = []
        for p in outfield:
            x = float(p.get("x", 0.0))
            if p in backline:
                # The line slides as a unit.
                x += sign * delta
            elif p in midfield:
                # The midfield compresses proportionally to keep the shape.
                x += sign * delta * 0.45
            shifted.append({**p, "x": x})

        area_after = _convex_hull_area([(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
                                         for p in shifted])

        # -- through-ball exposure behind the shifted line -----------------
        # Expected Threat in the band the defence now vacates, weighted by how
        # fast the opposition are running at it.
        opponents = [p for p in state.get("players", [])
                     if p.get("team") != team and p.get("role") != "GK"]
        new_line_depth = target
        exposure = 0.0
        for p in opponents:
            forward = float(p.get("vx", 0.0)) * (1.0 if team == "MCS" else -1.0)
            if forward <= 0.2:
                continue
            px = float(p.get("x", 0.0))
            # Depth of this attacker from the shifted team's goal line.
            attacker_depth = px if team == "NLA" else PITCH_L - px
            if attacker_depth >= new_line_depth:
                continue
            weight = min(1.6, forward / 5.0)
            exposure += self.xt_value(team, px, float(p.get("y", 34.0))) * weight
        through_ball_exposure = round(exposure, 4)

        # -- offside trap catch probability --------------------------------
        # Logistic on attacker proximity to the shifted offside line and the
        # cohesion (spread) of the defensive unit.
        depths = [depth(p) for p in backline]
        cohesion = max(0.0, 1.0 - (max(depths) - min(depths)) / 12.0) if depths else 0.0
        nearest_gap = 99.0
        for p in opponents:
            gap = abs(depth(p) - new_line_depth)
            nearest_gap = min(nearest_gap, gap)
        proximity = _clip(1.0 - nearest_gap / 9.0, 0.0, 1.0)
        logit = 1.35 * proximity + 0.75 * cohesion - 0.9
        catch_prob = round(_clip(5.0 + 90.0 / (1.0 + math.exp(-logit)), 5.0, 95.0), 1)

        # -- press compression gain ----------------------------------------
        # Share of central grid cells the opposition can use before and after.
        central_before = _central_usable_cells(state, team, None)
        central_after = _central_usable_cells(state, team, shifted)
        if central_before <= 0:
            press_gain = 0.0
        else:
            press_gain = round(
                _clip((central_before - central_after) / central_before * 100.0, -100.0, 100.0), 1)

        return {
            "team": team,
            "current_line_height_m": round(current_height, 1),
            "target_line_height_m": round(target, 1),
            "delta_m": round(delta, 1),
            "compactness_area_m2": round(area_before, 1),
            "compactness_area_after_m2": round(area_after, 1),
            "through_ball_exposure_xt": through_ball_exposure,
            "offside_trap_catch_prob_pct": catch_prob,
            "press_compression_gain_pct": press_gain,
            "line_cohesion": round(cohesion, 3),
            "backline_player_ids": [p.get("id") for p in backline],
            "midfield_player_ids": [p.get("id") for p in midfield],
        }

    def bio_load_summary(self, state: dict) -> dict:
        """Team-level fatigue read-out derived from the Stage A bio profiles.

        Stage A produces the per-player projection; Stage B interprets it:
        which players are the weakest links right now, and how much collective
        execution capacity the match has left.
        """
        players = state.get("players", [])
        profiles = []
        for p in players:
            profile = p.get("bio_load_profile") or {}
            if not profile:
                continue
            profiles.append({
                "player_id": p.get("id"),
                "player_name": p.get("name"),
                "team": p.get("team"),
                "role": p.get("role"),
                "sprint_load_index": profile.get("sprint_load_index", 0.0),
                "projected_stamina_10m": profile.get("projected_stamina_10m", 100.0),
                "fatigue_pdr_penalty": profile.get("fatigue_pdr_penalty", 0.0),
                "relief_required": bool(profile.get("relief_required")),
            })
        if not profiles:
            return {
                "mean_sprint_load_index": 0.0,
                "mean_projected_stamina_10m": 100.0,
                "max_fatigue_pdr_penalty": 0.0,
                "at_risk_count": 0,
                "most_at_risk": [],
            }
        loads = [row["sprint_load_index"] for row in profiles]
        projections = [row["projected_stamina_10m"] for row in profiles]
        penalties = [row["fatigue_pdr_penalty"] for row in profiles]
        at_risk = sorted(
            (row for row in profiles if row["relief_required"]),
            key=lambda row: (row["projected_stamina_10m"], -row["sprint_load_index"]),
        )
        return {
            "mean_sprint_load_index": round(sum(loads) / len(loads), 1),
            "mean_projected_stamina_10m": round(sum(projections) / len(projections), 1),
            "max_fatigue_pdr_penalty": round(max(penalties), 1),
            "at_risk_count": len(at_risk),
            "most_at_risk": at_risk[:3],
        }

    def snapshot(self, state: dict, t: Optional[float] = None) -> dict:
        t = t if t is not None else state["t_match"]
        window = [s for s in self.stream if s[0] >= t - self.window_s]
        turnovers = sum(1 for s in window if s[1] == "TURNOVER")
        speeds = [v for (_, v) in self.ball_speeds] or [0.0]
        if not self._stats_ready:
            self._init_stats(state, t)
        return {
            "chaos_index": round(self.chaos, 3),
            "chaos_state": self.classify(self.chaos),
            "chaos_history": [round(c, 3) for (_, c) in list(self.chaos_hist)[-120:]],
            "delta_chaos": round(self.delta_chaos(t), 3),
            "ppda": self.ppda(t),
            "def_lines": self.def_lines(state),
            "pressing_intensity": self._pressing_intensity(state),
            "turnover_rate": round(turnovers / (self.window_s / 60.0), 2),
            "ball_speed_var": round(float(np.var(speeds)), 1),
            "stretch_m": round(self._line_stretch(state) * 35.0, 1),
            "possession": state["possession"],
            "pitch_control_split": self.pitch_control_split(state),
            "passing_network_edges": self.passing_network_edges(state),
            "bio_load_summary": self.bio_load_summary(state),
            **self._match_stats_snapshot(state),
        }

    # --------------------------------------------------------------- enrich
    def enrich(self, ev: dict, state: dict) -> dict:
        """Attach Stage (b) metrics to a raw Stage (a) event + evaluate the AI gate."""
        t = ev.get("t_match", state["t_match"])
        ev = dict(ev)
        reasons: List[str] = []
        if ev.get("type") == "PASS":
            d = ev.get("distance_m", 0.0)
            v = ev.get("ball_speed_kmh", 0.0)
            ndef = ev.get("defenders_in_cone", 0)
            pdist = ev.get("nearest_defender_m", 10.0)
            ev["pdr"] = self.pass_difficulty(d, v, ndef, pdist)
            start, end = tuple(ev.get("start", (0, 0))), tuple(ev.get("end", (0, 0)))
            dxt = self.delta_xt(ev["team"], start, end)
            ev["delta_xt"] = round(dxt, 3)
            ev["ghost_pass"] = self.ghost_pass(
                state, ev["team"], ev.get("player_id"), start, actual_delta_xt=dxt)
        elif ev.get("type") == "SHOT":
            d = ev.get("distance_m", 0.0)
            v = ev.get("ball_speed_kmh", 0.0)
            ndef = ev.get("defenders_in_cone", 0)
            pdist = ev.get("nearest_defender_m", 10.0)
            ev["pdr"] = self.pass_difficulty(d, v, ndef, pdist)
            start, end = tuple(ev.get("start", (0, 0))), tuple(ev.get("end", (0, 0)))
            ev["delta_xt"] = round(self.delta_xt(ev["team"], start, end), 3)
            ev["ghost_pass"] = None
        else:
            ev["pdr"] = None
            ev["delta_xt"] = None
            ev["ghost_pass"] = None

        if ev.get("pdr") is not None and ev["pdr"] > 80.0:
            reasons.append("PDR > 80")
        dc = self.delta_chaos(t)
        ev["delta_chaos"] = round(dc, 3)
        if abs(dc) > 0.20:
            reasons.append("|ΔChaos| > 0.20")
        if (ev.get("delta_xt") or 0.0) > 0.08:
            reasons.append("ΔxT > 0.08")
        if ev.get("scenario"):
            reasons.append(f"Scenario: {ev['scenario']}")
        if ev.get("scenario_signature"):
            reasons.append("Scenario signature")
        ev["ai_gate"] = {"should_explain": bool(reasons), "reasons": reasons}

        pdr = ev.get("pdr") or 0.0
        dxt = ev.get("delta_xt") or 0.0
        ev["leverage"] = round(
            (pdr / 100.0) * 0.6 + max(0.0, dxt) * 2.0 + abs(dc) * 1.2
            + (0.4 if ev.get("scenario") else 0.0), 2
        )
        return ev
