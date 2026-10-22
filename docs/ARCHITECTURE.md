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
  stage_a_synthetic_engine.py   997 LOC  Stage A — the simulation
  stage_b_math_engine.py        785 LOC  Stage B — the mathematics
  stage_c_foundry_agents.py   1,442 LOC  Stage C — Foundry routing + agents
  stage_d_e_personalizer.py     413 LOC  Stage D/E — render + personalise
  agent_trace.py                208 LOC  grounded handoff trace
  rai_shield.py                 267 LOC  prompt shield + neutrality + grounding
  content_safety.py             132 LOC  Azure AI Content Safety (optional)
  counterfactual.py             298 LOC  what-if contract + evaluation (no globals)
  main.py                     1,075 LOC  HTTP/WS surface + match loop
  test_pipeline.py            1,902 LOC  191 assertions

frontend/src/
  lib/edgeEngine.ts           1,653 LOC  the browser-native twin
  lib/telemetry.ts              263 LOC  10 Hz store → 60 fps render
  lib/types.ts                  827 LOC  the shared contract surface
  lib/dossier.ts                        audit dossier serialization
  lib/sandboxStore.ts                   what-if sandbox state
  lib/ledgerStore.ts                    counterfactual experiment ledger
  lib/runtimeConfig.ts                  runtime backend coordinates
  lib/hudContext.tsx                    control-center + palette state
  app/page.tsx                1,201 LOC  the orchestrator
  app/layout.tsx                        runtime config injection + error boundary
  hooks/useResilientMatchEngine.ts      WS + edge failover + drill
  hooks/useSpeechController.ts          zero-overlap speech
  hooks/useRenderTelemetry.ts           measured frame rate
  components/                            HUD, drawers, modals (30 files)
  components/three/                      the 3D scene (12 files)

infra/main.json                 491 LOC  ARM template (16 resources)
```

---

## 3. Data flow

```text
             ┌──────────────────────── 10 Hz ────────────────────────┐
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
| 2. Stage C has a local fallback | `stage_c_foundry_agents.py` | No Azure key still produces the same schema. |
| 3. The browser twin | `lib/edgeEngine.ts` | The client can run the whole match with no server. |
| 4. The hub queues per client | `main.py` (`Hub`) | One slow viewer cannot stall the 10 Hz loop. |

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

### Stage C — Foundry routing and agents (`stage_c_foundry_agents.py`)
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
| Backend | `python backend/test_pipeline.py` | 191 assertions: all five stages, the gate, the trace, the war-room, the counterfactual arbiter, the line shift, the RAI shield, the hub, the retry policy, the xT/pitch-control invariants, the i18n atlas, the REST contract, the compliance audit |
| ARM | `python infra/validate_template.py` | JSON validity, ARM symbol resolution, dependency integrity, secret handling |
| Types | `cd frontend && npx tsc --noEmit` | The whole contract surface |
| Build | `npm run build` | Production compile |
| SSR | `npm run smoke` | In-process server render, runtime config injection, no SSR error |
| Logic | `npm run check:logic` | 37 headless assertions over the browser twin, the sandbox, the ledger, the dossier and the DVR buffer |
| UI render | `npm run smoke:ui` | 30 assertions — every judge-facing surface renders without throwing |

The backend suite also runs the **Official Rules compliance audit** — synthetic
metadata, deterministic replay, Stage A–E payload keys, zero third-party brand
strings, zero external media references, encoding hygiene and ARM validity.
