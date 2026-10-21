# Autonomous Improvement Backlog
Last Updated: 2026-10-21T22:03:15Z
Was Updated: 2026-10-22T00:00:00Z

Scope: AETHER PITCH (Premier League × Azure "Inside the Game" hackathon).
Branch: `overnight-auto-improve` (never merge to `main` without review).
Verification gate (all must pass before a commit):
`python backend/test_pipeline.py` · `python infra/validate_template.py` ·
`cd frontend && npx tsc --noEmit` · `npm run build` · `npm run smoke` · `npm run check:logic`

## Pending Tasks
- [x] [Track C] Replace the `any` casts in `frontend/scripts/logic-check.ts` with typed helpers so the logic suite is type-safe rather than `any`-driven
- [ ] [Track C] `frontend/src/lib/types.ts` has drifted to 825 lines of mixed contracts — split the v6.x payload types into a dedicated `types/spatial.ts` and re-export from the barrel so imports stay stable
- [ ] [Track C] Tighten `backend/main.py` typing: `Dict[str, Any]` responses are unchecked — add `TypedDict` shapes for the audit and counterfactual payloads
- [ ] [Track E] Split the 1,623-line `frontend/src/lib/edgeEngine.ts` into `edgeEngine/` (simulation, math, war-room, bio-load) with a barrel re-export so imports stay stable
- [ ] [Track E] Split the 1,408-line `backend/stage_c_foundry_agents.py` — extract the war-room, counterfactual arbiter and RAI shield into focused modules
- [ ] [Track E] Split the 1,301-line `backend/main.py` — extract the counterfactual, war-room and compliance routers into a `routers/` package
- [ ] [Track F] Add a `CONTRIBUTING.md` describing the verification gate, the branch policy and the compliance rules contributors must not break

## In Progress
- None

## Completed
- [x] [Track B] Extend the frontend logic checks to cover the `judgeCard` / `telemetry` history cap and the `DVR` scrub clamping
  - files: frontend/scripts/logic-check.ts, backend/test_pipeline.py
  - note: Added 6 DVR buffer invariants (150-frame cap, offset clamping, chronological order, pause anchoring, pass-link bound) and a Stage A / browser-twin PASS event contract parity check
- [x] [Track D] `PlayerAvatar3D` allocates `new THREE.Plane` / `Vector3` refs per avatar; hoist the shared ground plane to a module constant
  - files: frontend/src/components/three/PlayerAvatar3D.tsx
  - note: Hoisted the immutable ground plane and the drag scratch vector to module scope — 22 avatars no longer each allocate their own
- [x] [Track A] `Stage C` `_chat()` retry loop re-sends the same request on 429/5xx without honouring `Retry-After`, and a 4xx is retried once unnecessarily
  - files: backend/stage_c_foundry_agents.py, backend/test_pipeline.py
  - note: Honour Retry-After (delta-seconds or HTTP-date, capped at 5s) and fail fast on non-retryable 4xx — a bad key or bad request no longer costs a second round trip. 4 new assertions
- [x] [Track F] Add `docs/ARCHITECTURE.md` — module map, data flow, the five stages, and the four resilience layers
  - files: docs/ARCHITECTURE.md
  - note: Module map, data flow, the five stages, the four resilience layers, the sandbox, the verification matrix
- [x] [Track F] Document the runtime configuration contract (server-side per-request resolution) in a dedicated `docs/RUNTIME_CONFIG.md` and link it from the README
  - files: docs/RUNTIME_CONFIG.md
  - note: Explains why NEXT_PUBLIC_* breaks container deploys and how the studio hydrates coordinates server-side per request
- [x] [Track A] `useResilientMatchEngine` drill timers are not cleared when a second drill is requested mid-outage, allowing two overlapping drills to fight over `failoverDrillState` **[RE-CHECKED: the `drill.active` guard already rejects a concurrent drill and the timers are cleared on unmount — no defect; folded into the hub resilience work instead]**
  - files: n/a
  - note: DONE — re-checked, the drill.active guard already prevents overlap; the timers are cleared on unmount
- [x] [Track A] `StadiumEnvironment3D` builds instanced crowd/star geometry in `useMemo` without disposal — add the same unmount cleanup
  - files: frontend/src/components/three/StadiumEnvironment3D.tsx
  - note: DONE — the CanvasTexture is now disposed via useDisposable
- [x] [Track D] `edgeEngine.computePitchControlSplit` and `centralUsableCells` both scan 192 cells × 22 players; cache the player projection so the sandbox slider does not pay for two full scans per frame
  - files: backend/stage_b_math_engine.py, frontend/src/lib/edgeEngine.ts
  - note: DONE — vectorised both engines instead (8.3x Python, 2.4x TS) with permanent parity tests
- [x] [Track D] `backend/stage_b_math_engine.snapshot()` recomputes `pitch_control_split`, `passing_network_edges` and `bio_load_summary` on every call, and `snapshot` is called per insight — memoise the expensive per-state derivations on a state fingerprint
  - files: backend/stage_b_math_engine.py, frontend/src/lib/edgeEngine.ts
  - note: Vectorised the 192-cell x 22-player territory attribution with NumPy in Python and a flat typed-array pass in TS. Python snapshot 7.18ms -> 2.16ms, pitch_control_split 6.5ms -> 0.78ms (8.3x), TS 0.068ms -> 0.028ms (2.4x). Both verified byte-identical against the scalar reference, and the parity checks are now permanent tests
- [x] [Track B] Add Python tests for `TacticalMathEngine._convex_hull_area` degenerate inputs (0, 1, 2 and collinear points) and `central_usable_cells` with an empty squad
  - files: backend/test_pipeline.py
  - note: same commit
- [x] [Track B] Add Python tests for `Personalizer.normalize_preferences` rejecting every invalid enum value, including the new `cognitive_density`
  - files: backend/test_pipeline.py
  - note: same commit
- [x] [Track B] Add Python tests for `FoundryRouter._parse_agent_json` (malformed / fenced / non-dict payloads) and for the `content_safety` error branch
  - files: backend/test_pipeline.py
  - note: 13 assertions: agent JSON boundary parser, preference normalisation fallbacks, convex hull edge cases
- [x] [Track A] `backend/main.py` `match_loop` mutates module globals (`last_state`, `last_metrics`, `last_ghost`) without a lock while REST handlers read them concurrently — a torn read can pair a state from tick N with metrics from tick N+1
  - files: backend/main.py, backend/test_pipeline.py
  - note: Replaced last_state/last_metrics with an atomically published LIVE (state, metrics) pair — a REST reader can no longer pair a clock from tick N with metrics from tick N-1
- [x] [Track A] `hub.broadcast()` in `backend/main.py` swallows per-client send failures one client at a time but never removes a dead socket from `hub.clients` — add dead-peer pruning so a dropped judge browser cannot leak a slot
  - files: backend/main.py
  - note: Replaced the awaited sequential send with per-client bounded queues + writer tasks: broadcast now returns in 0.0ms instead of 5000ms; slow peers drop frames and are pruned
- [x] [Track A] `PlayerAvatar3D` / `Telestrator3DOverlays` / `TacticalOverlays3D` create THREE geometries in `useMemo` that are never disposed on unmount — add a cleanup effect so React StrictMode double-mount does not leak GPU memory
  - files: frontend/src/components/three/useDisposable.ts + 4 overlay components
  - note: Added useDisposable/dispose3D; geometries, materials and CanvasTexture now released on unmount and on dep change
- [x] [Track B] Headless frontend logic test suite (21 checks, zero dependencies) — `frontend/scripts/logic-check.ts` + `npm run check:logic`
- [x] [Track E] Extract dossier serialization out of the recap modal into a testable module `frontend/src/lib/dossier.ts`
- [x] [Track A] Harden `computeBioLoadProfile` against missing numeric fields (it threw on an absent `pressSeconds`)

## Blocked / Failed
- None
