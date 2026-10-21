"""
AETHER PITCH v2.0 — Stage (a): "PitchForge" Synthetic Match Engine + Auto-Eventer
=================================================================================
Physics-informed 10Hz state machine streaming synthetic tracking telemetry for
22 players + ball on a standard 105m x 68m pitch, now with **3D pose states**
for the WebGL broadcast engine:

Per-player telemetry (10Hz):
  id, name, shirt_number, team (NLA | MCS), role (GK | DEF | MID | FWD),
  x (0..105), y (0..68), vx, vy, speed_kmh, stamina (0..100),
  heading_rad   — smoothed atan2(vy, vx); avatars face movement, or the ball
                  when idle, with shortest-arc smoothing
  pose_state    — KICK (0.5s after pass/shot) > SPRINT (>= 28 km/h) >
                  PRESS (within 5 m of the carrier) > JOG (>= 3 km/h) > IDLE
  playstyle_badge — RAPID (>= 30 km/h) computed here; INCISIVE_PASS and
                  INTERCEPT are pushed in by the orchestrator (Stage b/c)

Ball telemetry: x, y, z, vx, vy, vz, speed_kmh, pass_start, pass_end,
                is_lofted (long balls / shots arc at 6.5 m, passes at 1.2 m)

Auto-eventing: AUTO_SPRINT_ALERT, AUTO_DISTANCE_ALERT, PASS (15deg cone),
PASS_COMPLETE, TACKLE, SHOT, SHOT_OFF_TARGET, SAVE, GOAL, PRESSURE_TRAP (3+ defenders < 6 m),
TURNOVER (middle-third flag), TACTICAL_INVERSION, SCENARIO_END.

Each tick includes synthetic match metadata (competition, venue, teams) and a
per-player cumulative distance + top speed so the overlay can tag every player
with speed and distance thresholds without manual tagging.

"God Mode" injection: chaos_counter | high_press_turnover | tactical_inversion.

100% synthetic: no real clubs, players, or proprietary tracking data.
Clubs: North Larchmont Athletic (NLA, crimson/gold) vs Meridian City SC (MCS, cyan/navy)
(MCS, electric cyan/navy).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

PITCH_L = 105.0
PITCH_W = 68.0
GOAL_CENTER = (PITCH_L, 34.0)
GOAL_HALF_WIDTH = 3.66
MIDDLE_THIRD = (35.0, 70.0)
MS_TO_KMH = 3.6

SPRINT_THRESHOLD_KMH = 30.0
SPRINT_POSE_KMH = 28.0
PRESSURE_RADIUS_M = 6.0
PRESS_POSE_RADIUS_M = 5.0
PASS_CONE_HALF_DEG = 15.0
KICK_POSE_S = 0.5


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _lerp_angle(a: float, b: float, t: float) -> float:
    """Shortest-arc angular interpolation."""
    d = (b - a + math.pi) % (2.0 * math.pi) - math.pi
    return a + d * t


@dataclass
class Player:
    pid: str
    team: str            # "NLA" | "MCS"
    number: int
    name: str
    role: str            # "GK" | "DEF" | "MID" | "FWD"
    base: Tuple[float, float]   # attacking-normalised x in [0,1], y in [0,68]
    x: float = 0.0
    y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    stamina: float = 100.0
    max_speed: float = 8.2      # m/s
    inverted: bool = False
    heading: float = 0.0        # radians, smoothed facing direction
    distance_m: float = 0.0     # cumulative distance covered this match
    sprint_distance_m: float = 0.0
    top_speed_kmh: float = 0.0
    next_distance_alert_m: float = 0.0
    bio_load: float = 0.0       # rolling high-intensity metabolic load (0..100)
    high_intensity_seconds: float = 0.0
    press_events: int = 0

    @property
    def speed(self) -> float:
        return math.hypot(self.vx, self.vy)

    @property
    def speed_kmh(self) -> float:
        return self.speed * MS_TO_KMH


# (number, name, role, base_x [0..1 attacking], base_y [0..68], max_speed m/s)
SQUAD_NLA = [
    (1,  "T. Marlowe",   "GK",  0.045, 34.0, 6.4),
    (2,  "D. Keswick",   "DEF", 0.24,  57.0, 8.3),   # RB (inverts on scenario)
    (5,  "S. Okonkwo",   "DEF", 0.20,  43.5, 8.1),
    (6,  "A. Brandt",    "DEF", 0.20,  24.5, 8.0),
    (3,  "L. Ferreira",  "DEF", 0.24,  11.0, 8.2),
    (8,  "R. Callahan",  "MID", 0.46,  45.0, 8.0),
    (4,  "M. Diop",      "MID", 0.38,  34.0, 7.8),
    (10, "K. Nakamura",  "MID", 0.46,  23.0, 8.1),
    (7,  "J. Ardaiz",    "FWD", 0.68,  57.0, 8.9),
    (9,  "V. Sorensen",  "FWD", 0.76,  34.0, 8.6),
    (11, "E. Toussaint", "FWD", 0.68,  11.0, 8.8),
]
SQUAD_MCS = [
    (31, "P. Vantera",   "GK",  0.045, 34.0, 6.4),
    (2,  "K. Whitmore",  "DEF", 0.24,  57.0, 8.2),
    (4,  "R. Steiner",   "DEF", 0.20,  43.5, 8.0),
    (5,  "J. Mensah",    "DEF", 0.20,  24.5, 8.2),
    (24, "T. Okafor",    "DEF", 0.24,  11.0, 8.3),
    (16, "H. Alvarez",   "MID", 0.36,  42.0, 7.9),   # DM
    (22, "N. Petrov",    "MID", 0.36,  26.0, 8.0),   # DM
    (7,  "C. Ambrose",   "MID", 0.55,  56.0, 8.7),   # RW
    (20, "F. Delacroix", "MID", 0.52,  34.0, 8.2),   # CAM
    (11, "S. Ibarra",    "MID", 0.55,  12.0, 8.6),   # LW
    (19, "B. Kovac",     "FWD", 0.68,  34.0, 8.7),   # ST
]

SCENARIO_DESCRIPTIONS = {
    "chaos_counter": "3v2 high-chaos counter-attack: sprint burst >31.5 km/h + line-breaking pass",
    "high_press_turnover": "High defensive line forced + pressing trap turnover outside the box",
    "tactical_inversion": "Home right-back inverts into central defensive midfield for 60s",
}

# Ingested at kickoff by the pipeline so every render packet can carry the
# broadcast metadata a studio graphics system needs. 100% synthetic.
MATCH_METADATA = {
    "match_id": "SYN-PL-2026-1019-NLA-MCS",
    "competition": "AETHER Synthetic League",
    "season": "2026/27",
    "matchday": 9,
    "venue": "Aether Arena",
    "city": "Synthetic City",
    "kickoff_utc": "2026-10-19T19:45:00Z",
    "home_team": {
        "id": "NLA", "name": "North Larchmont Athletic",
        "short_name": "NLA", "kit": "crimson/gold",
    },
    "away_team": {
        "id": "MCS", "name": "Meridian City SC",
        "short_name": "MCS", "kit": "cyan/navy",
    },
    "data_source": "PitchForge synthetic 10Hz engine",
    "synthetic": True,
    "disclaimer": "All clubs, players, crests and tracking samples are fictional.",
}


class MilestoneTracker:
    """Live player / match milestone detector fed by Stage (a) + (b)."""

    SPRINT_FLOOR_KMH = 31.5
    PASS_STREAK_TARGET = 5
    PRESS_TARGET_S = 30.0

    def __init__(self) -> None:
        self.sprint_peak_kmh = 0.0
        self.sprint_peak_player: Optional[dict] = None
        self.last_sprint_emit_t = -999.0
        self.pass_streak = 0
        self.pass_streak_xt = 0.0
        self.pass_streak_pdr: List[float] = []
        self.pass_mastery_emitted = False
        self.final_third_s = 0.0
        self.press_team: Optional[str] = None
        self.press_emitted = False
        self.last_t: Optional[float] = None
        self.milestones: List[dict] = []
        self._seq = 0

    def _emit(self, kind: str, clock: str, t: float, headline: str,
              detail: str, **extra: Any) -> dict:
        self._seq += 1
        event = {
            "id": f"ms_{self._seq:04d}",
            "type": kind,
            "clock": clock,
            "t_match": round(t, 2),
            "headline": headline,
            "detail": detail,
            **extra,
        }
        self.milestones.append(event)
        del self.milestones[:-24]
        return event

    def update(self, state: dict, events: List[dict],
               metrics: Optional[dict] = None) -> List[dict]:
        emitted: List[dict] = []
        t = float(state.get("t_match", 0.0))
        dt = max(0.0, min(0.5, t - self.last_t)) if self.last_t is not None else 0.0
        self.last_t = t
        clock = state.get("clock", "--:--")

        fastest = max((p for p in state.get("players", []) if p.get("role") != "GK"),
                      key=lambda p: p.get("speed_kmh", 0.0), default=None)
        if fastest and fastest.get("speed_kmh", 0.0) > max(self.SPRINT_FLOOR_KMH, self.sprint_peak_kmh):
            self.sprint_peak_kmh = float(fastest["speed_kmh"])
            self.sprint_peak_player = dict(fastest)
            if t - self.last_sprint_emit_t > 5.0:
                self.last_sprint_emit_t = t
                percentile = min(99.9, 95.0 + (self.sprint_peak_kmh - 32.0) * 1.4)
                emitted.append(self._emit(
                    "MILESTONE_SPRINT_PEAK", clock, t,
                    f"New Match Sprint Record: #{fastest.get('shirt_number')} {fastest.get('name')} reached "
                    f"{self.sprint_peak_kmh:.1f} km/h",
                    f"Top {100.0 - percentile:.1f}% synthetic speed percentile",
                    team=fastest.get("team"), player_id=fastest.get("id"),
                    player_name=fastest.get("name"), speed_kmh=round(self.sprint_peak_kmh, 1),
                ))

        for ev in events:
            if ev.get("type") == "PASS":
                pdr = float(ev.get("pdr") or 0.0)
                dxt = float(ev.get("delta_xt") or 0.0)
                if pdr >= 78.0:
                    self.pass_streak += 1
                    self.pass_streak_xt += max(0.0, dxt)
                    self.pass_streak_pdr.append(pdr)
                    if self.pass_streak >= self.PASS_STREAK_TARGET and not self.pass_mastery_emitted:
                        self.pass_mastery_emitted = True
                        avg = sum(self.pass_streak_pdr) / len(self.pass_streak_pdr)
                        emitted.append(self._emit(
                            "MILESTONE_PASS_MASTERY", clock, t,
                            f"{self.pass_streak}th Consecutive High-Difficulty Line-Breaking Pass",
                            f"Avg PDR: {avg:.1f}% | +{self.pass_streak_xt:.2f} Cumulative xT",
                            team=ev.get("team"), player_id=ev.get("player_id"),
                            player_name=ev.get("player_name"), value=round(self.pass_streak_xt, 3),
                            pdr=round(avg, 1),
                        ))
                elif pdr < 65.0:
                    self.pass_streak = 0
                    self.pass_streak_xt = 0.0
                    self.pass_streak_pdr = []
                    self.pass_mastery_emitted = False
            elif ev.get("type") in ("TURNOVER", "INTERCEPTION"):
                self.pass_streak = 0
                self.pass_streak_xt = 0.0
                self.pass_streak_pdr = []
                self.pass_mastery_emitted = False

        poss = state.get("possession")
        ball = state.get("ball") or {}
        in_final_third = (
            (poss == "NLA" and ball.get("x", 0.0) >= 70.0)
            or (poss == "MCS" and ball.get("x", 105.0) <= 35.0)
        )
        pressing = int((metrics or {}).get("pressing_intensity", 0) or 0)
        if in_final_third and pressing >= 2:
            if self.press_team != poss:
                self.press_team = poss
                self.final_third_s = 0.0
                self.press_emitted = False
            self.final_third_s += dt
            if self.final_third_s >= self.PRESS_TARGET_S and not self.press_emitted:
                self.press_emitted = True
                ppda = ((metrics or {}).get("ppda") or {}).get(poss, 0.0)
                emitted.append(self._emit(
                    "MILESTONE_PRESS_DOMINANCE", clock, t,
                    f"Sustained High-Press Siege: {poss} held possession in the final third for "
                    f"{self.final_third_s:.0f}s",
                    f"PPDA: {ppda} | pressing intensity {pressing}",
                    team=poss, value=round(self.final_third_s, 1),
                ))
        else:
            self.final_third_s = max(0.0, self.final_third_s - dt * 0.5)
            if self.final_third_s == 0.0:
                self.press_team = None
                self.press_emitted = False

        return emitted

    def summary(self) -> List[dict]:
        return list(self.milestones)


class PitchForgeEngine:
    """Stateful 10Hz synthetic match simulator with 3D pose telemetry."""

    SCENARIOS = ("chaos_counter", "high_press_turnover", "tactical_inversion")

    def __init__(self, seed: int = 42, start_minute: float = 62.0):
        self.rng = random.Random(seed)
        self.t_match = start_minute * 60.0
        self.score = {"NLA": 1, "MCS": 1}
        self.players: List[Player] = []
        self._build_squads()
        self.ball: Dict[str, Any] = {
            "x": 52.5, "y": 34.0, "z": 0.0, "vx": 0.0, "vy": 0.0, "vz": 0.0,
            "speed_kmh": 0.0, "pass_start": None, "pass_end": None, "is_lofted": False,
        }
        self.owner: Optional[Player] = None
        self.flight: Optional[Dict[str, Any]] = None
        self.possession = "NLA"
        self.hold_timer = 0.0
        self.pass_urge_timer = 0.0
        self.scenario: Optional[Dict[str, Any]] = None
        self.pressure_on = False
        self._sprint_cd: Dict[str, float] = {}
        self._trap_cd = 0.0
        self._kick: Optional[Tuple[str, float]] = None      # (pid, expire_t)
        self._badges: Dict[str, Tuple[str, float]] = {}     # pid -> (name, expire_t)
        self._pending_events: List[dict] = []
        self._pending_kickoff: Optional[str] = None
        self._in_tick = False
        self.pass_seq = 0
        self.milestones = MilestoneTracker()
        self.kickoff("NLA", quiet=True)

    # ------------------------------------------------------------------ setup
    def _build_squads(self) -> None:
        # Synthetic match-to-date baselines at the 62nd minute: distances are
        # realistic per role, and every 250 m becomes a tagged threshold.
        baseline_km = {"GK": 3.1, "DEF": 6.7, "MID": 7.8, "FWD": 7.2}
        for team, squad in (("NLA", SQUAD_NLA), ("MCS", SQUAD_MCS)):
            for num, name, role, bx, by, ms in squad:
                baseline = (baseline_km[role] + self.rng.uniform(-0.35, 0.35)) * 1000.0
                player = Player(
                    pid=f"{team}_{num}", team=team, number=num, name=name,
                    role=role, base=(bx, by), max_speed=ms,
                    distance_m=round(baseline, 1),
                    sprint_distance_m=round(baseline * 0.14, 1),
                    top_speed_kmh=round(self.rng.uniform(28.5, 34.5), 1),
                    next_distance_alert_m=float(
                        (int(baseline // 250.0) + 1) * 250
                    ),
                )
                self.players.append(player)
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
            p.heading = 0.0 if p.team == "NLA" else math.pi
        kicker = min(
            (p for p in self.players if p.team == team and p.role != "GK"),
            key=lambda p: abs(p.x - 52.5) + abs(p.y - 34.0),
        )
        kicker.x, kicker.y = 52.5 - (2.0 if team == "NLA" else -2.0), 34.0
        self.ball.update({"x": kicker.x, "y": kicker.y, "z": 0.0, "vz": 0.0,
                          "speed_kmh": 0.0, "pass_start": None, "pass_end": None,
                          "is_lofted": False})
        self.owner = kicker
        self.flight = None
        self.possession = team
        self.hold_timer = 0.0
        self.pass_urge_timer = 0.0
        self._kick = None
        if not quiet:
            self._emit({"type": "KICKOFF", "team": team, "x": 52.5, "y": 34.0})

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
        if self.scenario:
            ev.setdefault("scenario", self.scenario["name"])
            ev.setdefault("scenario_signature", self._is_scenario_signature(ev))
        target = self.events if self._in_tick else self._pending_events
        target.append(ev)

    @staticmethod
    def _is_scenario_signature(ev: dict) -> bool:
        """Flag the one event that best proves a God-Mode scenario landed."""
        sc, kind = ev.get("scenario"), ev.get("type")
        if sc == "chaos_counter":
            return kind == "PASS" and bool(ev.get("line_breaking"))
        if sc == "high_press_turnover":
            return kind in ("TACKLE", "PRESSURE_TRAP")
        if sc == "tactical_inversion":
            return kind == "TACTICAL_INVERSION"
        return False

    # --------------------------------------------- Signature-trait badge registry
    def set_badge(self, pids: List[str], name: str, duration_s: float) -> None:
        """Orchestrator pushes INCISIVE_PASS / INTERCEPT badges here."""
        expire = self.t_match + duration_s
        for pid in pids:
            if pid in self.by_id:
                self._badges[pid] = (name, expire)

    # ------------------------------------------------------------- scenarios
    def inject(self, name: str) -> Dict[str, Any]:
        if name not in self.SCENARIOS:
            raise ValueError(f"Unknown scenario '{name}'. Valid: {self.SCENARIOS}")
        if self.scenario:
            self._end_scenario()
        self.by_id["NLA_2"].inverted = False
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
        self.ball.update({"z": 0.0, "vz": 0.0, "pass_start": None, "pass_end": None,
                          "is_lofted": False})
        if not quiet:
            self._emit({
                "type": "TURNOVER", "team": p.team, "previous_team": prev,
                "player_id": p.pid, "player_name": p.name,
                "x": round(p.x, 2), "y": round(p.y, 2),
                "middle_third": middle_third,
            })

    # ------------------------------------------------------------- main tick
    def tick(self, dt: float) -> Tuple[dict, List[dict]]:
        self._events = self._pending_events
        self._pending_events = []
        self._in_tick = True
        try:
            self.t_match += dt
            if self._pending_kickoff:
                team = self._pending_kickoff
                self._pending_kickoff = None
                self.kickoff(team)
            if self.scenario:
                self.scenario["left"] -= dt
                fta = self.scenario.get("forced_turnover_at")
                if fta is not None and not self.scenario["done"] and self.t_match >= fta:
                    self._forced_press_turnover()
                    self.scenario["done"] = True
                if self.scenario["left"] <= 0:
                    self._end_scenario()
            self._badges = {pid: b for pid, b in self._badges.items() if b[1] > self.t_match}
            if self.flight:
                self._advance_flight(dt)
            elif self.owner:
                self._decide(dt)
            self._team_motion(dt)
            self._attach_ball()
            self._update_headings()
            self._auto_events(dt)
            return self.state(), self.events
        finally:
            self._in_tick = False

    def _update_headings(self) -> None:
        ball_xy = (self.ball["x"], self.ball["y"])
        for p in self.players:
            if p.speed > 0.6:
                target = math.atan2(p.vy, p.vx)
            else:
                d = math.hypot(ball_xy[0] - p.x, ball_xy[1] - p.y)
                target = math.atan2(ball_xy[1] - p.y, ball_xy[0] - p.x) if d > 1.5 else p.heading
            p.heading = _lerp_angle(p.heading, target, 0.18)

    def _forced_press_turnover(self) -> None:
        ball_xy = (self.ball["x"], self.ball["y"])
        pressers = [p for p in self._opponents(self.possession) if p.role != "GK"]
        pressers.sort(key=lambda p: math.hypot(p.x - ball_xy[0], p.y - ball_xy[1]))
        thief = pressers[0]
        carrier = self.owner
        self._emit({"type": "TACKLE", "team": thief.team,
                    "player_id": thief.pid, "player_name": thief.name,
                    "opponent_id": carrier.pid if carrier else None,
                    "opponent_name": carrier.name if carrier else None,
                    "x": round(ball_xy[0], 2), "y": round(ball_xy[1], 2),
                    "outcome": "WON",
                    "detail": "Pressing trap tackle wins possession"})
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
        self.pass_seq += 1
        self.flight = {
            "from": start, "to": aim, "speed": speed_ms, "travelled": 0.0,
            "dist": dist, "target_pid": target.pid, "is_shot": False,
            "line_breaking": reason == "line_breaking", "prev_z": 0.0, "vz": 0.0,
            "pass_seq": self.pass_seq, "passer_pid": carrier.pid,
            "passer_name": carrier.name, "team": carrier.team,
        }
        self.owner = None
        self._kick = (carrier.pid, self.t_match + KICK_POSE_S)
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
            "pass_seq": self.pass_seq,
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
                       "shooter_pid": carrier.pid, "shooter_name": carrier.name,
                       "prev_z": 0.0, "vz": 0.0}
        self.owner = None
        self._kick = (carrier.pid, self.t_match + KICK_POSE_S)
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
            "on_target": abs(aim_y - 34.0) <= GOAL_HALF_WIDTH,
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
        lofted = f["is_shot"] or f["dist"] > 26.0
        f["is_lofted"] = lofted
        z_peak = 6.5 if lofted else 1.2
        z = math.sin(prog * math.pi) * z_peak
        f["vz"] = (z - f["prev_z"]) / dt
        f["prev_z"] = z
        self.ball.update({
            "x": bx, "y": by, "z": z, "vz": round(f["vz"], 2),
            "speed_kmh": f["speed"] * MS_TO_KMH,
            "pass_start": [round(f["from"][0], 2), round(f["from"][1], 2)],
            "pass_end": [round(f["to"][0], 2), round(f["to"][1], 2)],
            "is_lofted": lofted,
        })

        if not f["is_shot"]:
            for o in self._opponents(self.possession):
                if math.hypot(o.x - bx, o.y - by) < 1.2 and self.rng.random() < 0.8:
                    middle = MIDDLE_THIRD[0] <= bx <= MIDDLE_THIRD[1]
                    self._emit({"type": "TACKLE", "team": o.team,
                                "player_id": o.pid, "player_name": o.name,
                                "opponent_id": f.get("passer_pid"),
                                "opponent_name": f.get("passer_name"),
                                "x": round(bx, 2), "y": round(by, 2),
                                "outcome": "WON",
                                "detail": "Intercepted a ground pass"})
                    self._emit({"type": "INTERCEPTION", "team": o.team,
                                "player_id": o.pid, "player_name": o.name,
                                "pass_seq": f.get("pass_seq"),
                                "passer_id": f.get("passer_pid"),
                                "passer_name": f.get("passer_name"),
                                "x": round(bx, 2), "y": round(by, 2)})
                    self._set_possession(o, middle_third=middle)
                    return

        if prog >= 1.0:
            self._resolve_arrival(f, bx, by)

    def _resolve_arrival(self, f: dict, bx: float, by: float) -> None:
        self.flight = None
        self.ball.update({"z": 0.0, "vz": 0.0, "pass_start": None, "pass_end": None,
                          "is_lofted": False})
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
                # Defer the restart so the GOAL tick still snapshots the goalmouth.
                self._pending_kickoff = "MCS" if shooter_team == "NLA" else "NLA"
            else:
                # Only a ball inside the frame can be a save. Off-target strikes
                # are recorded separately so shot / save stats stay honest.
                if in_mouth:
                    self._emit({"type": "SAVE", "team": gk.team,
                                "player_id": gk.pid, "player_name": gk.name,
                                "shooter_team": shooter_team,
                                "shooter_pid": f.get("shooter_pid"),
                                "shooter_name": f.get("shooter_name"),
                                "x": round(bx, 2), "y": round(by, 2), "outcome": "SAVE"})
                else:
                    self._emit({"type": "SHOT_OFF_TARGET", "team": shooter_team,
                                "player_id": f.get("shooter_pid"),
                                "player_name": f.get("shooter_name"),
                                "x": round(bx, 2), "y": round(by, 2),
                                "detail": "Strike outside the goal frame"})
                self._set_possession(gk, middle_third=False, quiet=True)
            return
        target = self.by_id.get(f.get("target_pid") or "")
        if target is None:
            target = min(self._team(self.possession),
                         key=lambda p: math.hypot(p.x - bx, p.y - by))
        self._emit({
            "type": "PASS_COMPLETE",
            "team": f.get("team") or target.team,
            "player_id": f.get("passer_pid"),
            "player_name": f.get("passer_name"),
            "target_id": target.pid,
            "target_name": target.name,
            "pass_seq": f.get("pass_seq"),
            "distance_m": round(float(f.get("dist", 0.0)), 1),
            "line_breaking": bool(f.get("line_breaking")),
        })
        self._set_possession(target, middle_third=False, quiet=True)

    # ------------------------------------------------------------- motion
    def _steer(self, p: Player, tx: float, ty: float, spd: float, dt: float) -> None:
        prev_x, prev_y = p.x, p.y
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
        moved = math.hypot(p.x - prev_x, p.y - prev_y)
        p.distance_m += moved
        if p.speed_kmh >= SPRINT_THRESHOLD_KMH:
            p.sprint_distance_m += moved
        p.top_speed_kmh = max(p.top_speed_kmh, p.speed_kmh)
        p.stamina = _clamp(
            p.stamina - dt * (0.008 + 0.05 * (sp / p.max_speed) ** 2) + dt * 0.02, 40.0, 100.0
        )
        # ---- v6.2 bio-mechanical load accumulation --------------------
        # High-intensity work is everything above 55% of max speed; the
        # metabolic load is a rolling decay so recent efforts dominate.
        intensity = sp / p.max_speed if p.max_speed > 0 else 0.0
        if intensity >= 0.55:
            p.high_intensity_seconds += dt
            p.bio_load = _clamp(p.bio_load + dt * 9.0 * intensity, 0.0, 100.0)
        else:
            p.bio_load = _clamp(p.bio_load - dt * 1.15, 0.0, 100.0)

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
                sign = self._attack_sign(p.team)
                spd = 5.6
                if sc == "chaos_counter" and p.team == poss:
                    spd = 9.0 if p.role == "FWD" else 7.5
                tx = _clamp(p.x + sign * 14.0, 2.0, PITCH_L - 2.0)
                ty = 34.0 + math.sin(self.t_match * 0.25) * 10.0
                self._steer(p, tx, ty, spd, dt)
                continue
            if p.team == poss:
                tx = _clamp(bx + (ball_xy[0] - bx) * 0.22, 1.0, PITCH_L - 1.0)
                ty = _clamp(by + (ball_xy[1] - by) * 0.28, 2.0, PITCH_W - 2.0)
                spd = 4.6 + (1.2 if p.role == "FWD" else 0.0)
                if sc == "chaos_counter" and p.team == poss and p.role == "FWD":
                    spd = 8.8
                self._steer(p, tx, ty, spd, dt)
            elif p.pid in presser_ids:
                spd = min(p.max_speed * 0.98, 3.0 + math.hypot(
                    ball_xy[0] - p.x, ball_xy[1] - p.y) * 0.6)
                if sc == "high_press_turnover":
                    spd = p.max_speed
                self._steer(p, ball_xy[0], ball_xy[1], spd, dt)
            else:
                own = self._own_goal_x(p.team)
                if p.team == "NLA":
                    compress = 0.80
                    if sc == "chaos_counter":
                        compress = 0.88
                    tx = own + (bx - own) * compress + (ball_xy[0] - 52.5) * 0.18
                else:
                    compress = 0.80
                    if sc == "chaos_counter":
                        compress = 0.94
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
                "z": 0.0, "vz": 0.0,
                "vx": round(c.vx, 2), "vy": round(c.vy, 2),
                "speed_kmh": round(c.speed_kmh, 1),
            })
        elif self.flight is not None:
            f = self.flight
            ux = (f["to"][0] - f["from"][0]) / (f["dist"] or 1.0)
            uy = (f["to"][1] - f["from"][1]) / (f["dist"] or 1.0)
            self.ball["vx"] = round(ux * f["speed"], 2)
            self.ball["vy"] = round(uy * f["speed"], 2)

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
                                "distance_m": round(p.distance_m, 1),
                                "x": round(p.x, 2), "y": round(p.y, 2)})
            if p.role != "GK" and p.distance_m >= p.next_distance_alert_m:
                p.next_distance_alert_m += 250.0
                self._emit({"type": "AUTO_DISTANCE_ALERT", "team": p.team,
                            "player_id": p.pid, "player_name": p.name,
                            "distance_m": round(p.distance_m, 1),
                            "distance_km": round(p.distance_m / 1000.0, 2),
                            "threshold_km": round(p.distance_m / 1000.0, 2),
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
    def _pose_state(self, p: Player) -> str:
        if self._kick and self._kick[0] == p.pid and self.t_match < self._kick[1]:
            return "KICK"
        if p.speed_kmh >= SPRINT_POSE_KMH:
            return "SPRINT"
        if (self.owner is not None and p.team != self.possession and p.role != "GK"
                and math.hypot(p.x - self.ball["x"], p.y - self.ball["y"]) < PRESS_POSE_RADIUS_M):
            return "PRESS"
        if p.speed_kmh >= 3.0:
            return "JOG"
        return "IDLE"

    def _playstyle_badge(self, p: Player) -> Optional[str]:
        active = self._badges.get(p.pid)
        if active and active[1] > self.t_match:
            return active[0]
        if p.speed_kmh >= SPRINT_THRESHOLD_KMH:
            return "RAPID"
        return None

    def clock(self) -> str:
        total = self.t_match
        m = int(total // 60)
        s = int(total % 60)
        if m >= 120:
            return "90:00+"
        return f"{m:02d}:{s:02d}"

    @staticmethod
    def _relief_directive(p: Player, projected: float, load: float) -> str:
        """Agentic relief recommendation when the projection turns negative."""
        number = p.number
        if p.role == "DEF":
            return (f"Shift #{number} to a compact mid-block; delegate the wide pressing "
                    f"trigger to the inverted fullback and preserve the cover shadow.")
        if p.role == "MID":
            return (f"Pull #{number} into a lower tempo; let the 8 hold the wide half-space "
                    f"and keep the counter-press outlet short.")
        if p.role == "FWD":
            return (f"Rotate #{number} off the press line; keep the far post runner isolated "
                    f"and reduce the recovery sprint to one transition.")
        if p.role == "GK":
            return (f"Hold #{number} on a conservative starting line; delay the sweeper "
                    f"activation while the load recovers.")
        return (f"Rotate #{number} out of the high-intensity band and re-enter once the "
                f"projected load drops below the threshold.")

    def _bio_load_profile(self, p: Player) -> dict:
        """Deterministic predictive bio-load / fatigue profile for one player."""
        load = round(_clamp(p.bio_load, 0.0, 100.0), 1)
        stamina = round(p.stamina, 1)
        # +10 match minutes of projection: the current drain rate continues,
        # softened slightly by the natural recovery the model already applies.
        drain_per_minute = 0.008 * 60 + 0.05 * 0.62 * 60 - 0.02 * 60
        projected = round(_clamp(stamina - drain_per_minute * 10.0, 30.0, 100.0), 1)
        # Fatigue penalty on pass difficulty: heavy load erodes execution quality.
        penalty = round(min(24.0, load * 0.24 + max(0.0, (70.0 - projected)) * 0.18), 1)
        needs_relief = projected < 65.0 or load >= 70.0
        return {
            "sprint_load_index": load,
            "projected_stamina_10m": projected,
            "fatigue_pdr_penalty": penalty,
            "high_intensity_seconds": round(p.high_intensity_seconds, 1),
            "stamina_now": stamina,
            "tactical_relief_directive": (
                self._relief_directive(p, projected, load) if needs_relief
                else f"#{p.number} is within the sustainable band; no relief required."
            ),
            "relief_required": needs_relief,
        }

    def state(self) -> dict:
        return {
            "type": "tick",
            "t_match": round(self.t_match, 2),
            "clock": self.clock(),
            "score": dict(self.score),
            "possession": self.possession,
            "match_metadata": dict(MATCH_METADATA),
            "players": [
                {"id": p.pid, "team": p.team, "number": p.number,
                 "shirt_number": p.number, "name": p.name, "role": p.role,
                 "x": round(p.x, 2), "y": round(p.y, 2),
                 "vx": round(p.vx, 2), "vy": round(p.vy, 2),
                 "speed_kmh": round(p.speed_kmh, 1), "stamina": round(p.stamina, 1),
                 "heading_rad": round(p.heading, 3),
                 "distance_m": round(p.distance_m, 1),
                 "sprint_distance_m": round(p.sprint_distance_m, 1),
                 "top_speed_kmh": round(p.top_speed_kmh, 1),
                 "pose_state": self._pose_state(p),
                 "playstyle_badge": self._playstyle_badge(p),
                 "bio_load_profile": self._bio_load_profile(p)}
                for p in self.players
            ],
            "ball": {
                "x": round(self.ball["x"], 2), "y": round(self.ball["y"], 2),
                "z": round(self.ball.get("z", 0.0), 2),
                "vx": round(self.ball.get("vx", 0.0), 2),
                "vy": round(self.ball.get("vy", 0.0), 2),
                "vz": round(self.ball.get("vz", 0.0), 2),
                "speed_kmh": round(self.ball.get("speed_kmh", 0.0), 1),
                "pass_start": self.ball.get("pass_start"),
                "pass_end": self.ball.get("pass_end"),
                "is_lofted": bool(self.ball.get("is_lofted", False)),
            },
            "carrier": self.owner.pid if self.owner else None,
            "scenario": self.scenario["name"] if self.scenario else None,
            "scenario_left": round(self.scenario["left"], 1) if self.scenario else None,
        }
