"""Dump the shapes of every shared surface so the parity fixture can be designed."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path("backend").resolve()))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from stage_a_synthetic_engine import PitchForgeEngine
from stage_b_math_engine import TacticalMathEngine

eng = PitchForgeEngine(seed=42, start_minute=70.0)
math = TacticalMathEngine(window_s=30.0)
math.scenario_active = None
st, raw = eng.tick(0.1)
for _ in range(40):
    st, raw = eng.tick(0.1)
    math.update(st, raw, st["t_match"], st.get("scenario"), 0.1)

print("state keys:", sorted(st.keys()))
print("ball keys:", sorted(st["ball"].keys()))
print("player keys:", sorted(st["players"][0].keys()))
print()
print("bio_load_profile (state):", json.dumps(st["players"][0]["bio_load_profile"], indent=2)[:500])
print()
print("pitch_control_split:", json.dumps(math.pitch_control_split(st), indent=2))
print()
print("passing_network_edges[0]:",
      json.dumps(math.passing_network_edges(st)[0], indent=2) if math.passing_network_edges(st) else "none")
print("  count:", len(math.passing_network_edges(st)))
print()
print("bio_load_summary:", json.dumps(math.bio_load_summary(st), indent=2)[:600])
print()
ls = math.evaluate_defensive_line_shift(st, "NLA", 40.0)
print("line_shift keys:", sorted(ls.keys()))
print("  values:", {k: v for k, v in ls.items() if isinstance(v, (int, float))})
print()
print("simulate_pitch_control signature:", )
import inspect
from stage_b_math_engine import TacticalMathEngine as T
print(" ", inspect.signature(T.simulate_pitch_control))
