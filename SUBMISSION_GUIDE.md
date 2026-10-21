# AETHER PITCH v5.0 — Championship Finale & Judge-Domination Upgrade

**Tagline:** *AETHER PITCH — the championship finale, rendered live in 3D and personalized for every fan.*

**Premier League × Microsoft Azure “Inside the Game” Hackathon submission.**
A real-time React Three Fiber broadcast studio fed by a synthetic 10 Hz football telemetry engine, a deterministic five-stage AI pipeline with optional Azure AI Foundry reasoning, a three-act cinematic recap, and a 60-second self-driving judge tour.

NLA (North Larchmont Athletic) vs MCS (Meridian City SC). **All clubs, players, crests, and tracking data are synthetic.**

---

## 1. The 60-Second Pitch

Judges usually see a highlight reel. AETHER PITCH lets them **drive the broadcast**:

1. **A real-time 3D match** — 22 articulated avatars, a 105×68 m stadium, five broadcast layers, and a 15-second DVR time machine.
2. **A deterministic AI pipeline** — every pass gets a Pass Difficulty Rating, a ΔxT value, and a counterfactual ghost lane from transparent math, not a black box.
3. **A personalized fan runtime** — persona, single-metric lock, club bias, locked player, and EN/ES/AR/HI commentary adapt live, without restarting the stream.
4. **A three-act finale** — the milestone engine detects sprint records, five-pass mastery, and 30-second press sieges, then freezes full 22-player snapshots into a downloadable storyboard.
5. **A judge autopilot** — one click runs a 60-second, six-step rubric tour with synchronized voiceover.
6. **A resilient engine** — if Azure or the backend drops, a 10 Hz browser-native synthetic engine takes over immediately and hot-swaps back when the WebSocket returns.

---

## 2. What Is New in v5.0

| # | Module | New files / surfaces | Judge-visible outcome |
|---|--------|----------------------|-----------------------|
| 1 | Fan Personalization Engine | `backend/stage_d_e_personalizer.py`, `frontend/src/components/FanPersonalizationTuner.tsx`, `frontend/src/components/TwinCastHUD.tsx` | Persona fork, metric badge, club lens, locked-player context, localized commentary |
| 2 | Milestone Engine + 3-Act Recap | `MilestoneTracker` in `backend/stage_a_synthetic_engine.py`, `backend/stage_c_foundry_agents.py`, `frontend/src/components/MatchRecapStudioModal.tsx` | Sprint/pass/press milestones, full snapshots, ghost lanes, `LOAD ACT` time travel, teleprompter export |
| 3 | Spatial Control Surface + Passing Network | `frontend/src/components/three/SpatialControlSurface3D.tsx` | 21×14 Gaussian pitch-control heat surface and elevated 3D pass network |
| 4 | Judge Autopilot Tour | `frontend/src/components/JudgeAutopilotTour.tsx` | 60-second, six-step demo with rubric callouts and voiceover |
| 5 | Resilient Match Engine | `frontend/src/hooks/useResilientMatchEngine.ts`, `frontend/src/lib/edgeEngine.ts` | 10 Hz edge fallback, seamless WebSocket hot-swap, live/edge status pill |
| 6 | Submission Package | this guide + `frontend/src/components/three/RecapPassTubes.tsx`, `PipelineInspector` status | Complete architecture, math appendix, and sub-two-minute demo script |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BROWSER · NEXT.JS 14 / REACT 18                       │
│                                                                              │
│  useResilientMatchEngine ── WebSocket ──┐        EdgeEngine (10 Hz fallback) │
│         │                               │                    │               │
│         ├── tick 10 Hz ─────────────────┼── telemetry store ─┤               │
│         ├── metrics 2 Hz                │   (60 FPS interp)   │               │
│         ├── event / insight / pipeline  │                    │               │
│         └── status: LIVE / EDGE         │                    │               │
│                                                                              │
│  React Three Fiber: stadium · 22 avatars · overlays · control surface        │
│  HUD: ScoreBug · TwinCast · Fan Tuner · DVR · Recap · Autopilot · Pipeline   │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                         FastAPI WebSocket hub (10 Hz)
                                      │
┌─────────────────────────────────────▼────────────────────────────────────────┐
│                    AZURE-READY BACKEND PIPELINE (CLOUD-OPTIONAL)             │
│                                                                              │
│  STAGE A  Synthetic ingest / physics / pose / milestones                     │
│           10 Hz · 22 players · 3D ball · milestone tracker                   │
│                                      │                                       │
│  STAGE B  Deterministic NumPy math                                            │
│           chaos · PDR · xT · ghost pass · AI gate · leverage                  │
│                                      │                                       │
│  STAGE C  Azure AI Foundry-hosted Azure OpenAI (triage → narrative)           │
│           causal narrative · studio co-pilot · recap storyboard              │
│           (deterministic offline fallback always available)                  │
│                                      │                                       │
│  STAGE D  Broadcast render packet                                             │
│           overlay · highlight zone · camera directive                         │
│                                      │                                       │
│  STAGE E  Personalization                                                     │
│           persona · metric lock · club bias · locked player · i18n            │
│           Azure AI Translator (optional) + deterministic phrase atlas         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Azure integration map (implemented vs optional)

| Layer | Azure service | Status in this submission |
|-------|---------------|---------------------------|
| Reasoning | **Azure AI Foundry-hosted Azure OpenAI** (triage + narrative deployments) | Implemented when `AZURE_OPENAI_*` is set; deterministic fallback otherwise |
| Localization | **Azure AI Translator** | Implemented when `AZURE_TRANSLATOR_*` is set; local phrase atlas otherwise |
| Compute | **Azure Container Apps** | Deployment option via `backend/Dockerfile`, `frontend/Dockerfile`, and `azure.yaml` |
| Realtime fan-out | **FastAPI WebSocket hub** | Implemented; Azure Web PubSub is not wired |
| Observability | **Pipeline Inspector + `/api/health/pipeline-audit`** | Implemented; Azure Monitor is a deployment option |
| Secrets | **`.env` / container environment** | Implemented; Azure Key Vault is a deployment option |
| Images | **Docker** | Local build path; Azure Container Registry and `azd` are deployment options |
| IaC | **`docker-compose.yml` + `azure.yaml`** | Compose works today; `azure.yaml` is a service manifest and needs your own `azd` infrastructure |

**Judge-safe by design:** no Azure credentials are required. Every cloud call has a deterministic local fallback, and the UI never blocks on the LLM.

---

## 4. The Five-Stage Contract

| Stage | File | Input | Output | Blocking? |
|-------|------|-------|--------|-----------|
| **A — Ingest** | `backend/stage_a_synthetic_engine.py` | 10 Hz simulation clock | 22 players, ball, pose state, raw events, milestones | Yes — 10 Hz heartbeat |
| **B — Interpret** | `backend/stage_b_math_engine.py` | Tick + raw events | Chaos, PDR, xT, ghost pass, gate, leverage | Yes — deterministic, sub-ms |
| **C — Explain** | `backend/stage_c_foundry_agents.py` | Gated event + spatial context | Narrative, studio answer, recap acts | **No — async task** |
| **D — Render** | `backend/stage_d_e_personalizer.py` | Stage C packet + metrics | Overlay, camera directive, highlight zone | Yes — cheap |
| **E — Personalize** | `backend/stage_d_e_personalizer.py` | Preferences + packet | Persona fork, metric lock, club lens, translations | Yes — cheap |

The 10 Hz tick loop **never awaits Stage C**. Cloud reasoning is dispatched with `asyncio.create_task`, so a slow model cannot stall the match.

---

## 5. v5 Deep Dives

### 5.1 Fan Personalization Engine

`PersonalizationState` is a single runtime contract shared by backend and frontend:

```json
{
  "persona_mode": "TWINCAST_SPLIT",
  "metric_focus": "ALL",
  "favorite_club_bias": "NEUTRAL",
  "locked_player_id": null,
  "market_language": "en"
}
```

| Field | Allowed values | Effect |
|-------|----------------|--------|
| `persona_mode` | `ANALYST_HUD`, `CASUAL_STORY`, `TWINCAST_SPLIT` | Selects analyst/casual/both Stage E copy |
| `metric_focus` | `ALL`, `SPEED_VELOCITY`, `PASS_QUALITY`, `EXPECTED_THREAT_XT`, `CHAOS_PRESSING` | Locks the HUD to one metric family and filters 3D tags |
| `favorite_club_bias` | `NEUTRAL`, `NLA_LOYALIST`, `MCS_LOYALIST` | Frames the same event through a club lens |
| `locked_player_id` | any synthetic player ID | Loads that player’s context into Stage E |
| `market_language` | `en`, `es`, `ar`, `hi` | Selects localized copy and speech locale |

**API**

```http
GET  /api/personalization
POST /api/personalization
Content-Type: application/json

{
  "persona_mode": "ANALYST_HUD",
  "metric_focus": "PASS_QUALITY",
  "favorite_club_bias": "NLA_LOYALIST",
  "locked_player_id": "NLA_7",
  "market_language": "es"
}
```

The backend normalizes invalid values to safe defaults. The frontend debounces preference writes by 300 ms and applies the matching 3D layer filter immediately:

| Metric focus | 3D layers |
|--------------|-----------|
| `ALL` | xT grid, ghost pass, defensive lasers |
| `SPEED_VELOCITY` | Speed tags only |
| `PASS_QUALITY` | Ghost pass + passing network |
| `EXPECTED_THREAT_XT` | xT grid + ghost pass + control surface |
| `CHAOS_PRESSING` | Defensive lasers + control surface |

> **Note:** overlay filtering is a presentation choice; Stage B always computes the full metric set.

---

### 5.2 Milestone Engine

`MilestoneTracker` runs inside Stage A on every 10 Hz tick and receives Stage B-enriched events and metrics.

| Milestone | Trigger | Cooldown / reset | Payload |
|-----------|---------|------------------|---------|
| `MILESTONE_SPRINT_PEAK` | New match speed record above **31.5 km/h** | 5 s between emissions | Player, team, peak km/h, synthetic percentile |
| `MILESTONE_PASS_MASTERY` | **5 consecutive** passes with PDR ≥ **78** | Resets on PDR < 65 or turnover/interception | Avg PDR, cumulative xT |
| `MILESTONE_PRESS_DOMINANCE` | Possession in final third + pressing intensity ≥ 2 for **30 s** | Decays at half rate when condition breaks | Team, duration, PPDA |

Milestones are:

1. Broadcast over the WebSocket as `event` packets.
2. Stored in `engine.milestones.summary()[:3]` for the recap.
3. Rendered in `TwinCastHUD` and the recap modal.

The sprint percentile is bounded:

```text
percentile = min(99.9, 95.0 + (peak_kmh - 32.0) × 1.4)
```

---

### 5.3 Match Recap Studio

`GET /api/match-recap` (and `POST`) returns a three-act storyboard:

```json
{
  "title": "The Championship Finale — Three Acts That Decided It",
  "subtitle": "…",
  "model": "aether-recap-storyboard-v5",
  "score": { "NLA": 1, "MCS": 1 },
  "timecode": "67:24",
  "acts": [
    {
      "act": 1,
      "title": "The Tactical Catalyst",
      "clock": "64:12",
      "actual_pass": { "start": { "x": 52.5, "y": 34 }, "end": { "x": 78, "y": 34 } },
      "ghost_pass": {
        "start": { "x": 52.5, "y": 34 },
        "end": { "x": 82, "y": 48 },
        "delta_xt": 0.214,
        "target_id": "NLA_9",
        "openness_m": 12.4
      },
      "key_player_ids": ["NLA_8", "NLA_9", "MCS_6"],
      "highlight_zone": { "x_min": 40, "x_max": 94, "y_min": 25, "y_max": 57, "label": "…" },
      "camera_mode": "TACTICAL_DRONE_ORBIT",
      "snapshot": { "…": "full 22-player MatchTick at that instant" },
      "localized_commentary": { "en": "…", "es": "…", "ar": "…", "hi": "…" }
    }
  ],
  "milestones": ["…"]
}
```

**Three act selection**

| Act | Preferred archive event | Camera |
|-----|-------------------------|--------|
| 1 — The Tactical Catalyst | `TACTICAL_INVERSION`, then `PASS` | Tactical drone orbit |
| 2 — The Pressure Rupture | `PRESSURE_TRAP`, `TURNOVER`, `SHOT` | Tactical drone orbit |
| 3 — The Counter-Factual Storm | `GOAL`, `SHOT`, `PASS` | Tactical drone orbit |

If the archive is cold, a deterministic live pass pair is generated. Three fallback milestones fill any gaps.

**`LOAD ACT · TIME TRAVEL`** performs a coordinated state transition:

1. Pause telemetry playback.
2. Restore the act’s full player snapshot into the 3D scene and HUD.
3. Move the camera to the act’s camera mode.
4. Spotlight `key_player_ids` and draw the actual + ghost tactical arrows.
5. Draw the gold actual-pass tube and dashed cyan ghost tube (`RecapPassTubes.tsx`).
6. Highlight the act zone.
7. Speak the localized act commentary.
8. Keep the DVR paused so the moment can be inspected.

**Teleprompter export** downloads a UTF-8 `.txt` with title, score, milestones, all three acts, selected-language commentary, PDR/ΔxT/ghost values, and model ID.

---

### 5.4 Spatial Control Surface + Passing Network

`SpatialControlSurface3D.tsx` renders:

- A **21×14 Gaussian control grid** baked into a `CanvasTexture`.
- Red (high control) through cyan (low control) thermal mapping.
- A separate elevated **3D passing network** with team-colored links and PDR labels.
- Mesh height offset above the turf to avoid z-fighting and preserve shadow readability.

The two layers are independent toggles (`pitchControl`, `passingNetwork`) in `CameraDirectorBar`.

---

### 5.5 Judge Autopilot Tour

`JudgeAutopilotTour.tsx` runs a deterministic six-step timeline:

| Step | Time | Action | Rubric |
|------|------|--------|--------|
| 1 | 0–10 s | Force CV Auto-Eventer open, Tele camera | 10 Hz ingest · 22 players |
| 2 | 10–20 s | Enable control surface + passing network + lasers; inject `chaos_counter` | God Mode + AI camera |
| 3 | 20–32 s | Pause DVR, drone orbit, spotlight, offside wall, ghost lane | Freeze + telestrate |
| 4 | 32–44 s | Resume, enter broadcast alpha for ~6.5 s | Transparent AR compositing |
| 5 | 44–54 s | Alpha off, Player Lock 3rd person, TwinCast split, `PASS_QUALITY`, ES → HI → AR | Stage E personalization |
| 6 | 54–60 s | Open 3-act recap, reveal rubric modal after 4 s | Milestones + proof |

Voiceover uses the same zero-overlap speech controller as the broadcast. The callout above the pitch shows the current rubric, action, and 60-second progress bar. Pressing the button again stops the tour and clears timers, alpha, and CV override.

---

### 5.6 Resilient Match Engine

`useResilientMatchEngine` guarantees a live picture in three scenarios:

| Scenario | Behavior | HUD status |
|----------|----------|------------|
| Backend + WebSocket healthy | Pipeline packets drive all state (Azure when configured, deterministic local fallback otherwise) | 🟢 `PIPELINE LIVE (10Hz)` |
| Backend absent | Browser `EdgeEngine` steps at 10 Hz with its own 22 players, passes, turnovers, metrics, insights, and pipeline | ⚡ `EDGE AUTONOMOUS ENGINE ACTIVE (10Hz)` |
| Backend returns | Edge timer stops on `onopen`; backend packets take over without a reload | 🟢 back to live |

**Hot-swap details**

- `tickRef` always holds the freshest authoritative frame for DVR and recap playback.
- `telemetry.playbackPaused` gates React state updates during freeze/time travel.
- WebSocket reconnects every 2.5 s; edge keeps rendering until `onopen`.
- Scenario injections fall back to `edgeRef.current.inject(name)` if the REST call fails.
- Status is a first-class `EngineStatus` type, not a transient toast.

---

## 6. Mathematical Appendix

### 6.1 Chaos Index

```text
T̂  = min(1, turnovers_60s / 6)
σ̂² = min(1, Var(ball_speed_kmh) / 900)
S  = defensive_line_stretch_m / 35
P  = min(1, pressing_intensity / 3)

raw = 0.35·T̂ + 0.25·σ̂² + 0.20·S + 0.20·P + scenario_boost
C_t = clip(0.90·C_{t-1} + 0.10·clip(raw))
```

Classification: `< 0.40` Structured Control · `0.40–0.68` Balanced Rhythm · `> 0.68` High Chaos Transition.

### 6.2 Pass Difficulty Rating

```text
logit = 0.08·distance_m
      + 0.05·ball_speed_kmh
      + 0.65·defenders_in_cone
      − 0.30·nearest_defender_m
      − 2.5

PDR = 100 / (1 + e^(−logit))
```

Higher PDR means a harder completion. `PDR > 80` is an AI-gate reason.

### 6.3 Expected Threat

- 16 columns × 12 rows.
- Bounded surface from 0.004 (own corner) to 0.350 (six-yard box).
- Bilinear interpolation at any `(x, y)`.
- Per pass: `ΔxT = xT(end) − xT(start)`.

### 6.4 Ghost Pass

For every teammate at distance ≥ 5 m:

```text
openness = min distance from any opponent to the pass segment
score    = 3.0·ΔxT + 0.06·openness
```

The highest-scoring alternative is emitted with end point, ΔxT, target ID, and openness.

### 6.5 AI Gate and Leverage

An event is explained when any is true:

```text
PDR > 80
|ΔChaos over 10 s| > 0.20
ΔxT > 0.08
scenario is active
```

```text
leverage = 0.60·(PDR/100)
         + 2.00·max(0, ΔxT)
         + 1.20·|ΔChaos|
         + 0.40·[scenario active]
```

### 6.6 Milestone Conditions

```text
sprint:  max speed > 31.5 km/h, emit at most every 5 s
pass:    PDR ≥ 78 for 5 consecutive passes
reset:   PDR < 65 or TURNOVER/INTERCEPTION
press:   final-third possession + pressing ≥ 2 for 30 s
```

### 6.7 10 Hz → 60 FPS Synchronization

- Server emits authoritative ticks at 10 Hz.
- The telemetry store keeps mutable player/ball state outside React.
- R3F reads interpolated positions every frame; React HUD updates at a lower cadence.
- DVR stores 150 ticks (15 s). Pausing stops React tick replacement but keeps the last frame readable.
- Stage C runs asynchronously; no LLM latency enters the tick budget.

---

## 7. Run Locally

```bash
# backend
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# frontend
cd frontend
npm install
npm run dev
```

Or launch both with `start_studio.bat` (Windows) / `bash start_studio.sh`.

| Service | URL |
|---------|-----|
| Studio | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Alpha overlay | http://localhost:3000/?overlay=alpha |

No credentials? Everything still runs through deterministic fallbacks. Add `AZURE_OPENAI_*` and `AZURE_TRANSLATOR_*` to `backend/.env` for cloud reasoning and translation.

---

## 8. Demo Video Script (must be under 2:00)

Official Rules §4.4 requires the demo video to be **less than two minutes**. Record at 1080p, use no third-party logos or unlicensed music, and upload it publicly to YouTube, Vimeo, Facebook Video, or Youku. The 60-second autopilot makes a sub-two-minute cut straightforward.

| Time | On screen | Say |
|------|-----------|-----|
| **0:00–0:08** | Studio opens on Tele Cam | “This is AETHER PITCH: a live 3D football broadcast running on 100% synthetic 10 Hz telemetry.” |
| **0:08–0:12** | Click **Run 60s Judge Autopilot** | “One click runs a 60-second guided tour of the whole stack.” |
| **0:12–0:28** | Steps 1–2: CV viewport, control surface, lasers, Chaos Counter | “Every overlay comes from the five-stage pipeline: ingest, interpret, explain, render, personalize.” |
| **0:28–0:40** | Step 3: DVR freeze, drone orbit, spotlight, offside wall, ghost lane | “Freeze live play, scrub 15 seconds, and telestrate the full 22-player snapshot in 3D.” |
| **0:40–0:52** | Step 4: broadcast alpha | “Alpha mode strips every opaque surface, leaving a transparent AR layer for any broadcast compositor.” |
| **0:52–1:08** | Steps 5–6: Fan Tuner, Pass Quality, NLA lens, ES → HI → AR, recap opens | “The same moment becomes a different story per fan: persona, metric lock, club lens, and language.” |
| **1:08–1:30** | Inspect milestones; click **Load Act** on Act 2; export teleprompter | “The milestone engine builds a three-act recap; Load Act restores the exact moment and draws actual versus ghost.” |
| **1:30–1:45** | Click **Verify**; toggle the backend offline, then back | “A one-click five-stage audit, plus a 10 Hz edge engine that keeps the picture alive if the backend drops.” |
| **1:45–1:55** | Close on the live pitch | “AETHER PITCH — synthetic football, real mathematics, broadcast-grade 3D.” |

**Fallback 20-second version:** open the studio → Run Autopilot → skip to the recap and press **Verify**.

---

## 9. Judge Rubric Mapping

| Criterion | Where to look | Proof |
|-----------|---------------|-------|
| **Real-time 3D / broadcast quality** | Full-bleed R3F stadium, 22 avatars, 60 FPS interpolation | Tele cam, drone orbit, player lock, GOAL slam |
| **Azure AI integration** | Pipeline Inspector + `/api/health/pipeline-audit` | Stage A→E latency, raw payloads, deterministic fallbacks |
| **Football intelligence** | Tactical Pulse, xT grid, PDR, ghost pass, defensive lasers | Stage B math appendix |
| **Personalization** | Fan Tuner + TwinCast badges + localized speech | Persona, metric lock, club bias, ES/AR/HI |
| **Storytelling** | Milestones + three-act recap + teleprompter | Sprint/pass/press records, `LOAD ACT` time travel |
| **Reliability** | Pipeline status pill + backend-off demo | Edge fallback and hot-swap |
| **Compliance** | README + guide | 100% synthetic data, no real clubs/logos/tracking |

---

## 10. Verification

```bash
cd backend
python -m py_compile main.py stage_a_synthetic_engine.py stage_b_math_engine.py \
  stage_c_foundry_agents.py stage_d_e_personalizer.py
python test_pipeline.py

cd ../frontend
npx tsc --noEmit
npm run build
```

Expected backend result:

```text
RESULT: ALL PIPELINE TESTS PASSED
```

New API smoke tests:

```bash
curl http://127.0.0.1:8000/api/match-recap
curl -X POST http://127.0.0.1:8000/api/personalization \
  -H "Content-Type: application/json" \
  -d "{\"persona_mode\":\"ANALYST_HUD\",\"metric_focus\":\"PASS_QUALITY\",\"favorite_club_bias\":\"NLA_LOYALIST\",\"locked_player_id\":\"NLA_7\",\"market_language\":\"es\"}"
```

Responsive screenshots (1366×768, 1920×1080):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new `
  --user-data-dir="$env:TEMP\aether-shot" --window-size=1366,768 `
  --virtual-time-budget=10000 --screenshot="$env:TEMP\aether-1366.png" `
  http://127.0.0.1:3000
```

---

## 11. Repository Map (v5 additions in bold)

```text
backend/
  stage_a_synthetic_engine.py      # 10 Hz engine + MilestoneTracker
  stage_b_math_engine.py           # chaos / PDR / xT / ghost / gate
  stage_c_foundry_agents.py        # Azure AI Foundry + recap_storyboard
  stage_d_e_personalizer.py        # overlays + personalization + i18n
  main.py                          # WS hub, recap archive, v5 REST
  test_pipeline.py

frontend/src/
  app/page.tsx                     # v5 integration + autopilot wiring
  hooks/useResilientMatchEngine.ts # WS + edge hot-swap
  lib/edgeEngine.ts                # 10 Hz browser fallback engine
  components/
    FanPersonalizationTuner.tsx    # persona / metric / club / language
    MatchRecapStudioModal.tsx      # 3-act recap + time travel + export
    JudgeAutopilotTour.tsx         # 60 s / 6-step rubric tour
    TwinCastHUD.tsx                # metric-lock + club-lens badges
    PipelineInspector.tsx          # live/edge status pill
    VisionAutoEventerHUD.tsx       # external expanded override
    three/
      SpatialControlSurface3D.tsx  # 21×14 control surface + pass network
      RecapPassTubes.tsx           # actual gold + ghost cyan tubes
```

---

## 12. Compliance and Safety

- **Synthetic by construction** — generated squads, physics-based tracking, procedural stadium; no proprietary data feeds, club, league, player, or logo IP.
- **No hidden data pipeline** — every number shown is produced by the included Stage A/B code or clearly labelled as an AI narrative.
- **No blocking LLM dependency** — cloud calls are optional, asynchronous, rate-limited, and fallback-backed.
- **No leaked secrets** — credentials live in `.env` (git-ignored) or your deployment secret store; the repo ships `.env.example` only.
- **Broadcast-safe** — alpha mode removes opaque surfaces; the `AETHER_RENDER_PARTNER_V2` packet exposes the render contract.

---

## 13. Official Rules Checklist

**Key dates:** registration closed **October 20, 2026 at 12:00 pm PT**; submissions close **October 27, 2026 at 11:59 pm PT**; judging runs through **November 10, 2026**.

| Requirement (Official Rules) | Where it is satisfied | Status |
|---|---|---|
| New project created after September 29, 2026 | Git history starts October 19, 2026 | Done |
| Five-stage pipeline: ingest, interpret, explain, render, personalize | README pipeline contract; Stage A–E in `backend/`; `/api/health/pipeline-audit` | Done |
| Player ID, pass quality, speed, ball/shot speed metrics | Stage A events + Stage B PDR/xT; HUD player pills and scorebug | Done |
| Auto-eventing (synthetic CV feed) | `VisionAutoEventerHUD` + Stage A auto-eventer; clearly labelled synthetic | Done |
| Narrative generation and match recap | Stage C insights + three-act storyboard | Done |
| Explainability (control vs chaos, pressure, rhythm) | Chaos Index, PDR, xT, Ghost Pass, causal “why” narratives | Done |
| Data innovation | Seeded 10 Hz synthetic engine + milestone tracker | Done |
| Multi-language storytelling (EN/ES/AR/HI) | Stage E atlas + optional Azure AI Translator; localized speech | Done |
| 100% synthetic football data; no match footage, real clubs, players, crests, or tracking | Seeded simulation; fictional NLA/MCS squads; procedural stadium and crests | Done |
| Public GitHub repository | https://github.com/shashankh3/aether-pitch (public) | Done |
| Project pitch/description | README intro + §1 of this guide | Done |
| English submission materials | README, guide, UI default | Done |
| Demo video **under 2:00**, public URL, shows the project running, no third-party marks or unlicensed music | §8 script (1:55); record and upload to YouTube/Vimeo/Facebook/Youku | **Action needed** |
| Working demo/test access for judges, free of charge until judging ends | Provide a hosted URL and credentials; local/Docker steps are in §7 | **Action needed** |
| Original work, owned by the entrant; third-party SDK/API licenses respected | Original code; OSS dependencies under their licences; no bundled third-party assets | Done |
| Team representative, eligibility, ownership, not a prior winner, no Sponsor financial support | Complete the submission-form attestations; keep registration details current | **Action needed** |
| Video does not include third-party trademarks | UI and script use AETHER PITCH branding only; no real clubs, leagues, or brands | Done |

**Note on Azure:** the app is fully functional without cloud credentials. Stage C uses Azure AI Foundry-hosted Azure OpenAI deployments and Stage E uses Azure AI Translator when configured; otherwise both use deterministic local fallbacks. This is intentional, so judges can test offline and the demo never blocks on a model call. `azure.yaml` is a service manifest, not a turnkey infrastructure template; use Docker Compose for a zero-setup local demo, or provide your own `azd` infrastructure for a hosted URL.

---

**AETHER PITCH v5.0** · Synthetic football. Real mathematics. Broadcast-grade 3D. Built for the championship finale.
