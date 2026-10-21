# Autonomous Improvement Backlog
Last Updated: 2026-10-21T21:00:32Z
Was Updated: 2026-10-22T00:00:00Z

Scope: AETHER PITCH (Premier League × Azure "Inside the Game" hackathon).
Branch: `overnight-auto-improve` (never merge to `main` without review).
Verification gate (all must pass before a commit):
`python backend/test_pipeline.py` · `python infra/validate_template.py` ·
`cd frontend && npx tsc --noEmit` · `npm run build` · `npm run smoke` · `npm run check:logic`

## Pending Tasks
- [ ] [Track A] `StadiumEnvironment3D` builds instanced crowd/star geometry in `useMemo` without disposal — add the same unmount cleanup
- [ ] [Track A] `useResilientMatchEngine` drill timers are not cleared when a second drill is requested mid-outage, allowing two overlapping drills to fight over `failoverDrillState` **[RE-CHECKED: the `drill.active` guard already rejects a concurrent drill and the timers are cleared on unmount — no defect; folded into the hub resilience work instead]**
- [ ] [Track A] `Stage C` `_chat()` retry loop re-sends the same request on 429/5xx without honouring `Retry-After`, and a 4xx is retried once unnecessarily
- [ ] [Track B] Add Python tests for `FoundryRouter._parse_agent_json` (malformed / fenced / non-dict payloads) and for the `content_safety` error branch
- [ ] [Track B] Add Python tests for `Personalizer.normalize_preferences` rejecting every invalid enum value, including the new `cognitive_density`
- [ ] [Track B] Add Python tests for `TacticalMathEngine._convex_hull_area` degenerate inputs (0, 1, 2 and collinear points) and `central_usable_cells` with an empty squad
- [ ] [Track B] Extend the frontend logic checks to cover the `judgeCard` / `telemetry` history cap and the `DVR` scrub clamping
- [ ] [Track C] Replace the `any` casts in `frontend/scripts/logic-check.ts` with typed helpers so the logic suite is type-safe rather than `any`-driven
- [ ] [Track C] `frontend/src/lib/types.ts` has drifted to 825 lines of mixed contracts — split the v6.x payload types into a dedicated `types/spatial.ts` and re-export from the barrel so imports stay stable
- [ ] [Track C] Tighten `backend/main.py` typing: `Dict[str, Any]` responses are unchecked — add `TypedDict` shapes for the audit and counterfactual payloads
- [ ] [Track D] `edgeEngine.computePitchControlSplit` and `centralUsableCells` both scan 192 cells × 22 players; cache the player projection so the sandbox slider does not pay for two full scans per frame
- [ ] [Track D] `backend/stage_b_math_engine.snapshot()` recomputes `pitch_control_split`, `passing_network_edges` and `bio_load_summary` on every call, and `snapshot` is called per insight — memoise the expensive per-state derivations on a state fingerprint
- [ ] [Track D] `PlayerAvatar3D` allocates `new THREE.Plane` / `Vector3` refs per avatar; hoist the shared ground plane to a module constant
- [ ] [Track E] Split the 1,623-line `frontend/src/lib/edgeEngine.ts` into `edgeEngine/` (simulation, math, war-room, bio-load) with a barrel re-export so imports stay stable
- [ ] [Track E] Split the 1,408-line `backend/stage_c_foundry_agents.py` — extract the war-room, counterfactual arbiter and RAI shield into focused modules
- [ ] [Track E] Split the 1,301-line `backend/main.py` — extract the counterfactual, war-room and compliance routers into a `routers/` package
- [ ] [Track F] Document the runtime configuration contract (server-side per-request resolution) in a dedicated `docs/RUNTIME_CONFIG.md` and link it from the README
- [ ] [Track F] Add `docs/ARCHITECTURE.md` — module map, data flow, the five stages, and the four resilience layers
- [ ] [Track F] Add a `CONTRIBUTING.md` describing the verification gate, the branch policy and the compliance rules contributors must not break

## In Progress
- None

## Completed
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
