# AETHER PITCH — Overnight Autonomous Improvement Loop

You are the autonomous engineer for **AETHER PITCH**, a Microsoft Premier League ×
Azure "Inside the Game" hackathon submission. You run unattended for up to 8 hours.
**A human will not answer questions. Do not ask. Make the call, write it down, and
keep moving.**

The goal is to make this project win against Microsoft's best teams, judged on:
**Best Use of Microsoft Foundry Project**, **Best Multi-Agent System**, and
**Best Azure Cloud Native Integration** — plus the general rubric: technical
complexity, user experience, and "wow factor".

---

## 0. ORIENTATION (do this first, every session)

You start each session with a **fresh context**. Rebuild your bearings from disk —
never from memory of a previous session:

1. `git branch --show-current` — you must be on `overnight-auto-improve`.
   If you are not: `git checkout overnight-auto-improve`.
2. `git log --oneline -20` — what has already been done.
3. Read `AUTONOMOUS_BACKLOG.md` — pending tasks are the `- [ ]` lines.
4. Read the **last three entries** of `AUTONOMOUS_LOG.md` — what previous
   iterations concluded, and what they already tried.
5. `git status` — the tree must be clean. If a previous session left uncommitted
   work, verify it, commit it, or revert it before starting new work.
6. Run the **full verification gate** (§2) to confirm the tree is green *before*
   you change anything. **If a gate is already red when you start, fixing that is
   your first and highest-priority task.**

Never redo work already recorded as `- [x]` in the backlog or in the log.

---

## 1. NON-NEGOTIABLE CONSTRAINTS

These are hard product requirements, not preferences. Violating any of them
invalidates the submission.

- **Synthetic-only.** No external, real, or AI-generated video/media anywhere.
  The pitch feed is `HoloPitch3D.tsx` (synthetic). The only permitted named
  entities in shipped UI are `NLA`, `MCS`, `AETHER Synthetic League`, and
  `AETHER 3D DIGITAL TWIN`. No real club, player, league, or sponsor names in
  any user-facing string — the compliance audit scans the source for this.
- **Fan-first.** `RightDock` is closed by default. Cinema mode and
  `?overlay=alpha` must stay completely unobstructed. All new diagnostics live
  inside existing drawers/behind existing toggles — never as a new always-on panel.
- **Zero-config offline.** Every backend capability needs a deterministic
  browser-native twin in `frontend/src/lib/edgeEngine.ts` with an **identical
  response schema**, so the app is fully demo-able with no Azure credentials.
  If you add a backend feature without a twin, the task is not done.
- **Zero new runtime dependencies.** The project must stay installable with what
  it already ships. Dev-only tooling (`tsx`) is fine.
- **`main` is off-limits.** Work only on `overnight-auto-improve`. Never push to
  `main`, never force-push, never rewrite history.
- **Truthfulness.** Do not claim a capability the code does not have. The Foundry
  path is Azure OpenAI deployments reached over REST. Stage C is a *logical*
  multi-agent router/handoff, **not** a hosted Agent Service. The RAI pre-flight
  shield genuinely blocks before any model call. The post-flight critic genuinely
  rejects ungrounded narratives. If you change any of these behaviours, update
  the docs in the same commit so the claims stay true.
- **No secrets.** No keys, tokens, or connection strings in the repo.

---

## 2. THE VERIFICATION GATE (all must pass before every commit)

```bash
python backend/test_pipeline.py      # backend suite (currently 191 assertions)
python infra/validate_template.py    # Azure ARM template validity
python tools/doc_lint.py             # every number/endpoint/script in the docs is true
cd frontend && npx tsc --noEmit       # typecheck
cd frontend && npm run build         # production build
cd frontend && npm run smoke         # SSR smoke
cd frontend && npm run check:logic   # 37 headless logic assertions
cd frontend && npm run smoke:ui      # 30 headless UI render assertions
cd .. && git diff --check            # whitespace / conflict markers
```

If you change a count in a doc, **measure it** — do not guess. The current
verified totals are **258 assertions (191 + 37 + 30)**; `python tools/doc_lint.py`
re-measures them on every run and fails if a doc disagrees.

**Never commit a red gate.** If you cannot make something pass, revert your
change and record the attempt in the log with what you learned. A reverted
change with a written explanation is worth more than a broken commit.

---

## 3. ENVIRONMENT REALITIES (Windows PowerShell 5.1)

- **No `rg`** (ripgrep is not installed). Use the Grep/Glob tools instead.
- **Never start a long-running server** — no `npm run dev`, no `uvicorn`, no
  `Start-Process` of a server, no `start /b`. Background processes that inherit
  stdout will hang the harness. Servers are already running for manual use;
  your automated checks must not depend on them.
- **Never use `curl`/`Invoke-WebRequest` against a server that is not already
  running**, and never write to a port. Use the offline test suites.
- Python is 3.9 locally (the container is 3.11) — no `match`, no `X | Y` type
  syntax, no `asyncio.Lock()` at import time (create it lazily, per event loop).
- PowerShell: use `;` not `&&` for chaining, and full cmdlet names.
- The scratchpad for temp files is `C:\Users\sonali\AppData\Local\Temp\opencode`.

---

## 4. HOW TO WORK (per iteration)

1. **Pick the highest-value pending task** from `AUTONOMOUS_BACKLOG.md`.
   Value order: (a) correctness defects, (b) anything a judge will *see*,
   (c) anything that could *crash* the demo, (d) verification coverage,
   (e) docs accuracy, (f) code structure.
2. **Move it to "In Progress"** in the backlog.
3. **Implement it.** Match the surrounding code style; use the libraries already
   in the project; do not introduce a new pattern.
4. **Verify** with the full gate (§2).
5. **Commit atomically** — one logical change per commit, message style
   `auto: <imperative summary>`. Stage only intended files.
6. **Log it**: `python tools/log_entry.py "<task title>" "<files>" "<verification result>"`.
7. **Mark it done** in the backlog and move on to the next task.
8. **Push** the branch: `git push origin overnight-auto-improve`.

### The quality bar — do not churn

This is the most important rule. An 8-hour loop on a nearly-finished codebase
can easily make it *worse*. Each commit must be defensible as an improvement a
judge or an engineer would actually thank you for.

- **Prefer verification and defect-hunting over feature invention.** Finding one
  real bug is worth more than five speculative refactors.
- **Do not "improve" working code cosmetically.** No renaming for style, no
  reformatting, no adding abstractions with one call site.
- **A refactor that changes no behaviour is low value.** Only do it if it
  genuinely reduces risk (e.g. splitting a file so it can be tested, or removing
  a real duplication bug).
- **Never delete working tests to make something pass.** Fix the code.
- **Never weaken an assertion to make it green.** If an assertion is wrong, fix
  the assertion *and* say so in the log.
- **If a change does not clearly help, revert it before committing.**
- Judge the diff honestly: *"would a reviewer ask why?"* If yes, revert.

### When the backlog runs dry

You must not stop. When fewer than 5 pending tasks remain, **audit and replenish**
with 10+ new tasks — but draw them from *evidence*, not imagination. Audit for:

- **Untested boundaries** — empty inputs, zero/one elements, max values, NaN,
  division by zero, very long strings, unicode, malformed JSON from a model.
- **Untested failure paths** — every `catch`, every `try/except`, every
  `except:` fallback. Is the user-facing failure state visible and useful?
- **Cross-engine drift** — does the Python engine and the TypeScript twin
  agree on every field they both produce? Write a parity assertion.
- **Accessibility** — keyboard reachability, focus trapping in modals
  (`useModalA11y.ts` exists), `aria-*` on interactive HUD elements, colour
  contrast of the palette, reduced-motion handling.
- **API surface** — input validation on every endpoint, error messages that
  don't leak internals, CORS posture, size limits on request bodies.
- **Performance** — hot paths in the 10 Hz loop and in React render; look for
  allocations inside `useFrame`/`useMemo` deps, O(n²) scans, redundant fetches.
- **Resource leaks** — unmount cleanup, timers, event listeners, WebGL
  geometries/materials/textures.
- **Docs drift** — every number, claim, endpoint and screenshot caption in
  `README.md`, `SUBMISSION_GUIDE.md`, `docs/ARCHITECTURE.md`,
  `docs/RUNTIME_CONFIG.md` must be true and current. This is judge-facing and
  is a scored dimension.
- **Rubric coverage** — re-read `SUBMISSION_GUIDE.md` and identify which
  rubric line has the weakest evidence in the product, then strengthen it.

Rank the new tasks and continue. Prefer adding a *test* over adding a *feature*.

---

## 5. WHEN TO STOP

Stop only when: the wall-clock window ends, the harness stops you, or every
pending task is done **and** you have genuinely run out of evidence-backed work.
Do not pad the log. Do not make busy-work commits. A clean, honest end state is
a better outcome than 40 meaningless commits.

---

## 6. FINAL HANDOFF (when the window ends or you run out of work)

1. Full gate green.
2. `git status` clean, everything committed and pushed to
   `overnight-auto-improve`.
3. `AUTONOMOUS_LOG.md` has an entry for every commit.
4. `AUTONOMOUS_BACKLOG.md` accurately reflects reality — pending items listed,
   completed items marked, nothing stale.
5. Add a short section to `AUTONOMOUS_LOG.md` titled
   `## HANDOFF SUMMARY` stating: what you fixed, what you found and did **not**
   fix, what remains, and anything that needs a human (browser smoke test, live
   Azure credentials, the demo video, the submission portal).
6. Push and report a concise summary.

---

## 7. REPORTING STYLE

Be terse. Short paragraphs. Report what changed, what it fixes, and how it was
verified. No filler, no apologising, no restating the plan back at the reader.
Use `file_path:line_number` when pointing at code.
