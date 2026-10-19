"""
AETHER PITCH — Stage (a): "PitchForge" Synthetic Match Engine + Auto-Eventer
============================================================================
A physics-informed 10Hz state machine streaming synthetic tracking ticks for
22 players + ball on a standard 105m x 68m pitch, plus discrete match events
detected automatically from the raw coordinate stream (no manual tagging):

  * AUTO_SPRINT_ALERT  — player speed exceeds 30 km/h (8.33 m/s)
  * PASS / SHOT / SAVE / GOAL
  * PRESSURE_TRAP      — 3+ defenders within 6 m of the ball carrier
  * TURNOVER           — possession change (middle-third flagged)
  * TACTICAL_INVERSION / SCENARIO_END — God-Mode injection bookkeeping

"God Mode" scenario injection (judges):
  * chaos_counter        — high-speed 3v2 transition overload w/ line-breaking pass
  * high_press_turnover  — forced pressing turnover outside the box
  * tactical_inversion   — home right-back inverts into central midfield

100% synthetic: no real clubs, players, or proprietary tracking data.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

PITCH_L = 105.0
PITCH_W = 68.0
GOAL_CENTER = (PITCH_L, 34.0)
GOAL_HALF_WIDTH = 3.66
MIDDLE_THIRD = (35.0, 70.0)
MS_TO_KMH = 3.6

SPRINT_THRESHOLD_KMH = 30.0
PRESSURE_RADIUS_M = 6.0
PASS_CONE_HALF_DEG = 15.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


@dataclass
class Player:
    pid: str
    team: str            # "NLA" | "MCS"
    number: int
    name: str
    role: str            # "GK" | "DF" | "MF" | "FW"
    base: Tuple[float, float]   # attacking-normalised: x in [0,1] own goal -> opponent goal
    x: float = 0.0
    y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    stamina: float = 100.0
    max_speed: float = 8.2      # m/s
    inverted: bool = False

    @property
    def speed(self) -> float:
        return math.hypot(self.vx, self.vy)

    @property
    def speed_kmh(self) -> float:
        return self.speed * MS_TO_KMH


# (number, name, role, base_x [0..1 attacking], base_y [0..68], max_speed m/s)
SQUAD_NLA = [
    (1,  "T. Marlowe",   "GK", 0.045, 34.0, 6.4),
    (2,  "D. Keswick",   "DF", 0.24,  57.0, 8.3),   # RB (inverts on scenario)
    (5,  "S. Okonkwo",   "DF", 0.20,  43.5, 8.1),
    (6,  "A. Brandt",    "DF", 0.20,  24.5, 8.0),
    (3,  "L. Ferreira",  "DF", 0.24,  11.0, 8.2),
    (8,  "R. Callahan",  "MF", 0.46,  45.0, 8.0),
    (4,  "M. Diop",      "MF", 0.38,  34.0, 7.8),
    (10, "K. Nakamura",  "MF", 0.46,  23.0, 8.1),
    (7,  "J. Ardaiz",    "FW", 0.68,  57.0, 8.9),
    (9,  "V. Sorensen",  "FW", 0.76,  34.0, 8.6),
    (11, "E. Toussaint", "FW", 0.68,  11.0, 8.8),
]
SQUAD_MCS = [
    (31, "P. Vantera",   "GK", 0.045, 34.0, 6.4),
    (2,  "K. Whitmore",  "DF", 0.24,  57.0, 8.2),
    (4,  "R. Steiner",   "DF", 0.20,  43.5, 8.0),
    (5,  "J. Mensah",    "DF", 0.20,  24.5, 8.2),
    (24, "T. Okafor",    "DF", 0.24,  11.0, 8.3),
    (16, "H. Alvarez",   "MF", 0.36,  42.0, 7.9),   # DM
    (22, "N. Petrov",    "MF", 0.36,  26.0, 8.0),   # DM
    (7,  "C. Ambrose",   "MF", 0.55,  56.0, 8.7),   # RW
    (20, "F. Delacroix", "MF", 0.52,  34.0, 8.2),   # CAM
    (11, "S. Ibarra",    "MF", 0.55,  12.0, 8.6),   # LW
    (19, "B. Kovac",     "FW", 0.68,  34.0, 8.7),   # ST
]

SCENARIO_DESCRIPTIONS = {
    "chaos_counter": "3v2 high-chaos counter-attack: sprint burst >31.5 km/h + line-breaking pass",
    "high_press_turnover": "High defensive line forced + pressing trap turnover outside the box",
    "tactical_inversion": "Home right-back inverts into central defensive midfield for 60s",
}


class PitchForgeEngine:
    """Stateful 10Hz synthetic match simulator with automatic eventing."""

    SCENARIOS = ("chaos_counter", "high_press_turnover", "tactical_inversion")

    def __init__(self, seed: int = 42, start_minute: float = 62.0):
        self.rng = random.Random(seed)
        self.t_match = start_minute * 60.0
        self.score = {"NLA": 1, "MCS": 1}
        self.players: List[Player] = []
        self._build_squads()
        self.ball: Dict[str, float] = {"x": 52.5, "y": 34.0, "z": 0.0, "speed_kmh": 0.0}
        self.owner: Optional[Player] = None
        self.flight: Optional[Dict[str, Any]] = None
        self.possession = "NLA"
        self.hold_timer = 0.0
        self.pass_urge_timer = 0.0
        self.scenario: Optional[Dict[str, Any]] = None
        self.pressure_on = False
        self._sprint_cd: Dict[str, float] = {}
        self._trap_cd = 0.0
        self._insight_seq = 0
        self.kickoff("NLA", quiet=True)

    # ------------------------------------------------------------------ setup
    def _build_squads(self) -> None:
        for team, squad in (("NLA", SQUAD_NLA), ("MCS", SQUAD_MCS)):
            for num, name, role, bx, by, ms in squad:
                self.players.append(
                    Player(pid=f"{team}_{num}", team=team, number=num, name=name,
                           role=role, base=(bx, by), max_speed=ms)
                )
        self.by_id: Dict[str, Player] = {p.pid: p for p in self.players}

    def _world_base(self, p: Player) -> Tuple[float, float]:
        bx, by = p.base
        if p.inverted:  # tactical inversion: right-back -> central DM pocket
            bx, by = 0.40, 34.0
        x = bx * PITCH_L if p.team == "NLA" else PITCH_L - bx * PITCH_L
        return x, by

    def kickoff(self, team: str, quiet: bool = False) -> None:
        for p in self.players:
            wx, wy = self._world_base(p)
            p.x, p.y, p.vx, p.vy = wx, wy, 0.0, 0.0
        kicker = min(
            (p for p in self.players if p.team == team and p.role != "GK"),
            key=lambda p: abs(p.x - 52.5) + abs(p.y - 34.0),
        )
        kicker.x, kicker.y = 52.5 - (2.0 if team == "NLA" else -2.0), 34.0
        self.ball.update({"x": kicker.x, "y": kicker.y, "z": 0.0, "speed_kmh": 0.0})
        self.owner = kicker
        self.flight = None
        self.possession = team
        self.hold_timer = 0.0
        self.pass_urge_timer = 0.0
        if not quiet:
            self.events.append({"type": "KICKOFF", "team": team, "x": 52.5, "y": 34.0})

    @property
    def events(self) -> List[dict]:
        if not hasattr(self, "_events"):
            self._events: List[dict] = []
        return self._events

    # ------------------------------------------------------------- helpers
    def _attack_sign(self, team: str) -> float:
        return 1.0 if team == "NLA" else -1.0

    def _own_goal_x(self, team: str) -> float:
        return 0.0 if team == "NLA" else PITCH_L

    def _attack_progress(self, team: str, x: float) -> float:
        return x if team == "NLA" else PITCH_L - x

    def _team(self, team: str) -> List[Player]:
        return [p for p in self.players if p.team == team]

    def _opponents(self, team: str) -> List[Player]:
        other = "MCS" if team == "NLA" else "NLA"
        return self._team(other)

    def _pressure_count(self, carrier: Player) -> int:
        return sum(
            1 for o in self._opponents(carrier.team)
            if o.role != "GK" and math.hypot(o.x - carrier.x, o.y - carrier.y) < PRESSURE_RADIUS_M
        )

    def _segment_openness(self, a: Tuple[float, float], b: Tuple[float, float],
                          opponents: List[Player]) -> float:
        """Min distance from any opponent to segment a->b (m)."""
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy or 1e-6
        best = 999.0
        for o in opponents:
            t = _clamp(((o.x - ax) * dx + (o.y - ay) * dy) / seg2, 0.0, 1.0)
            px, py = ax + t * dx, ay + t * dy
            best = min(best, math.hypot(o.x - px, o.y - py))
        return best

    def _defenders_in_cone(self, start: Tuple[float, float], end: Tuple[float, float],
                           opponents: List[Player]) -> int:
        """Count defenders inside the passing cone (half-angle 15deg along the pass)."""
        ax, ay = start
        bx, by = end
        dx, dy = bx - ax, by - ay
        dist = math.hypot(dx, dy) or 1e-6
        ux, uy = dx / dist, dy / dist
        tan_half = math.tan(math.radians(PASS_CONE_HALF_DEG))
        count = 0
        for o in opponents:
            along = (o.x - ax) * ux + (o.y - ay) * uy
            if along <= 0 or along >= dist:
                continue
            perp = abs((o.x - ax) * -uy + (o.y - ay) * ux)
            if perp < tan_half * along + 0.6:
                count += 1
        return count

    def _emit(self, ev: dict) -> None:
        ev.setdefault("t_match", round(self.t_match, 2))
        ev.setdefault("clock", self.clock())
        self.events.append(ev)

    # ------------------------------------------------------------- scenarios
    def inject(self, name: str) -> Dict[str, Any]:
        if name not in self.SCENARIOS:
            raise ValueError(f"Unknown scenario '{name}'. Valid: {self.SCENARIOS}")
        if name == "chaos_counter":
            self.scenario = {"name": name, "left": 16.0, "forced_pass": True,
                             "forced_turnover_at": None, "done": False}
            w = self.by_id["NLA_7"]
            self._set_possession(w, middle_third=True, quiet=True)
            w.x, w.y = 50.0, 32.0
            for pid, (px, py) in (("NLA_9", (72.0, 38.0)), ("NLA_11", (70.0, 16.0))):
                p = self.by_id[pid]
                p.x, p.y = px, py
            self.hold_timer = 0.0
            self.pass_urge_timer = 99.0  # fire the line-breaking pass next tick
        elif name == "high_press_turnover":
            cb = self.by_id["NLA_6"]
            self._set_possession(cb, middle_third=False, quiet=True)
            cb.x, cb.y = 38.0, 30.0
            self.ball.update({"x": 38.0, "y": 30.0, "z": 0.0})
            self.scenario = {"name": name, "left": 14.0, "forced_pass": False,
                             "forced_turnover_at": self.t_match + 2.5, "done": False}
        elif name == "tactical_inversion":
            self.by_id["NLA_2"].inverted = True
            self.scenario = {"name": name, "left": 60.0, "forced_pass": False,
                             "forced_turnover_at": None, "done": False}
            self._emit({"type": "TACTICAL_INVERSION", "team": "NLA",
                        "player_id": "NLA_2", "player_name": "D. Keswick",
                        "x": self.by_id["NLA_2"].x, "y": self.by_id["NLA_2"].y,
                        "detail": "Right-back inverting into central midfield"})
        return {"status": "ok", "scenario": name,
                "description": SCENARIO_DESCRIPTIONS[name],
                "duration_s_sim": self.scenario["left"] if name != "tactical_inversion" else 60.0}

    def _end_scenario(self) -> None:
        if self.scenario and self.scenario["name"] == "tactical_inversion":
            self.by_id["NLA_2"].inverted = False
        self._emit({"type": "SCENARIO_END", "scenario": self.scenario["name"]})
        self.scenario = None

    def _set_possession(self, p: Player, middle_third: bool = False, quiet: bool = False) -> None:
        prev = self.possession
        self.owner = p
        self.flight = None
        self.possession = p.team
        self.hold_timer = 0.0
        self.pass_urge_timer = 0.0
        if not quiet:
            self._emit({
                "type": "TURNOVER", "team": p.team, "previous_team": prev,
                "player_id": p.pid, "player_name": p.name,
                "x": round(p.x, 2), "y": round(p.y, 2),
                "middle_third": middle_third,
            })

    # ------------------------------------------------------------- main tick
    def tick(self, dt: float) -> Tuple[dict, List[dict]]:
        self._events = []
        self.t_match += dt
        if self.scenario:
            self.scenario["left"] -= dt
            fta = self.scenario.get("forced_turnover_at")
            if fta is not None and not self.scenario["done"] and self.t_match >= fta:
                self._forced_press_turnover()
                self.scenario["done"] = True
            if self.scenario["left"] <= 0:
                self._end_scenario()
        if self.flight:
            self._advance_flight(dt)
        elif self.owner:
            self._decide(dt)
        self._team_motion(dt)
        self._attach_ball()
        self._auto_events(dt)
        return self.state(), self.events

    def _forced_press_turnover(self) -> None:
        ball_xy = (self.ball["x"], self.ball["y"])
        pressers = [p for p in self._opponents(self.possession) if p.role != "GK"]
        pressers.sort(key=lambda p: math.hypot(p.x - ball_xy[0], p.y - ball_xy[1]))
        thief = pressers[0]
        self._emit({"type": "PRESSURE_TRAP", "team": thief.team,
                    "player_id": thief.pid, "player_name": thief.name,
                    "players": [p.pid for p in pressers[:3]],
                    "x": ball_xy[0], "y": ball_xy[1],
                    "detail": "Coordinated pressing trap wins the ball high"})
        middle = MIDDLE_THIRD[0] <= ball_xy[0] <= MIDDLE_THIRD[1]
        self._set_possession(thief, middle_third=middle)

    def _decide(self, dt: float) -> None:
        carrier = self.owner
        if carrier is None:
            return
        self.hold_timer += dt
        self.pass_urge_timer += dt
        sc = self.scenario["name"] if self.scenario else None

        goal_x = GOAL_CENTER[0] if carrier.team == "NLA" else 0.0
        dist_goal = math.hypot(goal_x - carrier.x, 34.0 - carrier.y)
        shoot_range = 30.0 if sc == "chaos_counter" else 24.0
        if dist_goal <= shoot_range and abs(carrier.y - 34.0) <= 16.0 and self.hold_timer > 1.0:
            if self.rng.random() < (0.55 if sc == "chaos_counter" else 0.18):
                self._shoot(carrier)
                return

        pressure = self._pressure_count(carrier)
        max_hold = 1.2 if pressure >= 2 else 3.2
        if self.scenario and self.scenario.get("forced_pass"):
            self.scenario["forced_pass"] = False
            self._pass(carrier, reason="line_breaking")
            return
        if pressure >= 3 and self.hold_timer > 0.4:
            self._pass(carrier, reason="under_pressure")
        elif self.hold_timer > max_hold:
            self._pass(carrier, reason="buildup")

    def _pass(self, carrier: Player, reason: str) -> None:
        teammates = [t for t in self._team(carrier.team) if t.pid != carrier.pid]
        opponents = self._opponents(carrier.team)
        cands = []
        for t in teammates:
            dist = math.hypot(t.x - carrier.x, t.y - carrier.y)
            if dist < 4:
                continue
            open_m = self._segment_openness((carrier.x, carrier.y), (t.x, t.y), opponents)
            prog = self._attack_progress(carrier.team, t.x) - self._attack_progress(carrier.team, carrier.x)
            w = open_m * 0.9 + prog * 0.06 - (4.0 if dist > 50 else 0.0)
            if t.role == "GK":
                w -= 6.0
            cands.append((w, t, dist, open_m))
        cands.sort(key=lambda c: -c[0])
        pool = cands[:4] if len(cands) >= 4 else cands
        if not pool:
            return
        weights = [max(0.05, c[0]) for c in pool]
        _, target, dist, open_m = self.rng.choices(pool, weights=weights, k=1)[0]

        speed_ms = _clamp(16.0 + dist * 0.35, 14.0, 30.0)
        flight_t = dist / speed_ms
        aim = (target.x + target.vx * flight_t, target.y + target.vy * flight_t)
        start = (carrier.x, carrier.y)
        self.flight = {
            "from": start, "to": aim, "speed": speed_ms, "travelled": 0.0,
            "dist": dist, "target_pid": target.pid, "is_shot": False,
            "line_breaking": reason == "line_breaking",
        }
        self.owner = None
        cone = self._defenders_in_cone(start, aim, opponents)
        nearest = min(
            (math.hypot(o.x - start[0], o.y - start[1]) for o in opponents),
            default=20.0,
        )
        self._emit({
            "type": "PASS", "team": carrier.team, "player_id": carrier.pid,
            "player_name": carrier.name, "start": [round(start[0], 2), round(start[1], 2)],
            "end": [round(aim[0], 2), round(aim[1], 2)],
            "ball_speed_kmh": round(speed_ms * MS_TO_KMH, 1),
            "distance_m": round(dist, 1),
            "defenders_in_cone": cone,
            "nearest_defender_m": round(nearest, 2),
            "target_id": target.pid, "reason": reason,
            "line_breaking": reason == "line_breaking",
            "scenario": self.scenario["name"] if self.scenario else None,
        })

    def _shoot(self, carrier: Player) -> None:
        goal_x = GOAL_CENTER[0] if carrier.team == "NLA" else 0.0
        aim_y = 34.0 + self.rng.uniform(-3.2, 3.2) * (1.4 if self.rng.random() < 0.25 else 1.0)
        dist = math.hypot(goal_x - carrier.x, aim_y - carrier.y)
        speed_ms = self.rng.uniform(25.0, 31.0)
        start = (carrier.x, carrier.y)
        self.flight = {"from": start, "to": (goal_x, aim_y), "speed": speed_ms,
                       "travelled": 0.0, "dist": dist, "target_pid": None,
                       "is_shot": True, "line_breaking": False,
                       "shooter_pid": carrier.pid, "shooter_name": carrier.name}
        self.owner = None
        opponents = self._opponents(carrier.team)
        cone = self._defenders_in_cone(start, (goal_x, aim_y), opponents)
        self._emit({
            "type": "SHOT", "team": carrier.team, "player_id": carrier.pid,
            "player_name": carrier.name, "start": [round(start[0], 2), round(start[1], 2)],
            "end": [round(goal_x, 2), round(aim_y, 2)],
            "ball_speed_kmh": round(speed_ms * MS_TO_KMH, 1),
            "distance_m": round(dist, 1), "defenders_in_cone": cone,
            "nearest_defender_m": round(min(
                (math.hypot(o.x - start[0], o.y - start[1]) for o in opponents), default=20.0), 2),
            "scenario": self.scenario["name"] if self.scenario else None,
        })

    def _advance_flight(self, dt: float) -> None:
        f = self.flight
        if f is None:
            return
        f["travelled"] += f["speed"] * dt
        prog = _clamp(f["travelled"] / f["dist"], 0.0, 1.0)
        bx = f["from"][0] + (f["to"][0] - f["from"][0]) * prog
        by = f["from"][1] + (f["to"][1] - f["from"][1]) * prog
        f["z"] = math.sin(prog * math.pi) * min(6.0, f["dist"] * 0.08)
        self.ball.update({"x": bx, "y": by, "speed_kmh": f["speed"] * MS_TO_KMH})

        if not f["is_shot"]:
            for o in self._opponents(self.possession):
                if math.hypot(o.x - bx, o.y - by) < 1.2 and self.rng.random() < 0.8:
                    middle = MIDDLE_THIRD[0] <= bx <= MIDDLE_THIRD[1]
                    self._emit({"type": "INTERCEPTION", "team": o.team,
                                "player_id": o.pid, "player_name": o.name,
                                "x": round(bx, 2), "y": round(by, 2)})
                    self._set_possession(o, middle_third=middle)
                    return

        if prog >= 1.0:
            self._resolve_arrival(f, bx, by)

    def _resolve_arrival(self, f: dict, bx: float, by: float) -> None:
        self.flight = None
        self.ball.update({"z": 0.0})
        if f["is_shot"]:
            shooter_team = self.possession
            in_mouth = abs(by - 34.0) <= GOAL_HALF_WIDTH
            scored = in_mouth and self.rng.random() > 0.62
            gk = next(p for p in self._team("MCS" if shooter_team == "NLA" else "NLA") if p.role == "GK")
            if scored:
                self.score[shooter_team] = self.score.get(shooter_team, 0) + 1
                self._emit({"type": "GOAL", "team": shooter_team,
                            "player_id": f.get("shooter_pid"),
                            "player_name": f.get("shooter_name"),
                            "x": round(bx, 2), "y": round(by, 2),
                            "score": dict(self.score)})
                self.kickoff("MCS" if shooter_team == "NLA" else "NLA")
            else:
                self._emit({"type": "SAVE", "team": shooter_team,
                            "player_id": gk.pid, "player_name": gk.name,
                            "shooter_pid": f.get("shooter_pid"),
                            "shooter_name": f.get("shooter_name"),
                            "x": round(bx, 2), "y": round(by, 2), "outcome": "SAVE"})
                self._set_possession(gk, middle_third=False, quiet=True)
            return
        target = self.by_id.get(f.get("target_pid") or "")
        if target is None:
            target = min(self._team(self.possession),
                         key=lambda p: math.hypot(p.x - bx, p.y - by))
        self._set_possession(target, middle_third=False, quiet=True)

    # ------------------------------------------------------------- motion
    def _steer(self, p: Player, tx: float, ty: float, spd: float, dt: float) -> None:
        dx, dy = tx - p.x, ty - p.y
        d = math.hypot(dx, dy) or 1e-6
        wx, wy = dx / d * spd, dy / d * spd
        accel = 7.0 * dt
        p.vx += _clamp(wx - p.vx, -accel, accel)
        p.vy += _clamp(wy - p.vy, -accel, accel)
        sp = math.hypot(p.vx, p.vy)
        cap = p.max_speed * (0.92 if p.stamina < 50.0 else 1.0)
        if sp > cap:
            p.vx, p.vy = p.vx / sp * cap, p.vy / sp * cap
        p.x = _clamp(p.x + p.vx * dt, 0.5, PITCH_L - 0.5)
        p.y = _clamp(p.y + p.vy * dt, 0.5, PITCH_W - 0.5)
        p.stamina = _clamp(
            p.stamina - dt * (0.008 + 0.05 * (sp / p.max_speed) ** 2) + dt * 0.02, 40.0, 100.0
        )

    def _team_motion(self, dt: float) -> None:
        poss = self.possession
        ball_xy = (self.ball["x"], self.ball["y"])
        sc = self.scenario["name"] if self.scenario else None
        defenders = self._opponents(poss)
        pressers: List[Player] = []
        if sc == "high_press_turnover" and self.scenario and not self.scenario["done"]:
            pressers = [p for p in defenders if p.role != "GK"]
        else:
            pressers = sorted(
                (p for p in defenders if p.role != "GK"),
                key=lambda p: math.hypot(p.x - ball_xy[0], p.y - ball_xy[1]),
            )[:2]
        presser_ids = {p.pid for p in pressers}

        for p in self.players:
            bx, by = self._world_base(p)
            if p.role == "GK":
                own = self._own_goal_x(p.team)
                gx = own + (2.5 if p.team == "NLA" else -2.5)
                self._steer(p, gx, _clamp(34.0 + (ball_xy[1] - 34.0) * 0.3, 27.0, 41.0),
                            3.0, dt)
                continue
            if self.owner is not None and p.pid == self.owner.pid:
                # carrier: drive at the opponent goal, drift laterally
                sign = self._attack_sign(p.team)
                spd = 5.6
                if sc == "chaos_counter" and p.team == poss:
                    spd = 9.0 if p.role == "FW" else 7.5
                tx = _clamp(p.x + sign * 14.0, 2.0, PITCH_L - 2.0)
                ty = 34.0 + math.sin(self.t_match * 0.25) * 10.0
                self._steer(p, tx, ty, spd, dt)
                continue
            if p.team == poss:
                # supporting shape: base position shifted toward the ball
                tx = _clamp(bx + (ball_xy[0] - bx) * 0.22, 1.0, PITCH_L - 1.0)
                ty = _clamp(by + (ball_xy[1] - by) * 0.28, 2.0, PITCH_W - 2.0)
                spd = 4.6 + (1.2 if p.role == "FW" else 0.0)
                if sc == "chaos_counter" and p.team == poss and p.role == "FW":
                    spd = 8.8
                self._steer(p, tx, ty, spd, dt)
            elif p.pid in presser_ids:
                spd = min(p.max_speed * 0.98, 3.0 + math.hypot(
                    ball_xy[0] - p.x, ball_xy[1] - p.y) * 0.6)
                if sc == "high_press_turnover":
                    spd = p.max_speed
                self._steer(p, ball_xy[0], ball_xy[1], spd, dt)
            else:
                # defensive shape: compressed toward own goal + ball-side shift
                own = self._own_goal_x(p.team)
                if p.team == "NLA":
                    compress = 0.80
                    if sc == "chaos_counter":
                        compress = 0.88  # back-pedalling under counter
                    tx = own + (bx - own) * compress + (ball_xy[0] - 52.5) * 0.18
                else:
                    compress = 0.80
                    if sc == "chaos_counter":
                        compress = 0.94  # high line left exposed
                    tx = own - (own - bx) * compress + (ball_xy[0] - 52.5) * 0.18
                tx = _clamp(tx, 1.0, PITCH_L - 1.0)
                ty = _clamp(by + (ball_xy[1] - by) * 0.30, 2.0, PITCH_W - 2.0)
                self._steer(p, tx, ty, 4.2, dt)

    def _attach_ball(self) -> None:
        if self.owner is not None and self.flight is None:
            c = self.owner
            sp = c.speed or 1.0
            lead = 0.7
            self.ball.update({
                "x": _clamp(c.x + c.vx / sp * lead, 0.3, PITCH_L - 0.3),
                "y": _clamp(c.y + c.vy / sp * lead, 0.3, PITCH_W - 0.3),
                "z": 0.0,
                "speed_kmh": round(c.speed_kmh, 1),
            })

    # --------------------------------------------------------- auto-eventing
    def _auto_events(self, dt: float) -> None:
        ball_xy = (self.ball["x"], self.ball["y"])
        poss = self.possession
        for p in self.players:
            if p.speed_kmh > SPRINT_THRESHOLD_KMH:
                last = self._sprint_cd.get(p.pid, -99.0)
                if self.t_match - last > 8.0:
                    self._sprint_cd[p.pid] = self.t_match
                    self._emit({"type": "AUTO_SPRINT_ALERT", "team": p.team,
                                "player_id": p.pid, "player_name": p.name,
                                "speed_kmh": round(p.speed_kmh, 1),
                                "x": round(p.x, 2), "y": round(p.y, 2)})
        if self._trap_cd <= 0:
            pressing = [o for o in self._opponents(poss)
                        if o.role != "GK" and math.hypot(o.x - ball_xy[0], o.y - ball_xy[1]) < PRESSURE_RADIUS_M]
            if len(pressing) >= 3:
                self._trap_cd = 8.0
                self._emit({"type": "PRESSURE_TRAP", "team": "MCS" if poss == "NLA" else "NLA",
                            "players": [o.pid for o in pressing],
                            "x": round(ball_xy[0], 2), "y": round(ball_xy[1], 2),
                            "detail": f"{len(pressing)} defenders collapse within {PRESSURE_RADIUS_M:.0f} m"})
        self._trap_cd = max(0.0, self._trap_cd - dt)

    # ------------------------------------------------------------- output
    def clock(self) -> str:
        total = self.t_match
        m = int(total // 60)
        s = int(total % 60)
        if m >= 120:
            return "90:00+"
        return f"{m:02d}:{s:02d}"

    def state(self) -> dict:
        return {
            "type": "tick",
            "t_match": round(self.t_match, 2),
            "clock": self.clock(),
            "score": dict(self.score),
            "possession": self.possession,
            "players": [
                {"id": p.pid, "team": p.team, "number": p.number, "name": p.name,
                 "role": p.role, "x": round(p.x, 2), "y": round(p.y, 2),
                 "vx": round(p.vx, 2), "vy": round(p.vy, 2),
                 "speed_kmh": round(p.speed_kmh, 1), "stamina": round(p.stamina, 1)}
                for p in self.players
            ],
            "ball": {"x": round(self.ball["x"], 2), "y": round(self.ball["y"], 2),
                     "z": round(self.ball.get("z", 0.0), 2),
                     "speed_kmh": round(self.ball.get("speed_kmh", 0.0), 1)},
            "carrier": self.owner.pid if self.owner else None,
            "scenario": self.scenario["name"] if self.scenario else None,
            "scenario_left": round(self.scenario["left"], 1) if self.scenario else None,
        }
