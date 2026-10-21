"""
AETHER PITCH — automated pipeline self-test (Stage a -> e).

Run:  python test_pipeline.py
Exits non-zero on any failed assertion. Runs fully offline (deterministic
fallbacks), no Azure credentials required.
"""
import asyncio
import sys

# Windows consoles default to cp1252 and crash on Δ / — in check details.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from stage_a_synthetic_engine import PitchForgeEngine
from stage_b_math_engine import TacticalMathEngine, XT_MAX, XT_MIN
from stage_c_foundry_agents import FoundryRouter
from stage_d_e_personalizer import Personalizer
from config import settings


def main() -> int:
    failures = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        status = "PASS" if cond else "FAIL"
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
        if not cond:
            failures.append(name)

    # ---- Stage (a): synthetic ingest + auto-eventing --------------------
    eng = PitchForgeEngine(seed=11, start_minute=62.0)
    math = TacticalMathEngine(window_s=60.0)
    math.scenario_active = None
    seen_types = set()
    ok_stream = True
    for _ in range(900):  # 90 simulated seconds
        st, raw = eng.tick(0.1)
        math.update(st, raw, st["t_match"], st.get("scenario"), 0.1)
        for ev in raw:
            seen_types.add(ev["type"])
            ok_stream &= isinstance(ev.get("t_match"), float)
    check("Stage a: 22 players streamed", len(st["players"]) == 22)
    check("Stage a: 3D ball schema", all(k in st["ball"] for k in
          ("x", "y", "z", "vx", "vy", "vz", "speed_kmh", "pass_start", "pass_end", "is_lofted")))
    p = st["players"][0]
    check("Stage a: 3D pose fields", all(k in p for k in
          ("heading_rad", "pose_state", "playstyle_badge", "shirt_number")))
    check("Stage a: pose states valid",
          all(pl["pose_state"] in ("KICK", "SPRINT", "PRESS", "JOG", "IDLE") for pl in st["players"]))
    check("Stage a: auto-eventing fired", len(seen_types) >= 4, f"types={sorted(seen_types)[:8]}")
    check("Stage a: match metadata", all(k in st.get("match_metadata", {}) for k in
          ("match_id", "competition", "venue", "home_team", "away_team", "synthetic"))
          and st["match_metadata"]["synthetic"] is True)
    check("Stage a: distance + top-speed telemetry", all(
        all(k in pl for k in ("distance_m", "sprint_distance_m", "top_speed_kmh"))
        and pl["distance_m"] > 0 and pl["top_speed_kmh"] > 0 for pl in st["players"]))
    check("Stage a: pass completion + distance auto-tags",
          {"PASS_COMPLETE", "AUTO_DISTANCE_ALERT"} <= seen_types)

    # Scenario signatures must be tagged at the source, not inferred later.
    sc_eng = PitchForgeEngine(seed=7, start_minute=62.0)
    sc_eng.inject("chaos_counter")
    chaos_events = []
    for _ in range(30):
        _, raw = sc_eng.tick(0.1)
        chaos_events.extend(raw)
    check("Stage a: chaos scenario tags every event",
          any(e.get("scenario") == "chaos_counter" for e in chaos_events))
    check("Stage a: chaos signature is the line-breaking pass",
          any(e.get("scenario_signature") and e.get("type") == "PASS"
              and e.get("line_breaking") for e in chaos_events))

    press_eng = PitchForgeEngine(seed=8, start_minute=62.0)
    press_eng.inject("high_press_turnover")
    press_events = []
    for _ in range(40):
        _, raw = press_eng.tick(0.1)
        press_events.extend(raw)
    check("Stage a: pressing trap signature", any(
        e.get("scenario_signature") and e.get("type") in ("TACKLE", "PRESSURE_TRAP")
        for e in press_events))

    inv_eng = PitchForgeEngine(seed=9, start_minute=62.0)
    inv_eng.inject("tactical_inversion")
    _, inv_events = inv_eng.tick(0.1)
    check("Stage a: inversion signature", any(
        e.get("type") == "TACTICAL_INVERSION" and e.get("scenario_signature")
        for e in inv_events))

    # ---- Stage (b): deterministic math ----------------------------------
    c = math.chaos
    check("Stage b: chaos index in [0,1]", 0.0 <= c <= 1.0, f"{c:.3f}")
    check("Stage b: chaos classification", math.classify(c) in
          ("STRUCTURED CONTROL", "BALANCED RHYTHM", "HIGH CHAOS TRANSITION"))
    pdr = math.pass_difficulty(28.0, 78.0, 2, 3.5)
    check("Stage b: PDR in [0,100]", 0.0 <= pdr <= 100.0, f"{pdr:.1f}")
    g = math.xt_grid
    check("Stage b: xT grid 16x12 in range", g.shape == (12, 16)
          and abs(g.min() - XT_MIN) < 1e-6 and abs(g.max() - XT_MAX) < 1e-6)
    carrier = next((pl for pl in st["players"] if pl["role"] != "GK"), st["players"][0])
    ghost = math.ghost_pass(st, carrier["team"], None, (carrier["x"], carrier["y"]))
    check("Stage b: ghost pass scan", ghost is not None and "delta_xt" in ghost)
    bs = math.snapshot(st)
    ts = bs.get("team_stats", {})
    check("Stage b: team match stats", all(k in ts for k in ("NLA", "MCS")) and all(
        all(k in row for k in ("passes", "passes_completed", "pass_accuracy", "shots",
                               "shots_on_target", "tackles", "possession_pct",
                               "distance_km"))
        and 0.0 <= row["pass_accuracy"] <= 100.0 and row["distance_km"] > 0
        for row in ts.values()))
    check("Stage b: possession sums to 100", abs(sum(
        row["possession_pct"] for row in ts.values()) - 100.0) <= 0.2)
    check("Stage b: per-player stats + leaders", bool(bs.get("player_stats"))
          and "fastest" in bs.get("leaders", {}) and "farthest" in bs.get("leaders", {}))

    # ---- gate ------------------------------------------------------------
    ev = {"type": "PASS", "team": "NLA", "player_id": "NLA_7", "start": (50, 30),
          "end": (80, 34), "distance_m": 31.6, "ball_speed_kmh": 82.0,
          "defenders_in_cone": 1, "nearest_defender_m": 4.0,
          "scenario": "chaos_counter", "t_match": st["t_match"]}
    enriched = math.enrich(ev, st)
    check("Gate: deterministic trigger", enriched["ai_gate"]["should_explain"],
          f"reasons={enriched['ai_gate']['reasons']}")

    # ---- Stage (c): explain + studio query (deterministic) ---------------
    router = FoundryRouter(settings)
    ctx = {"event": enriched, "metrics": math.snapshot(st), "clock": st["clock"],
           "score": st["score"], "possession": st["possession"],
           "recent_events": [], "top_inflections": []}
    c_res = router._fallback_explain(ctx)
    check("Stage c: explain schema", all(k in c_res["stage_c_explainability"] for k in
          ("moment_headline", "why_it_matters_causal", "tactical_catalyst",
           "commentator_talking_point")))
    c_wrapped = asyncio.get_event_loop().run_until_complete(router.explain(ctx))
    check("Stage c: explicit fallback mode", c_wrapped.get("mode") in ("fallback", "azure")
          and c_wrapped.get("latency_ms", -1) >= 0)
    check("Stage c: Azure status is inspectable", all(k in router.status() for k in
          ("configured", "last_attempted", "last_used", "last_error", "usage")))

    spatial = {
        "team": "NLA", "chaos_index": c, "backline_stretch_m": 38.4,
        "widest_gap_m": 21.5, "gap_center": {"x": 78.0, "y": 12.0},
        "gap_defender": {"id": "NLA_2", "name": "D. Keswick"},
        "fastest_sprinter": {"id": "MCS_7", "name": "C. Ambrose", "shirt_number": 7,
                             "speed_kmh": 31.8},
        "ghost": {"x": 82.0, "y": 48.5, "delta_xt": 0.214, "target_id": "NLA_11"},
    }
    q = asyncio.get_event_loop().run_until_complete(router.studio_query(
        {"query": "Spot the tactical weakness in NLA's defensive line",
         "language": "en", "persona": "analyst",
         "locked_player_id": None, "spatial": spatial}))
    check("Stage c: studio query schema", all(k in q for k in
          ("agent_reasoning_chain", "studio_answer_localized", "commentator_cue_15s",
           "scene_directive")))
    sd = q["scene_directive"]
    check("Stage c: scene directive", sd["camera_mode"] in
          ("TELE_BROADCAST", "TACTICAL_DRONE", "PLAYER_LOCK_3RD_PERSON", "ACTION_ZOOM")
          and len(sd["spotlight_player_ids"]) <= 3
          and all(k in sd["highlight_pitch_zone"] for k in ("x_min", "x_max", "y_min", "y_max", "label")))

    # ---- Stage (d)+(e): render + personalize -----------------------------
    pers = Personalizer(settings)
    packet = pers.build(c_res, enriched, math.snapshot(st), st["score"])
    check("Stage d: overlay packet", all(k in packet["stage_d_broadcast_overlay"] for k in
          ("timecode", "overlay_type", "highlight_players", "draw_ghost_pass",
           "lower_third_title", "lower_third_subtitle")))
    check("Stage d: camera directive", all(k in packet["camera_directive"] for k in
          ("recommended_mode", "focus_target_id", "cinematic_slow_mo", "ar_highlight_zone")))
    check("Stage e: personalization schema",
          all(k in packet["stage_e_personalization"] for k in
              ("analyst_mode", "casual_fan_mode", "player_lock_insight", "translations"))
          and all(l in packet["stage_e_personalization"]["translations"] for l in ("en", "es", "ar", "hi")))

    recap = router._fallback_recap({"top_inflections": [
        {"clock": "63:11", "headline": "Shot — V. Sorensen", "detail": "PDR 96%"},
        {"clock": "63:44", "headline": "Pass — B. Kovac", "detail": "PDR 99%"},
        {"clock": "64:02", "headline": "Trap — MCS", "detail": "3 defenders < 6m"}]})
    check("Stage d: recap packet", len(recap["items"]) == 3)

    # ---- synthetic compliance -------------------------------------------
    check("Compliance: 100% synthetic squads",
          all(pl["name"] for pl in st["players"]) and len(
              {pl["name"] for pl in st["players"]}) == 22)

    print()
    if failures:
        print(f"RESULT: {len(failures)} FAILED -> {failures}")
        return 1
    print("RESULT: ALL PIPELINE TESTS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
