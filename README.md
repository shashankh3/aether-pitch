# AETHER PITCH — The Autonomous Tactical Pulse & Dual-Cast Studio Engine

**Premier League & Microsoft Azure "Inside the Game" Hackathon submission.**
An EA Sports FC (HyperMotion V) + Lenovo Football AI Pro style broadcast studio running a
5-stage real-time AI pipeline over **100% synthetic, physics-informed football telemetry**.

```
NLA (North London Athletic)  vs  MCS (Manchester Cityscape)
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
cd backend  && python -m pip install -r requirements.txt && python -m uvicorn main:app --port 8000
cd frontend && npm install && npm run dev
```

**Go cloud (optional):** copy `backend/.env.example` → `backend/.env` and add your
`AZURE_OPENAI_*` / `AZURE_TRANSLATOR_*` credentials. Without credentials the app runs
fully offline on deterministic local fallbacks — judge-ready out of the box.

---

## Architecture: the 5-Stage Pipeline

```
┌───────────────────────────  STAGE (a) INGEST ───────────────────────────┐
│ stage_a_synthetic_engine.py — "PitchForge" 10Hz physics-informed         │
│ state machine: 22 players + ball [x,y,vx,vy] on a 105m×68m pitch.        │
│ Auto-eventer (no manual tagging): AUTO_SPRINT_ALERT (>30 km/h),          │
│ PASS (15° cone defender count), PRESSURE_TRAP (3+ defs < 6 m),           │
│ TURNOVER (middle-third flag), SHOT/SAVE/GOAL.                            │
│ God-Mode injection: chaos_counter · high_press_turnover ·                │
│ tactical_inversion · halftime_recap                                      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                ▼
┌─────────────────────────  STAGE (b) INTERPRET ──────────────────────────┐
│ stage_b_math_engine.py — deterministic NumPy, no LLM guessing:           │
│  • Control-vs-Chaos Index C_t ∈ [0,1] (rolling 60 s window):             │
│      0.35·T̂r + 0.25·σ̂²v + 0.20·D̂stretch + 0.20·P̂ress → EMA             │
│      <0.40 STRUCTURED CONTROL · 0.40–0.68 BALANCED · >0.68 HIGH CHAOS    │
│  • Pass Difficulty Rating: 100/(1+e^-logit), logit = 0.08d + 0.05vb      │
│      + 0.65·Ndef − 0.30·pdist − 2.5                                      │
│  • Expected Threat: 16×12 xT grid (0.004→0.350), bilinear ΔxT            │
│  • Counterfactual "Ghost Pass": scans 10 teammates by openness + ΔxT     │
│  • Deterministic AI gate: PDR>80 ∨ |ΔChaos|>0.20 ∨ ΔxT>0.08 ∨ scenario   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                ▼  (gate tripped only)
┌──────────────────────────  STAGE (c) EXPLAIN ───────────────────────────┐
│ stage_c_foundry_agents.py — Azure AI Foundry multi-model router:         │
│  Fast Triage (gpt-4o-mini/Phi-3.5) → tactical archetype <250 ms          │
│  Causal Narrative (gpt-4o) → WHY it matters + studio recaps              │
│  Fallback: deterministic template engine (same strict JSON schema)       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                ▼
┌──────────────────────────  STAGE (d) RENDER ────────────────────────────┐
│ stage_d_e_personalizer.py — time-coded machine-readable overlay packets  │
│ (lower-third title/subtitle, highlight players, ghost-pass flag) pushed  │
│ over WebSocket (Azure Web PubSub ready) to the EA FC HUD.                │
└───────────────────────────────┬──────────────────────────────────────────┘
                                ▼
┌────────────────────────  STAGE (e) PERSONALIZE ─────────────────────────┐
│ Dual-persona fork: analyst_view (PPDA/ΔxT/PDR/def-line) vs casual_fan    │
│ (story card + excitement rating) · PlayerLock 360 insight · EN/ES/AR/HI  │
│ translation (Azure Translator → deterministic language atlas fallback)   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                ▼
                    Next.js Broadcast Studio (port 3000)
   TacticalPulseBar · HoloPitchCanvas · TwinCastHUD · PlayerLock360 ·
   StudioProducer ("The 12th Man") · PitchForgeDeck · PipelineInspector
```

Every packet crossing the WebSocket (`/ws`) is typed: `hello | tick (10Hz) |
metrics (2Hz) | event | insight | pipeline (2Hz) | recap`.

---

## Frontend visual spec (what judges see)

- **Obsidian stadium** `#07090E` glassmorphism HUD, zero page scroll (100vh broadcast layout).
- **Top bar** — live scoreboard + match clock, **Control-vs-Chaos waveform** (cyan→crimson),
  state badge, persona switch (Analyst / Fan / TwinCast), EN/ES/AR/HI, **2D ↔ 2.5D HoloPitch tilt**.
- **HoloPitchCanvas** (60 fps HTML5, animated isometric tilt):
  1. 16×12 **xT threat heatmap** glowing under active zones
  2. discretised **Voronoi pitch-control** mesh
  3. **defensive compactness lines** with live line-height tags (metres)
  4. **HyperMotion neon rings**, FOV cone + telemetry badge on the locked player
  5. **ballistic pass arcs** + dashed cyan **GHOST +x.xT counterfactual vector**
- **PlayerLock 360** — click any player: speed gauge with 30 km/h sprint flare, stamina,
  last pass PDR/ΔxT.
- **The 12th Man** — autonomous lower-thirds + causal chain + commentator talking point +
  instant top-3 **Studio Match Recap** modal (multi-language).
- **PitchForge God-Mode deck** — 4 scenario injectors (keys `1`–`4`).
- **Pipeline Inspector** — expandable 5-stage latency strip with raw JSON payloads for
  rubric verification in 5 seconds.

---

## Repo layout

```
├── backend/
│   ├── main.py                     # FastAPI orchestrator + WS broadcaster (the heartbeat)
│   ├── config.py                   # Azure env config (everything optional)
│   ├── stage_a_synthetic_engine.py # PitchForge 10Hz simulator + auto-eventer
│   ├── stage_b_math_engine.py      # Chaos Index, PDR, xT, Ghost Pass, AI gate
│   ├── stage_c_foundry_agents.py   # Azure AI Foundry router + deterministic fallback
│   ├── stage_d_e_personalizer.py   # Overlay packets + dual persona + i18n
│   └── requirements.txt / .env.example
├── frontend/
│   └── src/
│       ├── app/page.tsx            # EA Sports FC studio shell
│       ├── components/             # HoloPitchCanvas, TacticalPulseBar, TwinCastHUD,
│       │                           # PlayerLock360, StudioProducer, PitchForgeDeck,
│       │                           # PipelineInspector
│       ├── hooks/useStudio.ts      # WebSocket stream + throttled state
│       └── lib/types.ts            # shared packet schemas
├── start_studio.bat / .sh          # one-command launch
└── README.md
```

---

## 3-minute demo script

| Time | Action | What to say |
|------|--------|-------------|
| 0:00–0:20 | Studio loads, match already live at 62' | "This is a live broadcast built on a synthetic 10Hz physics engine — zero proprietary data." |
| 0:20–0:45 | Point at the chaos waveform, then toggle **2.5D HOLO** | "Our Control-vs-Chaos index measures game-state entropy over a rolling 60-second window. One click turns the 2D radar into a Lenovo-style 3D digital twin." |
| 0:45–1:20 | Click any player → **PlayerLock 360** | "EA FC HyperMotion telemetry: sprint speed, stamina, pass difficulty — and when a player exceeds 30 km/h the ring flares." |
| 1:20–2:00 | Press `1` — **High-Chaos Counter** | "Watch the entropy needle jump past 0.68 — our deterministic gate fires Stage C, and the co-pilot explains WHY: the 3v2 overload, the exposed line, the ghost pass we would have taken instead." |
| 2:00–2:30 | Switch persona to **Fan** + language **العربية**, toggle voice | "Same moment, two audiences — analyst telemetry for the booth, a plain-language story in four languages with live voice synthesis for the fan." |
| 2:30–3:00 | Press `4` — **Studio Match Recap**, open the Pipeline Inspector | "And that's the rubric: five stages, live latencies, raw payloads — Ingest, Interpret, Explain, Render, Personalize — traceable in five seconds." |

---

## Compliance checklist

- ✅ **100% synthetic data** — generated squads, physics-based tracking, no Opta/StatsBomb/Second Spectrum input.
- ✅ **Azure cloud-native** — AI Foundry (Stage c), Translator (Stage e), Web PubSub-ready (Stage d); deterministic fallbacks keep the demo alive without credentials.
- ✅ **Explicit 5-stage traceability** — the on-screen Pipeline Inspector shows per-stage latency and the last raw JSON payload for every stage at all times.

## Notes

- Match time runs at `MATCH_TIME_SCALE=6` (1 real second = 6 match seconds) and starts at
  minute 62 so judges land mid-match instantly. Both are env-tunable.
- Stage (c) rate-limits insights to one per 10 s so the broadcast pacing stays TV-like.
- `MATCH_START_MINUTE`, `AETHER_SEED`, ports, and the WS/API URLs (`NEXT_PUBLIC_*`) are configurable.
