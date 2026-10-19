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
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

PITCH_L, PITCH_W = 105.0, 68.0
XT_COLS, XT_ROWS = 16, 12
XT_MIN, XT_MAX = 0.004, 0.350

# Control-vs-Chaos weights (spec Stage b)
W_TURNOVER, W_VARIANCE, W_STRETCH, W_PRESS = 0.35, 0.25, 0.20, 0.20

CHAOS_CONTROL = 0.40
CHAOS_CHAOS = 0.68


def _clip(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


class TacticalMathEngine:
    def __init__(self, window_s: float = 60.0):
        self.window_s = window_s
        self.xt_grid = self._build_xt_grid()          # (12, 16) attacking toward +x
        self.stream: deque = deque()                  # (t, kind, payload)
        self.ball_speeds: deque = deque()             # (t, kmh)
        self.chaos_hist: deque = deque(maxlen=600)    # (t, chaos) sampled 2Hz (match time)
        self.chaos = 0.30
        self.scenario_boost = 0.0
        self._last_recompute = -1e9
        self._last_hist = -1e9

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
        """Bilinear xT at a point for `team` (grid always points at each team's own attack)."""
        xs = x if team == "NLA" else PITCH_L - x
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
                   start: Tuple[float, float]) -> Optional[dict]:
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
                        "delta_xt": round(dxt, 3), "target_id": tm["id"],
                        "openness_m": round(openness, 1)}
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
        """Vertical stretch of the in-possession structure: deepest DF -> highest MF, /35 m."""
        team = state["possession"]
        players = [p for p in state["players"] if p["team"] == team and p["role"] != "GK"]
        dfs = [p for p in players if p["role"] == "DF"] or players
        mfs = [p for p in players if p["role"] == "MF"] or players
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
            dfs = [p for p in state["players"] if p["team"] == team and p["role"] == "DF"]
            if not dfs:
                out[team] = 0.0
            elif team == "NLA":
                out[team] = round(min(p["x"] for p in dfs), 1)
            else:
                out[team] = round(PITCH_L - max(p["x"] for p in dfs), 1)
        return out

    def snapshot(self, state: dict, t: Optional[float] = None) -> dict:
        t = t if t is not None else state["t_match"]
        window = [s for s in self.stream if s[0] >= t - self.window_s]
        turnovers = sum(1 for s in window if s[1] == "TURNOVER")
        speeds = [v for (_, v) in self.ball_speeds] or [0.0]
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
            ev["ghost_pass"] = self.ghost_pass(state, ev["team"], ev.get("player_id"), start)
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
        ev["ai_gate"] = {"should_explain": bool(reasons), "reasons": reasons}

        pdr = ev.get("pdr") or 0.0
        dxt = ev.get("delta_xt") or 0.0
        ev["leverage"] = round(
            (pdr / 100.0) * 0.6 + max(0.0, dxt) * 2.0 + abs(dc) * 1.2
            + (0.4 if ev.get("scenario") else 0.0), 2
        )
        return ev
