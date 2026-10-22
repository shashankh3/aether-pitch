# Contributing to AETHER PITCH

## The verification gate

Every change must leave all eight checks green. They run in about a minute:

```bash
# 1. Backend pipeline, multi-agent, counterfactual and compliance assertions
python backend/test_pipeline.py

# 2. Azure ARM template validity (no subscription needed)
python infra/validate_template.py

# 3. Documentation lint — every number, endpoint and script in the docs is true
python tools/doc_lint.py

#    If it fails on a stale figure, fix it from the measurement rather than by
#    hand:  python tools/sync_docs.py
#    (--check reports what would change without writing)

# 4. Type safety across the whole contract surface
cd frontend && npx tsc --noEmit

# 5. Production build
npm run build

# 6. Server-rendered smoke test (boots the production server in-process)
npm run smoke

# 7. Headless browser-side logic checks (Stage B twin, sandbox, ledger, dossier)
npm run check:logic

# 8. Judge-facing surfaces all render without throwing
npm run smoke:ui
```

Or in one line, from `frontend/`:

```bash
npm run verify      # build + smoke + check:logic + smoke:ui
```

**A commit that breaks any of these is not ready.** If a change genuinely
cannot satisfy a check, the change is wrong — fix the change, not the check.

## Branch policy

- `main` is the submission branch. It is pushed only when the whole gate is
  green and the change is a coherent, verified unit.
- Feature work branches from `main` and merges back with a squash commit.
- The autonomous improvement branch is `overnight-auto-improve`; it is never
  merged without a human reading the diff.

## Ground rules that are not negotiable

These are enforced by the compliance audit in `backend/test_pipeline.py`, not
by review:

1. **No external video, audio or image assets.** The live broadcast feed is
   `frontend/src/components/three/HoloPitch3D.tsx` — a procedurally generated
   stadium rendered from synthetic telemetry. The compliance audit scans every
   shipped source file for media references and fails the build if it finds
   one.
2. **Only synthetic entities.** NLA (North Larchmont Athletic), MCS (Meridian
   City SC), the AETHER Synthetic League and the AETHER 3D DIGITAL TWIN.
   The audit scans for real-world leagues, clubs, kit brands, broadcasters and
   social platforms in UI code.
3. **No hidden data pipeline.** Every number rendered on screen is computed
   by the Stage A/B code in this repository, or is explicitly labelled as a
   model narrative. If you add a metric, it must be reproducible from the
   simulation.
4. **Determinism.** `seed=42` must replay identically. The audit verifies
   this on every run.
5. **Every backend feature needs a browser twin.** If you add a deterministic
   model in `backend/`, add the matching implementation in
   `frontend/src/lib/edgeEngine.ts` **and** a parity check. The two engines
   are proven byte-identical, not merely similar.
6. **Zero-config offline.** No new Azure service may be a hard requirement.
   Every cloud call needs a deterministic local fallback that produces the
   identical schema.

## Adding a Stage B metric

1. Implement it in `backend/stage_b_math_engine.py` with a docstring stating
   the formula.
2. Mirror it in `frontend/src/lib/edgeEngine.ts` — same function name, same
   signature, same arithmetic.
3. Add a parity assertion to both suites:

   ```python
   # backend/test_pipeline.py
   check("Stage b: my_metric matches the scalar reference", ...)
   ```

   ```ts
   // frontend/scripts/logic-check.ts
   check("the browser twin equals the scalar reference", ...);
   ```

4. If the metric belongs in the live tick, add it to `snapshot()`; if it is
   derived, add it to `bio_load_summary()` or a dedicated helper.
5. If the metric can be expensive, memoise it. `snapshot()` is called at 10 Hz
   and used to cost 7 ms; it now costs 2 ms.

## Adding a Foundry agent

1. Give the agent its own entry in `WAR_ROOM_AGENTS` (or a sibling roster)
   with a system prompt, a deployment tier, a tool bundle and a JSON contract.
2. Give it **its own tools** — the Stage B functions it is allowed to read.
   Agents never invent numbers; they read them from the deterministic engine.
3. If the agent reads prior turns, the orchestration must pass them
   explicitly. A single model call that role-plays three agents is not a
   multi-agent system, and the reviewer will say so.
4. Add an assertion that the agent is a separate call with its own tools.

## Style

- Python: 4-space indent, type hints on public functions, docstrings that
  state the *formula* rather than restating the name.
- TypeScript: no `any` in shipped code; `unknown` plus a narrowing check when
  a payload really is untrusted.
- Comments explain **why**, not what. A comment that restates the line below
  it is noise.
- Every user-visible string is a constant, not an inline literal scattered
  across components.

## Reporting an issue

Include the failing check's output, the command you ran, and whether the
backend, the browser twin or both are affected. If the two engines disagree,
that is always a bug — please report it as such.

## Unattended runs (the overnight loop)

`scripts/overnight-watchdog.ps1` (Windows) and `scripts/overnight-watchdog.sh`
(macOS/Linux) re-launch `opencode run` against `overnight_prompt.md` until a
wall-clock window closes.

**Cost rule: unattended runs may only use free-tier models.** Both scripts
enforce this with a hard allowlist (`$AllowedModelPrefixes` /
`ALLOWED_PREFIXES`). Any provider that bills - Fireworks, paid OpenRouter,
Azure OpenAI - is *refused before a request is made*, and the loop exits with
code 2. An unattended run can never spend the owner's credit by accident.
To use a paid provider you must edit the allowlist deliberately.

Operational notes:

- The brief is inlined into the **user message**, not attached with `--file`.
  An attached file arrives as file/tool-output content, which a model correctly
  treats as untrusted and then refuses to act on.
- The loop aborts after 5 consecutive failed iterations rather than spinning.
- Drop a `STOP_OVERNIGHT` file in the repo root to stop it cleanly.
- Progress: `logs/overnight/overnight_status.json`, `overnight_iterations.jsonl`,
  and one `iter-*.log` per iteration.
