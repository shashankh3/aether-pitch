# AETHER PITCH v2.0 — EA SPORTS FC 27 3D WebGL Broadcast & Autonomous Studio Engine

**Premier League & Microsoft Azure "Inside the Game" Hackathon submission.**
An EA Sports FC 27 (HyperMotion V) + Lenovo Football AI Pro grade broadcast studio:
a **60 FPS Three.js / React Three Fiber 3D stadium** with articulated player avatars,
4 autonomous camera modes, volumetric AR overlays — all fed by a **5-stage real-time
Azure AI pipeline over 100% synthetic 10Hz football telemetry**.

```
NLA (North London Athletic, crimson/gold)  vs  MCS (Manchester Cityscape, cyan/navy)
Zero real clubs, players, logos, or proprietary tracking data.
```

---

## Quick Start (single command)

**Windows:** double-click `start_studio.bat`  ·  **macOS/Linux:** `bash start_studio.sh`

| Service   | URL                              |
|-----------|----------------------------------|
| Studio UI | http://localhost:3000            |
| Backend   | http://localhost:8000            |
| API docs  | http://localhost:8000/docs       |

Manual launch:
```bash
cd backend  && python -m pip install -r requirements.txt && python -m uvicorn main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

**Go cloud (optional):** copy `backend/.env.example` → `backend/.env` and add your
`AZURE_OPENAI_*` / `AZURE_TRANSLATOR_*` credentials. Without credentials everything
runs on deterministic local fallbacks — judge-ready out of the box.

---

## The 3D WebGL Broadcast Engine (`frontend/src/components/three/`)

| Module | What it renders |
|--------|-----------------|
| `PlayerAvatar3D.tsx` | 22 articulated humanoid rigs (torso / head+hair / swinging arms / thigh-knee-sock-cleat legs) with procedural gait (`freq = max(2.5, kmh·0.65)`, `amp = min(0.85, kmh·0.032)`), speed-proportional torso lean, 350ms KICK strike, ball-tracking clamped neck, HyperMotion dual foot-rings (gold/cyan when locked or carrier, crimson at ≥30 km/h), grass vision cones, spinning **PlayStyle+ plumbob** and live glass pills (`#9 V. Sorensen • 32.4 km/h • PDR 89%`) |
| `StadiumEnvironment3D.tsx` | 105m×68m mowed emerald turf, full regulation line set + penalty arcs, metallic goalposts with wireframe nets, 4 scrolling **LED ad boards**, floodlight towers, instanced 3D crowd (1,600 fans) |
| `TacticalOverlays3D.tsx` | 16×12 **xT threat floor** (InstancedMesh, cyan→magenta, mirrored per possession), **defensive laser links** per back-4/mid-3 with floating line-height + stretch badges |
| `PassVectors3D.tsx` | 3D **parabolic pass tube** (`QuadraticBezierCurve3`, 6.5 m lofted / 1.2 m ground) + dashed cyan **Lenovo Ghost Pass** counterfactual with `+xT` badge |
| `BroadcastCameraRig.tsx` | 4 damped camera modes (below) + AI `camera_directive` takeover |

**Camera modes:** `Tele Cam` (classic TV) · `Pro Cam` (EA FC 3rd-person behind the
locked avatar, looking 18 m ahead) · `Drone Orbit` (free Lenovo 3D Digital Twin orbit)
· `Auto-Director` (tele during buildup, dramatic 14 m low-angle swoop when
`chaos > 0.72` or a Stage (d) overlay fires). Any manual pick cancels the AI take.

60 fps is protected by module-level shared geometries/materials, `useMemo`, a mutable
telemetry store with **velocity-extrapolated interpolation** (10Hz stream → 60fps
render, React never re-renders at tick rate), one shadow-casting floodlight +
InstancedMesh crowd, and `Bloom` + `Vignette` post-processing.

---

## The 5-Stage Azure Pipeline (unchanged contract, richer payload)

```
Stage (a) INGEST     stage_a_synthetic_engine.py — 10Hz PitchForge physics sim
                     now emits 3D pose telemetry: heading_rad (smoothed),
                     pose_state (KICK > SPRINT ≥28 > PRESS <5m > JOG > IDLE),
                     playstyle_badge (RAPID+ ≥30 km/h, INCISIVE_PASS+ on
                     PDR>80 passes, INTERCEPT+ in pressing traps), and the
                     3D ball (x,y,z,vx,vy,vz, pass_start/end, is_lofted, ghost_end)
Stage (b) INTERPRET  stage_b_math_engine.py — deterministic NumPy (unchanged):
                     Chaos Index (0.35·T̂r + 0.25·σ̂²v + 0.20·stretch + 0.20·press),
                     PDR logistic, 16×12 xT, Ghost Pass scan, AI gate
Stage (c) EXPLAIN    stage_c_foundry_agents.py — Azure AI Foundry triage +
                     causal narrative (deterministic fallback offline)
Stage (d) RENDER     stage_d_e_personalizer.py — overlay packets now include a
                     camera_directive: { recommended_mode, focus_target_id,
                     cinematic_slow_mo, ar_highlight_zone } that drives the
                     AI camera takeover in the WebGL scene
Stage (e) PERSONALIZE analyst/casual fork · PlayerLock 360 insight · EN/ES/AR/HI
```

WebSocket packets: `hello | tick (10Hz) | metrics (2Hz) | event | insight |
pipeline (2Hz) | recap`. REST: `POST /api/scenario/{chaos_counter |
high_press_turnover | tactical_inversion | halftime_recap}`.

---

## EA FC 27 Broadcast Chrome

- **Top-left** — Premier League-style scorebug with synthetic crests, possession
  indicator and a win-probability / momentum bar.
- **Top-center** — Tactical Pulse: chaos waveform, segmented power bar, numeric
  gauge, and a crimson **counter-attack window countdown** above 0.68.
- **Top-right** — Camera Director (4 modes + xT Grid / Ghost Pass / Def. Lasers
  toggles) and the TwinCast dock (Analyst HUD / Casual Fan / Split + EN/ES/AR/HI
  pills + Web Speech voice with `en-GB / es-ES / ar-SA / hi-IN` voice selection).
- **Bottom-left** — EA FC Ultimate-Team style PlayerLock 360 hologram: quick-roster
  strip, kit silhouette, PlayStyle+ hex badge, radial speedometer with 30 km/h
  overdrive zone, PDR / ΔxT / stamina, live voice synthesis.
- **Bottom-center** — TV lower-third banner + PitchForge God-Mode deck
  (keys `1`–`4`) + collapsible 5-stage pipeline strip with pulsing nodes.
- **GOAL slam** — skewed team-color banner + canvas shockwave + screen flash.

---

## Repo layout

```
├── backend/                      # FastAPI + 5-stage pipeline (see above)
├── frontend/
│   └── src/
│       ├── app/                  # layout (Rajdhani/Teko/Inter/JetBrains Mono) + page
│       ├── components/
│       │   ├── three/            # HoloPitch3D, PlayerAvatar3D, StadiumEnvironment3D,
│       │   │                     # TacticalOverlays3D, PassVectors3D, BroadcastCameraRig
│       │   ├── ScoreBug / TacticalPulseBar / CameraDirectorBar / TwinCastHUD
│       │   ├── PlayerLock360 / StudioProducer / PitchForgeDeck / PipelineInspector
│       │   └── Crests.tsx        # synthetic club crests (no real IP)
│       ├── hooks/useStudio.ts    # WS stream → React HUD state + telemetry store
│       └── lib/                  # types (schema), telemetry store, utils
├── start_studio.bat / .sh
└── README.md
```

---

## 3-minute demo script

| Time | Action | Say |
|------|--------|-----|
| 0:00–0:20 | Studio loads into the Tele Cam 3D stadium | "A live 3D broadcast built on a synthetic 10Hz physics engine — 22 articulated avatars, zero proprietary data." |
| 0:20–0:45 | Press `3` → Drone Orbit, drag to spin | "A Lenovo-style 3D digital twin. Toggle the xT threat floor and defensive lasers — all deterministic Stage B math." |
| 0:45–1:20 | Click any avatar (or roster #9) → Pro Cam | "EA FC Pro Cam. The rig plays the pose state machine live: stride frequency from velocity, KICK strikes, HyperMotion rings." |
| 1:20–2:00 | Press `1` — Chaos Counter | "Watch the AI Auto-Director take over — Stage D emitted a camera_directive, the cam swoops, the ghost pass tube draws, the goal slam fires." |
| 2:00–2:30 | TwinCast → Fan + العربية + voice | "Same moment, two audiences, four languages, live synthesis." |
| 2:30–3:00 | Press `4` — Studio Recap, open pipeline strip | "Five stages, live latencies, raw payloads — rubric-verified in five seconds." |

---

## Compliance checklist

- ✅ **100% synthetic data** — generated squads, physics-based tracking, no Opta/StatsBomb/Second Spectrum input.
- ✅ **Azure cloud-native** — AI Foundry (Stage c), Translator (Stage e), Web PubSub-ready (Stage d); deterministic fallbacks keep the demo alive without credentials.
- ✅ **Explicit 5-stage traceability** — on-screen Pipeline Inspector with per-stage latency + raw JSON payloads.

## Notes

- Match time runs at `MATCH_TIME_SCALE=6` from minute 62 by default (env-tunable).
- Stage (c) rate-limits AI takes to one per 10 s; each AI camera take holds 6.5 s and any manual camera click cancels it.
- The old 2D canvas was fully replaced by the R3F scene (`frontend/src/components/three/`).
