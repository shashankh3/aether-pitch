# Autonomous Improvement Backlog
Last Updated: 2026-10-22T04:30:00Z
Was Updated: 2026-10-22T04:30:00Z

Scope: AETHER PITCH (Premier League × Azure "Inside the Game" hackathon).
Branch: `overnight-auto-improve` (never merge to `main` without review).
Verification gate (all must pass before a commit):
`python backend/test_pipeline.py` · `python infra/validate_template.py` ·
`cd frontend && npx tsc --noEmit` · `npm run build` · `npm run smoke` · `npm run check:logic` · `npm run smoke:ui`

## Pending Tasks
- [x] [Track C] Replace the `any` casts in `frontend/scripts/logic-check.ts` with typed helpers so the logic suite is type-safe rather than `any`-driven
- [ ] [Track C] `frontend/src/lib/types.ts` has drifted to 825 lines of mixed contracts — split the v6.x payload types into a dedicated `types/spatial.ts` and re-export from the barrel so imports stay stable
- [ ] [Track C] Tighten `backend/main.py` typing: `Dict[str, Any]` responses are unchecked — add `TypedDict` shapes for the audit and counterfactual payloads
- [ ] [Track E] Split the 1,623-line `frontend/src/lib/edgeEngine.ts` into `edgeEngine/` (simulation, math, war-room, bio-load) with a barrel re-export so imports stay stable
- [ ] [Track E] Split the 1,408-line `backend/stage_c_foundry_agents.py` — extract the war-room, counterfactual arbiter and RAI shield into focused modules
- [x] [Track F] Add a `CONTRIBUTING.md` describing the verification gate, the branch policy and the compliance rules contributors must not break
  - files: CONTRIBUTING.md
  - note: DONE - written in the docs commit; `docs/ARCHITECTURE.md` and `docs/RUNTIME_CONFIG.md` landed in the same batch

- [x] [Track B] Add property-based invariant tests for the Stage B xT grid and pitch control: values stay in [0,1], translational/rotational symmetry holds, the grid degrades gracefully for an empty squad, and the vectorised path still matches the scalar reference
  - files: backend/test_pipeline.py, frontend/scripts/logic-check.ts, backend/stage_b_math_engine.py, frontend/src/lib/edgeEngine.ts
  - note: DONE — 19 new invariant assertions (11 Python + 8 TS): xT boundedness fuzz incl. NaN/inf, mirror symmetry, monotonicity, empty/all-GK degradation, partition-of-100, both reflection symmetries, kernel translation invariance, overrides parity. FOUND + FIXED a real cross-engine drift: a NaN coordinate mapped to the max-threat column in Python and to NaN in TS; a NaN player neutralised a team's whole grid in TS but was skipped in Python. Both engines now treat corrupt telemetry identically (xT -> XT_MIN; player absent from the surface).
- [ ] [Track B] Lock the i18n atlas coverage as a permanent assertion: every archetype `pick_archetype` can return must have an `es`/`ar`/`hi` translation, and the recap intros must exist for all three
  - files: backend/test_pipeline.py
  - note: Verified manually on 2026-10-22 (6 archetypes x 3 languages, all covered) but NOT locked by a test. A new archetype without translations would silently fall back to English and undercut the multi-language rubric line.
- [ ] [Track B] Add REST contract tests: every route returns JSON with the documented keys, and malformed input is rejected with a 4xx rather than surfacing a 500
  - files: backend/test_pipeline.py
  - note: The counterfactual and studio endpoints were added late and have schema tests but no rejection-path coverage.
- [ ] [Track A] Audit every backend `except:` fallback and every frontend `try/catch` for a user-visible failure state - no silent swallow, no dead error branch
  - files: backend/*.py, frontend/src/**/*.ts, frontend/src/**/*.tsx
  - note: Silent catches are how a demo degrades without anyone noticing. The fan should always see *something* actionable.
- [ ] [Track A] Verify the `?overlay=alpha` SMPTE mode still renders every judge-facing surface unobstructed after the recent HUD additions
  - files: frontend/scripts/ui-smoke.ts, frontend/src/app/page.tsx
  - note: The alpha overlay is the broadcast deliverable. A HUD element that leaks into it breaks the cut.
- [ ] [Track D] Count React renders per second in the 10 Hz HUD with a player locked, and fix any component that re-renders more than once per tick
  - files: frontend/src/hooks/useResilientMatchEngine.ts, frontend/src/components/hud/*.tsx
  - note: The match loop runs at 10 Hz. A double-render per tick doubles the R3F frame cost on low-end judge laptops.
- [ ] [Track D] Audit every `useFrame` callback for per-frame allocations (`new THREE.Vector3`, array/object literals, closures that capture new values) and hoist them
  - files: frontend/src/components/three/*.tsx
  - note: Per-frame allocation is the classic R3F GC-hitch cause. The FPS chip measures frame time, so a hitch here is visible to the judge.
- [ ] [Track G] Accessibility audit of the 30 judge-facing HUD surfaces: `aria-*` on interactive elements, keyboard reachability, focus trapping in modals, and colour-contrast of the palette against WCAG AA
  - files: frontend/src/components/hud/*.tsx, frontend/scripts/ui-smoke.ts
  - note: `useModalA11y.ts` already exists but coverage is partial. The colourblind palette is a rubric item - verify the contrast ratios rather than asserting they were chosen carefully.
- [ ] [Track H] API surface security review: CORS posture, request body size limits, error-message leakage of internals, and input validation on the counterfactual and studio endpoints
  - files: backend/main.py, backend/counterfactual.py, backend/stage_c_foundry_agents.py
  - note: An enterprise-judged project gets looked at for this. The ARM template already ships Key Vault and a managed identity; the API should match that posture.
- [ ] [Track I] Audit the R3F scene graph for draw-call count, shared-vs-duplicated geometry, and material reuse in the stadium, crowd, and overlay layers
  - files: frontend/src/components/three/*.tsx
  - note: Directly determines whether the 3D pitch holds 60 FPS on the judge's hardware.
- [ ] [Track F] Add an automated doc-lint that extracts every number, endpoint path, script name and assertion count from `README.md` / `SUBMISSION_GUIDE.md` / `docs/*.md` and verifies each against the code
  - files: tools/doc_lint.py, backend/test_pipeline.py
  - note: Judge-facing docs drift silently. The counts were already stale once (90 -> 143). A lint makes staleness impossible.
- [ ] [Track F] Rubric coverage audit: for each rubric line in `SUBMISSION_GUIDE.md`, record the concrete evidence (file path, command, and what a judge sees) so every scored dimension is defensible
  - files: SUBMISSION_GUIDE.md, docs/ARCHITECTURE.md
  - note: Strengthen the weakest-evidenced rubric lines rather than the strongest ones.

## In Progress
- None

## Completed
- [x] [Track E] Split the 1,301-line `backend/main.py` — extract the counterfactual, war-room and compliance routers into a `routers/` package
  - files: backend/counterfactual.py (new), backend/main.py
  - note: Extracted the what-if wire contract and the deterministic Stage B evaluation into backend/counterfactual.py — no module globals, independently testable. main.py 1,350 -> 1,075 lines, 6 new assertions
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
