# AETHER PITCH v5.0 — Championship Finale 3D Broadcast & Judge-Domination Engine

**Premier League & Microsoft Azure "Inside the Game" Hackathon submission.**
An EA Sports FC 27 (HyperMotion V) + Lenovo Football AI Pro grade broadcast studio:
a **60 FPS Three.js / React Three Fiber 3D stadium** with **14-part biomechanical
player avatars**, 4 autonomous camera modes, volumetric AR overlays, a **15-second
DVR time-machine + 3D telestrator**, a **computer-vision auto-eventing viewport**,
a **bi-directional "Ask The 12th Man" co-pilot**, **SMPTE broadcast alpha mode**
and a **1-click judge rubric verifier** — all fed by a **5-stage real-time Azure AI
pipeline over 100% synthetic 10Hz football telemetry**.

**v5.0 adds:** live fan personalization (persona / metric lock / club lens / i18n),
a milestone engine + **three-act cinematic recap** with 3D time travel, a Gaussian
**spatial control surface** and 3D passing network, a **60-second judge autopilot**,
and a **10Hz edge fallback** that keeps the broadcast alive through Azure/WebSocket
failures. Full architecture, math appendix and demo script: **[SUBMISSION_GUIDE.md](SUBMISSION_GUIDE.md)**.

**Tagline:** *AETHER PITCH — the championship finale, rendered live in 3D and personalized for every fan.*

```
NLA (North London Athletic, crimson/gold)  vs  MCS (Manchester Cityscape, cyan/navy)
Zero real clubs, players, logos, or proprietary tracking data.
```

---

## v3.0 / v4.0 Championship Modules

| Module | What it does |
|--------|--------------|
| **14-part biomechanical rig** | Shared singleton geometry pool (zero GPU re-allocation), velocity-locked stride phase (zero foot sliding), asymmetric knee flexion, counter-swinging 2-segment arms, sprint torso lean + bob, 350ms KICK strike, goalkeeper ready/dive stance, breathing idle, ball-tracking neck, troika `<Text>` jersey numbers back+chest, smart-culled `<Html>` pills (max ~4 live) |
| **Stage A/II CV Auto-Eventer** | Picture-in-picture optical tracking feed: 8 ball-nearest players projected through a 2D→3D homography, YOLOv8+ByteTrack boxes with `ID | conf | km/h` labels, skeletal keypoints, ball tracker + velocity arrow, H-matrix calibration grid, live machine-detected event log (zero manual tagging) |
| **DVR Time-Machine + Telestrator** | 150-tick (15s) circular buffer; freeze + scrub with spike/sprint timeline markers; 3D volumetric spotlight pillars, offside laser wall (second-deepest defender + attacker distance), compactness convex-hull mesh (m² + stretch), holographic ghost-ball replay, custom tactical arrows |
| **Broadcast Alpha Mode** | `?overlay=alpha` or one click: strips every opaque surface leaving only the AR layer over a transparent checkerboard / chroma-green `#00B140` canvas (OBS / Vizrt / Singular.live ready), live **SMPTE 50fps timecode**, and the machine-readable `AETHER_RENDER_PARTNER_V2` packet inspector with 1-click copy |
| **Ask The 12th Man** | `POST /api/studio-query`: typed or spoken tactical questions → 3-step agent reasoning chain + localized answer + 15s commentator cue + a `scene_directive` that physically flies the camera, drops spotlight beams, raises the offside wall, and highlights the defensive seam on the 3D pitch |
| **Voice + Two-Phase UX** | Zero-overlap speech controller (cancel-before-queue, en-GB/es-ES/ar-SA/hi-IN voice mapping, broadcast cadence) with live equalizer pill; scenario injections resolve Phase 1 instantly (<30ms physics) then Phase 2 AI reasoning shimmer |
| **Tactical Radar Mini-Map** | EA FC 27-style 230×148 translucent radar: 22 dots, locked-player gold pulse, ball flare, pass + ghost vectors, spotlight rings, click-to-lock that flies the 3D camera |
| **Judge Rubric Verifier** | `GET /api/health/pipeline-audit` runs an isolated 5-stage self-test (per-stage ms + sample outputs + synthetic compliance) rendered as a one-click VERIFIED checklist; `test_pipeline.py`, `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `azure.yaml` included |

### v5.0 Championship Finale Modules

| Module | What it does |
|--------|--------------|
| **Fan Personalization Runtime** | `FanPersonalizationTuner` + `stage_d_e_personalizer.py`: persona fork, single-metric 3D tag lock, NLA/MCS club lens, locked-player context, EN/ES/AR/HI adaptation via `GET/POST /api/personalization` |
| **Milestone Engine + 3-Act Recap** | Stage A detects sprint records (>31.5 km/h), five-pass PDR mastery, and 30s final-third press sieges; `GET/POST /api/match-recap` returns full 22-player snapshots, actual/ghost passes, localized commentary, teleprompter export, and `LOAD ACT` 3D time travel |
| **Spatial Control Surface** | 21×14 Gaussian pitch-control `CanvasTexture` heat surface + elevated 3D passing network, independently toggled from the camera director |
| **Judge Autopilot Tour** | One click runs a 60-second, six-step self-driving rubric demo (CV PiP → God Mode → DVR/telestrate → broadcast alpha → fan personalization → 3-act recap) with synchronized voiceover |
| **Resilient Edge Engine** | `useResilientMatchEngine` + `edgeEngine.ts`: 10Hz browser synthetic fallback, seamless WebSocket hot-swap, and a live `🟢 AZURE PIPELINE LIVE` / `⚡ EDGE AUTONOMOUS ENGINE ACTIVE` status pill |

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
                     3D ball (x,y,z,vx,vy,vz, pass_start/end, is_lofted, ghost_end);
                     MilestoneTracker emits sprint / pass-mastery / press-dominance records
Stage (b) INTERPRET  stage_b_math_engine.py — deterministic NumPy (unchanged):
                     Chaos Index (0.35·T̂r + 0.25·σ̂²v + 0.20·stretch + 0.20·press),
                     PDR logistic, 16×12 xT, Ghost Pass scan, AI gate
Stage (c) EXPLAIN    stage_c_foundry_agents.py — Azure AI Foundry triage +
                     causal narrative (deterministic fallback offline)
Stage (d) RENDER     stage_d_e_personalizer.py — overlay packets now include a
                     camera_directive: { recommended_mode, focus_target_id,
                     cinematic_slow_mo, ar_highlight_zone } that drives the
                     AI camera takeover in the WebGL scene
Stage (e) PERSONALIZE analyst/casual fork · PlayerLock 360 insight · EN/ES/AR/HI ·
                     persona / metric-lock / club-lens / locked-player adaptation
```

WebSocket packets: `hello | tick (10Hz) | metrics (2Hz) | event | insight |
pipeline (2Hz) | recap`. REST: `POST /api/scenario/{chaos_counter |
high_press_turnover | tactical_inversion | halftime_recap}`, `GET/POST
/api/personalization`, `GET/POST /api/match-recap`.

---

## EA FC 27 Broadcast Chrome

- **Top-left** — Premier League-style scorebug with synthetic crests, possession
  indicator and a win-probability / momentum bar.
- **Top-center** — Tactical Pulse: chaos waveform, segmented power bar, numeric
  gauge, a crimson **counter-attack window countdown** above 0.68, and the
  **Run 60s Judge Autopilot** control.
- **Top-right** — Camera Director (4 modes + xT Grid / Ghost Pass / Def. Lasers /
  Pitch Control / Passing Network toggles), the **Fan Personalization Tuner**, and
  the TwinCast dock (Analyst HUD / Casual Fan / Split + EN/ES/AR/HI pills + Web
  Speech voice with `en-GB / es-ES / ar-SA / hi-IN` voice selection).
- **Bottom-left** — EA FC Ultimate-Team style PlayerLock 360 hologram: quick-roster
  strip, kit silhouette, PlayStyle+ hex badge, radial speedometer with 30 km/h
  overdrive zone, PDR / ΔxT / stamina, live voice synthesis.
- **Bottom-center** — TV lower-third banner + PitchForge God-Mode deck
  (keys `1`–`4`; `4` opens the 3-act Studio Match Recap) + collapsible 5-stage
  pipeline strip with a live/edge status pill.
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
│       │   │                     # TacticalOverlays3D, PassVectors3D, BroadcastCameraRig,
│       │   │                     # SpatialControlSurface3D, RecapPassTubes
│       │   ├── ScoreBug / TacticalPulseBar / CameraDirectorBar / TwinCastHUD
│       │   ├── FanPersonalizationTuner / MatchRecapStudioModal / JudgeAutopilotTour
│       │   ├── PlayerLock360 / StudioProducer / PitchForgeDeck / PipelineInspector
│       │   └── Crests.tsx        # synthetic club crests (no real IP)
│       ├── hooks/useResilientMatchEngine.ts  # WS + 10Hz edge hot-swap
│       ├── lib/edgeEngine.ts     # browser-native synthetic fallback engine
│       └── lib/                  # types (schema), telemetry store, utils
├── start_studio.bat / .sh
├── SUBMISSION_GUIDE.md
└── README.md
```

---

## 3-minute demo script

| Time | Action | Say |
|------|--------|-----|
| 0:00–0:15 | Studio loads into the Tele Cam 3D stadium | "A live 3D broadcast built on a synthetic 10Hz physics engine — 22 articulated avatars, zero proprietary data." |
| 0:15–0:30 | Click **Run 60s Judge Autopilot** | "Six rubric steps, sixty seconds, synchronized voiceover — the studio drives itself." |
| 0:30–1:10 | Autopilot steps 2–3: God Mode + DVR freeze/telestrate | "Stage B math drives the control surface, defensive lasers, ghost lane, and AI camera takeover." |
| 1:10–1:25 | Autopilot step 4: broadcast alpha | "Only the transparent AR layer remains — OBS / Vizrt / Singular.live ready." |
| 1:25–1:50 | Autopilot step 5 + Fan Tuner: Pass Quality, NLA lens, ES→HI→AR | "Same moment, different fan: metric lock, club lens, and Stage E localization without a stream restart." |
| 1:50–2:20 | Autopilot step 6: recap milestones, click **Load Act** | "Sprint record, five-pass mastery, 30-second press siege — restored as a full 22-player 3D snapshot." |
| 2:20–2:40 | Export teleprompter, click **Verify** | "Producer-ready three-act script and a five-stage rubric audit." |
| 2:40–3:00 | Go offline, then reconnect | "The edge engine keeps the picture alive at 10Hz and hot-swaps back to Azure." |

Full architecture, math appendix, API smoke tests and the long-form script:
**[SUBMISSION_GUIDE.md](SUBMISSION_GUIDE.md)**.

---

## Compliance checklist

- ✅ **100% synthetic data** — generated squads, physics-based tracking, no Opta/StatsBomb/Second Spectrum input.
- ✅ **Azure cloud-native** — AI Foundry (Stage c), Translator (Stage e), Web PubSub-ready (Stage d); deterministic fallbacks keep the demo alive without credentials.
- ✅ **Explicit 5-stage traceability** — on-screen Pipeline Inspector with per-stage latency + raw JSON payloads.

## Notes

- Match time runs at `MATCH_TIME_SCALE=6` from minute 62 by default (env-tunable).
- Stage (c) rate-limits AI takes to one per 10 s; each AI camera take holds 6.5 s and any manual camera click cancels it.
- The old 2D canvas was fully replaced by the R3F scene (`frontend/src/components/three/`).
