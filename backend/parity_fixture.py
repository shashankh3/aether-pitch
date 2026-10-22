#!/usr/bin/env python3
"""Generate the cross-engine parity fixture.

The Python Stage B engine and the TypeScript browser twin compute the same
surfaces from the same state. This writes the Python engine's answers for a
deterministic scenario into `frontend/scripts/parity-fixture.json`; the
frontend logic suite recomputes them with the twin and asserts they match.

This is the method that caught the NaN drift: the two engines disagreed on a
non-finite coordinate, and nothing else would have noticed. With the fixture
in place, *any* divergence between the cloud engine and the offline twin
fails the build.

    python backend/parity_fixture.py            # regenerate
    python backend/parity_fixture.py --check    # fail if it is stale
"""
from __future__ import annotations

import copy
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from stage_a_synthetic_engine import PitchForgeEngine  # noqa: E402
from stage_b_math_engine import TacticalMathEngine  # noqa: E402

FIXTURE = ROOT / "frontend" / "scripts" / "parity-fixture.json"

#: A fixed scenario. The seed and the tick count are part of the contract:
#: changing either means regenerating the fixture.
SEED = 42
START_MINUTE = 70.0
TICKS = 40
SAMPLE_COLS = 16
SAMPLE_ROWS = 12


def build_state():
    eng = PitchForgeEngine(seed=SEED, start_minute=START_MINUTE)
    math = TacticalMathEngine(window_s=30.0)
    math.scenario_active = None
    st = None
    raw = []
    for _ in range(TICKS):
        st, raw = eng.tick(0.1)
        math.update(st, raw, st["t_match"], st.get("scenario"), 0.1)
    return st, math


def build_fixture() -> dict:
    st, math = build_state()

    # --- xT at a grid of points, for both attacking directions -------------
    xt_samples = []
    for row in range(SAMPLE_ROWS):
        for col in range(SAMPLE_COLS):
            x = (col + 0.5) * 105.0 / SAMPLE_COLS
            y = (row + 0.5) * 68.0 / SAMPLE_ROWS
            xt_samples.append([
                round(x, 4), round(y, 4),
                round(math.xt_value("NLA", x, y), 6),
                round(math.xt_value("MCS", x, y), 6),
            ])

    # --- the passing network, in order -------------------------------------
    network = [
        {
            "from_id": e["from_id"], "to_id": e["to_id"], "team": e["team"],
            "xt_weight": e["xt_weight"], "distance_m": e["distance_m"],
            "from_xy": e["from_xy"], "to_xy": e["to_xy"],
        }
        for e in math.passing_network_edges(st)
    ]

    # --- the per-player bio-load profiles ---------------------------------
    bio_load = [
        {
            "id": p["id"],
            "profile": {
                "sprint_load_index": p["bio_load_profile"]["sprint_load_index"],
                "projected_stamina_10m": p["bio_load_profile"]["projected_stamina_10m"],
                "fatigue_pdr_penalty": p["bio_load_profile"]["fatigue_pdr_penalty"],
                "high_intensity_seconds": p["bio_load_profile"]["high_intensity_seconds"],
                "press_seconds": p["bio_load_profile"]["press_seconds"],
                "stamina_now": p["bio_load_profile"]["stamina_now"],
                "relief_required": p["bio_load_profile"]["relief_required"],
                "tactical_relief_directive": p["bio_load_profile"]["tactical_relief_directive"],
            },
        }
        for p in st["players"]
    ]

    # --- the collective line shift, for both teams -------------------------
    line_shift = {}
    for team in ("NLA", "MCS"):
        for target in (28.0, 40.0, 51.0):
            r = math.evaluate_defensive_line_shift(st, team, target)
            line_shift[f"{team}@{target:g}"] = {
                k: v for k, v in r.items()
                if isinstance(v, (int, float)) and not isinstance(v, bool)
            }

    # --- the simulated pitch control after a relocation --------------------
    # NOTE: the override key is `player_id`. The Python reader silently
    # ignores an override it cannot resolve, which would make the fixture
    # quietly assert the un-relocated split - so the twin's `playerId` and
    # Python's `player_id` have to be mapped deliberately here.
    simulated = []
    for pid, nx, ny in (
        ("NLA_2", 78.0, 34.0), ("MCS_5", 30.0, 12.0), ("NLA_9", 62.0, 50.0),
    ):
        r = math.pitch_control_split(st, [{"player_id": pid, "x": nx, "y": ny}])
        simulated.append({"player_id": pid, "x": nx, "y": ny, "split": r})

    from stage_d_e_personalizer import STORIES, TRANSLATIONS

    # --- the boundary matrix ---------------------------------------------
    # The happy path is not enough. A twin that agrees on a full 22-player
    # state can still disagree on a degenerate one - and degenerate states
    # are exactly what a judge triggers by dragging a player off the pitch.
    edge_cases = []
    for name, mutate in (
        ("empty_squad", lambda s: s.update({"players": []})),
        ("one_player", lambda s: s.update({"players": s["players"][:1]})),
        ("all_on_one_spot",
         lambda s: s.update({"players": [dict(p, x=50.0, y=34.0, vx=0.0, vy=0.0)
                                         for p in s["players"]]})),
        ("nan_coordinate",
         lambda s: s.update({"players": [dict(p, x=float("nan"))
                                         if i == 0 else p
                                         for i, p in enumerate(s["players"])]})),
        ("infinite_velocity",
         lambda s: s.update({"players": [dict(p, vx=float("inf"))
                                         if i == 0 else p
                                         for i, p in enumerate(s["players"])]})),
        ("off_the_pitch",
         lambda s: s.update({"players": [dict(p, x=400.0, y=-50.0)
                                         if i == 0 else p
                                         for i, p in enumerate(s["players"])]})),
    ):
        s = copy.deepcopy(st)
        mutate(s)
        edge_cases.append({
            "name": name,
            "state": s,
            "expected": {
                "pitch_control": math.pitch_control_split(s),
                "passing_network": [
                    {"from_id": e["from_id"], "to_id": e["to_id"], "team": e["team"],
                     "xt_weight": e["xt_weight"], "distance_m": e["distance_m"],
                     "from_xy": e["from_xy"], "to_xy": e["to_xy"]}
                    for e in math.passing_network_edges(s)
                ],
                "bio_load_summary": math.bio_load_summary(s),
                "line_shift": {
                    k: v for k, v in math.evaluate_defensive_line_shift(s, "NLA", 40.0).items()
                    if isinstance(v, (int, float)) and not isinstance(v, bool)
                },
            },
        })

    return {
        "scenario": {
            "seed": SEED, "start_minute": START_MINUTE, "ticks": TICKS,
            "window_s": 30.0,
        },
        "state": st,
        "atlas": {
            "stories": dict(STORIES),
            "translations": {k: dict(v) for k, v in TRANSLATIONS.items()},
        },
        "edge_cases": edge_cases,
        "expected": {
            "xt_samples": xt_samples,
            "pitch_control": math.pitch_control_split(st),
            "passing_network": network,
            "bio_load": bio_load,
            "bio_load_summary": math.bio_load_summary(st),
            "line_shift": line_shift,
            "simulated_pitch_control": simulated,
        },
    }


def _encode_non_finite(value):
    """Make a structure safe to write as strict JSON.

    Python's json module writes a bare NaN, which JSON.parse rejects, and a
    NaN coordinate is one of the boundary cases the harness exists to
    compare. Non-finite numbers are therefore written as a tagged marker and
    revived on the TypeScript side.
    """
    if isinstance(value, float):
        if math.isnan(value):
            return {"__nonfinite__": "NaN"}
        if math.isinf(value):
            return {"__nonfinite__": "Infinity" if value > 0 else "-Infinity"}
        return value
    if isinstance(value, dict):
        return {k: _encode_non_finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_encode_non_finite(v) for v in value]
    return value


def main() -> int:
    fixture = _encode_non_finite(build_fixture())
    text = json.dumps(fixture, indent=1, sort_keys=True, ensure_ascii=False,
                      allow_nan=False) + "\n"
    if "--check" in sys.argv:
        if not FIXTURE.exists():
            print("parity fixture is missing - run python backend/parity_fixture.py")
            return 1
        if FIXTURE.read_text(encoding="utf-8") != text:
            print("parity fixture is STALE - the Python engine no longer reproduces it.")
            print("Run: python backend/parity_fixture.py")
            return 1
        print("parity fixture is current")
        return 0
    FIXTURE.write_text(text, encoding="utf-8")
    exp = fixture["expected"]
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    print(f"  xt samples      : {len(exp['xt_samples'])}")
    print(f"  passing network : {len(exp['passing_network'])} edges")
    print(f"  bio-load        : {len(exp['bio_load'])} players")
    print(f"  line shifts     : {len(exp['line_shift'])}")
    print(f"  simulated splits: {len(exp['simulated_pitch_control'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
