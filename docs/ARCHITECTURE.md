# AETHER PITCH — Architecture Reference

> A real-time 3D football broadcast studio running on 100% self-generated
> synthetic telemetry, with a deterministic five-stage AI pipeline and a
> hot-swappable browser-native twin.

This document is the map. For the *what it does* see [README.md](../README.md);
for the *how to run it* see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## 1. The one-paragraph version

A seeded Python simulation produces a 10 Hz football match. A FastAPI service
turns that stream into deterministic football mathematics (Expected Threat,
Pass Difficulty, Chaos Index, pitch control, ghost-pass counterfactuals, fatigue
projections), optionally asks Azure AI Foundry to explain the interesting
moments, and broadcasts the result over a WebSocket. A Next.js client renders
it as a procedural night stadium with 22 articulated avatars, volumetric AR
overlays and an automated camera rig. A browser-native twin of every
deterministic model runs at all times, so the picture never depends on the
network.

---

## 2. Module map

```text
backend/
  stage_a_synthetic_engine.py 1,075 LOC  Stage A — the simulation
  stage_b_math_engine.py        870 LOC  Stage B — the mathematics
  stage_c_foundry_agents.py       36 LOC  stable re-export barrel
  agents/                     1,841 LOC  Foundry router package (8 modules)
  stage_d_e_personalizer.py     555 LOC  Stage D/E — render + personalise
  agent_trace.py                231 LOC  grounded handoff trace
  rai_shield.py                 311 LOC  prompt shield + neutrality + grounding
  content_safety.py             206 LOC  Azure AI Content Safety (optional)
  counterfactual.py             358 LOC  what-if contract + evaluation (no globals)
  parity_fixture.py             237 LOC  cross-engine parity fixture
  config.py                      98 LOC  environment + runtime configuration
  main.py                     1,157 LOC  HTTP/WS surface + match loop
  runtime.py                    169 LOC  WebSocket hub + request body guard
  circuit_breaker.py            147 LOC  transport retry + circuit breaker
  test_pipeline.py            2,518 LOC  237 assertions
  test_resilience.py            234 LOC  resilience + async transport tests

frontend/src/
  lib/edgeEngine.ts               1 LOC  stable re-export barrel
  lib/edgeEngine/             1,782 LOC  the browser-native twin (9 modules)
  lib/telemetry.ts              284 LOC  10 Hz store → 60 fps render
  lib/types.ts                    1 LOC  stable re-export barrel
  lib/types/                    919 LOC  the shared contract surface (6 modules)
  lib/dossier.ts                359 LOC  audit dossier serialization
  lib/sandboxStore.ts           247 LOC  what-if sandbox state
  lib/ledgerStore.ts             88 LOC  counterfactual experiment ledger
  lib/runtimeConfig.ts           53 LOC  runtime backend coordinates
  lib/terminology.ts         380 LOC  the terminology module
  lib/narrativeAtlas.ts       92 LOC  the narrativeAtlas module
  lib/failoverDrill.ts       199 LOC  the failoverDrill module
  lib/hudContext.tsx            169 LOC  control-center + palette state
  lib/useModalA11y.ts            72 LOC  focus trap + escape handling
  lib/utils.ts                   14 LOC  shared class-name helper
  lib/api.ts                      6 LOC  the REST client
  app/page.tsx                1,352 LOC  the orchestrator
  app/layout.tsx                121 LOC  runtime config injection + error boundary
  hooks/useResilientMatchEngine.ts  336 LOC  WS + edge failover + drill
  hooks/useSpeechController.ts      129 LOC  zero-overlap speech
  hooks/useRenderTelemetry.ts       55 LOC  measured frame rate
  components/                            HUD, drawers, modals (36 files)
  components/three/                      the 3D scene (12 files)

infra/main.json                 491 LOC  ARM template (16 resources)
```

---

## 3. Data flow

```text
             ┌──────────────────────── 10 Hz â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
             │                                                      │
  [Stage A] seed=42 simulation ──► state{players,ball,clock}      │
             │                              │                     │
  [Stage B] deterministic math ◄───────────┘                     │
             │  xT grid · PDR · Chaos · PPDA                      │
             │  pitch control · ghost pass · bio-load             │
             ▼                                                    │
  [Stage C] Foundry router (optional) ──► narrative + scene directive
             │                                                    │
  [Stage D/E] render packet + personalisation                    │
             │                                                    │
             ▼                                                    │
        FastAPI hub ──WebSocket /ws──► telemetry store ──► 3D + HUD
```

### The four resilience layers

| Layer | Where | What it protects |
|---|---|---|
| 1. Stage B is deterministic | `stage_b_math_engine.py` | The numbers never depend on a model being reachable. |
| 2. Stage C has a local fallback | `backend/agents/` | No Azure key still produces the same schema. |
| 3. The browser twin | `lib/edgeEngine/` | The client can run the whole match with no server. |
| 4. The hub queues per client | `main.py` (`Hub`) | One slow viewer cannot stall the 10 Hz loop. |

The **cloud-outage drill** is the demo of layers 3 and 4 working together: the
cloud stream is dropped, the deterministic edge engine keeps the 3D scene
running with zero dropped frames, and the cloud reconnects and reconciles the
match clock. Its state machine lives in `lib/failoverDrill.ts` with the clock
and timers injected, so a six-second drill is driven deterministically in the
headless logic suite — 22 assertions cover the phase order, the measured swap
latency, the zero-dropped-frames claim, the 1 Hz badge republication, the
refusal of a second trigger, the socket-reopen cross-check and timer disposal.

---

## 4. The five stages

### Stage A — Synthetic ingest (`stage_a_synthetic_engine.py`)
A seeded, frame-for-frame reproducible football simulation: 22 players with
per-role kinematics, ball physics, pass completion, tackles, auto-evented
sprint/distance thresholds, milestone detection, match metadata, and the
**bio-load twin** (rolling metabolic load, +10-minute stamina projection,
fatigue-adjusted PDR penalty, role-specific relief directive).

### Stage B — Deterministic mathematics (`stage_b_math_engine.py`)
Pure NumPy, zero heuristics, 100% auditable:

| Output | Meaning |
|---|---|
| `xt_value` / 16×12 grid | Expected Threat, normalised to [0.004, 0.350] |
| `pass_difficulty` | Logistic PDR from distance, speed, defenders, nearest man |
| `chaos_index` | EMA of turnovers, ball-speed variance, line stretch, press |
| `ppda` | Passes allowed per defensive action, rolling 60 s window |
| `ghost_pass` | The better lane nobody took, with net ΔxT and completion % |
| `pitch_control_split` | Territory share per cell, proximity + velocity weighted |
| `passing_network_edges` | Top-5 high-value lanes with xT weights |
| `evaluate_defensive_line_shift` | Collective line shift → exposure, trap %, press gain |
| `bio_load_summary` | Mean load, mean +10 m projection, worst penalty, at-risk list |

### Stage C — Foundry routing and agents (`backend/agents/`)
- **4-node insight pipeline** — `Spatial Sentinel` → `Tactical Triage` → `Causal Analyst + Critic` → `Broadcast Director`.
- **3-turn adversarial war-room** — manager proposes, scout counters, arbiter adjudicates. Each turn is a *separate* model call with its own Stage B tool bundle, and each reads the turns before it.
- **Counterfactual arbiter** — `POST /api/counterfactual-query` returns a `structural_vulnerability_index`, a compensation move, and a numeric-critic verdict.
- **RAI** — a pre-flight prompt shield, a post-flight numeric critic and a club-neutrality gate, plus optional Azure AI Content Safety.

### Stage D/E — Render and personalise (`stage_d_e_personalizer.py`)
Overlay packets, camera directives, highlight zones; persona, metric lock, club
bias, locked player, cognitive density, colourblind palette, market language.

---

## 5. The interactive counterfactual sandbox

The 3D stage is not an observer feed — it is a sandbox.

1. **Pause and grab.** The judge drags any avatar. `sandboxStore` holds the
   relocation in a mutable module store, so the 60 fps render loop is
   untouched and the page never re-renders.
2. **Recompute.** The browser twin re-evaluates the *same* functions the server
   uses (`xtValue`, `computePitchControlSplit`, `evaluateDefensiveLineShift`).
   The Python and TypeScript implementations are proven byte-identical by
   permanent parity tests in both suites.
3. **Shift the whole block.** The collective line scrubber slides a backline
   between 18 m and 52 m; the 3D offside wall and compactness hull are rebuilt
   from the shifted players.
4. **Adjudicate.** `POST /api/counterfactual-query` recomputes everything
   server-side (the client baseline is only a cross-check) and returns a
   verdict, a vulnerability index and a compensation move.
5. **Log and export.** Every experiment lands in the session ledger, which is
   serialized into the JSON *and* Markdown audit dossiers and surfaced in the
   rubric verifier.

---

## 6. Verification

| Suite | Command | Covers |
|---|---|---|
| Backend | `python backend/test_pipeline.py` | 237 assertions: all five stages, the gate, the trace, the war-room, the counterfactual arbiter, the line shift, the RAI shield, the hub, the retry policy, the xT/pitch-control invariants, the i18n atlas, the REST contract, the compliance audit |
| Resilience | `python backend/test_resilience.py` | 9 async-transport, retry, timeout and circuit-breaker checks; non-retryable 4xx errors do not trip the breaker |
| ARM | `python infra/validate_template.py` | JSON validity, ARM symbol resolution, dependency integrity, secret handling |
| Docs | `python tools/doc_lint.py` | Every assertion count, `/api` path, `npm run` script, quoted file path and module size in the judge-facing docs still matches the code |
| Types | `cd frontend && npx tsc --noEmit` | The whole contract surface |
| Build | `npm run build` | Production compile |
| SSR | `npm run smoke` | In-process server render, runtime config injection, no SSR error |
| Logic | `npm run check:logic` | 89 headless assertions over the browser twin, the sandbox, the ledger, the dossier and the DVR buffer |
| UI render | `npm run smoke:ui` | 33 assertions — every judge-facing surface renders without throwing |

The backend suite also runs the **Official Rules compliance audit** — synthetic
metadata, deterministic replay, Stage A–E payload keys, zero third-party brand
strings, zero external media references, encoding hygiene and ARM validity.

The logic suite also enforces the **accessibility gate**: every slate token the
HUD renders as text is contrast-checked against the panel background at the
WCAG AA 4.5:1 threshold, every icon-only button must carry an accessible
name, and every focus-trapped panel must be announced as a dialog. A
regression in any of those fails the build rather than reaching a judge.

## 6b. The cross-engine parity harness

The Stage B engine runs on the backend. The browser twin in `lib/edgeEngine/`
runs when the backend is unreachable. If they ever disagree, a judge sees one
product online and a different one offline — and the promise that *every
number is grounded in live telemetry* stops being true.

So the two engines are compared directly. `backend/parity_fixture.py` runs a
deterministic scenario through the Python engine and writes its answers to
`frontend/scripts/parity-fixture.json`; the logic suite recomputes each of
them with the twin and asserts they match:

| Surface | Compared at |
|---|---|
| The 16×12 xT surface | 192 grid points × both attacking directions |
| The pitch-control split | the three territory percentages |
| The passing network | every edge, its weight, its distance and its order |
| The per-player bio-load profile | all 22 players, every field, including the relief directive |
| The collective defensive line shift | both teams × three target heights, every field |
| The simulated pitch control | three separate relocations |
| The narrative atlas | all 6 archetypes × all 4 languages, byte for byte |
| The archetype classifier | all 12 branches of the classifier, one for one |

The backend suite asserts the fixture still reproduces from the live engine,
so it cannot go stale silently, and `python backend/parity_fixture.py`
regenerates it. This harness is what caught the twin relocating only the
*first* player of a whole defensive block, the twin's xT helper rounding to
four decimals where the engine did not, and the twin's archetype classifier
disagreeing with the engine's on every branch.

## 6c. Two audiences, one pitch

The studio is watched by two different people. A judge wants `xT`, `PPDA` and
`Chaos Index`; an ordinary football fan wants to know what is happening and
why. Removing the technical language would gut the project, so it is not
removed.

`lib/terminology.ts` is the single source of truth: every technical term
carries a plain reading and a one-sentence explanation a fan could repeat to
a friend. The top bar switches the whole overlay between **Plain** and
**Analyst**, and an **Explain** sheet lists every metric grouped by
attacking, defending, fitness, the match and the studio. The technical term
is always still there, as the small qualifier under the plain reading, so
nothing is lost.

The two audiences are kept apart on purpose. The *analyst* panels — the
Pipeline Inspector, the Rubric Verifier, the war-room and the dossier — are
what a judge is being asked to assess, so they keep the analyst terms
untouched, and the headless suite fails the build if the plain layer is
allowed to creep into them.

On the fan-facing side, the suite scans every technical label a fan reads —
195 of them — and fails if any has no plain reading, so nothing can ship
unexplained.

## 7. The 3D performance budget
The pitch runs a live 22-player 3D scene at 10 Hz with a measured frame-time
chip in the corner. Four things keep that inside the frame budget:

| Technique | Where | Effect |
|---|---|---|
| **InstancedMesh** for the crowd | `StadiumEnvironment3D.tsx` | the whole stand is one draw call, not one per spectator |
| **InstancedMesh** for the xT floor | `TacticalOverlays3D.tsx` | all 192 grid cells are one draw call, recoloured in place |
| **Module-level geometry pool** | `PlayerAvatar3D.tsx` | the 14 avatar parts are created once and shared by all 22 players; only the per-player kit materials are unique |
| **Animation without React** | `PlayerAvatar3D.tsx` | the tick mutates object transforms directly inside `useFrame`; no `setState` at 10 Hz, so the React tree is not re-rendered by the match loop |

The render-affecting work is also throttled to the rate the data actually
arrives: the defensive-line overlays recompute on the 10 Hz stream tick, not
on the 60 Hz animation frame. The one place that used to rebuild a Bezier
curve from scratch every frame — the ghost-pass trail — now reuses a
module-level curve and scratch vectors, so a frame allocates nothing while a
ghost pass is on screen.
