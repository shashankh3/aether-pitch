"""Doc-lint: prove every judge-facing claim in the docs against the code.

Judge-facing documentation drifts silently. An assertion count, an endpoint
path, a module size or a script name goes stale and nobody notices until a
judge reads the wrong number. This lint extracts those claims from
``README.md``, ``SUBMISSION_GUIDE.md`` and ``docs/*.md`` and checks every one
of them against the repository.

It is deliberately offline and dependency-free: the only thing it runs is the
three headless suites, whose own result lines carry the live assertion
counts.

Run:  python tools/doc_lint.py
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

DOC_FILES = [
    "README.md",
    "SUBMISSION_GUIDE.md",
    "CONTRIBUTING.md",
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/RUNTIME_CONFIG.md",
]

failures: list = []
notes: list = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))
    if not cond:
        failures.append(name)
    return bool(cond)


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def docs_text() -> dict:
    return {rel: read(rel) for rel in DOC_FILES}


def run_suite(cmd, cwd) -> tuple:
    """Run a suite, return (returncode, combined output)."""
    try:
        proc = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True,
            timeout=600, shell=False)
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, f"{type(exc).__name__}: {exc}"
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


PACKAGE_PATHS = {
    "backend/stage_c_foundry_agents.py": "backend/agents",
    "frontend/src/lib/edgeEngine.ts": "frontend/src/lib/edgeEngine",
    "frontend/src/lib/types.ts": "frontend/src/lib/types",
}


def line_count(path: pathlib.Path) -> int:
    return len(path.read_text(encoding="utf-8", errors="replace").splitlines())


def module_lines(rel: str) -> int:
    """LOC in a stable barrel plus every module in its implementation package."""
    path = ROOT / rel
    total = line_count(path)
    folder = ROOT / PACKAGE_PATHS[rel]
    for module in sorted(folder.rglob("*")):
        if module.is_file() and module.suffix in (".py", ".ts"):
            total += line_count(module)
    return total


def loc_drift(stated: int, actual: int) -> int:
    """How far a stated LOC figure is from the measured one, in lines."""
    return stated - actual


def loc_acceptable(stated: int, actual: int) -> bool:
    """A module-map size is an approximate figure: 5% drift is tolerable."""
    if stated == actual:
        return True
    return abs(stated - actual) <= max(10, int(actual * 0.05))


# ---------------------------------------------------------------------------
# 1. The live assertion counts
# ---------------------------------------------------------------------------

def measure_suites() -> dict:
    """Run the three headless suites and read their assertion counts."""
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    measured = {}

    code, out = run_suite([sys.executable, "backend/test_pipeline.py"], ROOT)
    m = re.search(r"RESULT: ALL (\d+) PIPELINE TESTS PASSED", out)
    measured["backend"] = int(m.group(1)) if m else None
    measured["backend_ok"] = code == 0 and measured["backend"] is not None
    m = re.search(r"(\d+) files scanned", out)
    measured["scanned_files"] = int(m.group(1)) if m else None
    if not measured["backend_ok"]:
        notes.append(f"backend suite did not report a count (exit {code})")

    if npm:
        code, out = run_suite([npm, "run", "--silent", "check:logic"], FRONTEND)
        m = re.search(r"RESULT: ALL (\d+) FRONTEND LOGIC CHECKS PASSED", out)
        measured["logic"] = int(m.group(1)) if m else None
        measured["logic_ok"] = code == 0 and measured["logic"] is not None

        code, out = run_suite([npm, "run", "--silent", "smoke:ui"], FRONTEND)
        m = re.search(r"RESULT: ALL (\d+) COMPONENT RENDER CHECKS PASSED", out)
        measured["ui"] = int(m.group(1)) if m else None
        measured["ui_ok"] = code == 0 and measured["ui"] is not None
    else:
        measured["logic"] = measured["ui"] = None
        measured["logic_ok"] = measured["ui_ok"] = False
        notes.append("npm was not found on PATH")

    return measured


def check_counts(texts: dict, m: dict) -> None:
    backend, logic, ui = m.get("backend"), m.get("logic"), m.get("ui")
    if not (backend and logic and ui):
        check("the suites reported their live assertion counts", False,
              "a suite did not run cleanly")
        return
    total = backend + logic + ui

    readme = texts["README.md"]
    mm = re.search(
        r"\*\*(\d+) automated assertions\*\* \((\d+) backend . (\d+) headless logic "
        r". (\d+) headless UI render\)", readme)
    check("README states the live assertion counts",
          bool(mm) and (int(mm.group(1)), int(mm.group(2)),
                        int(mm.group(3)), int(mm.group(4)))
          == (total, backend, logic, ui),
          f"doc={mm.groups() if mm else None} live={(total, backend, logic, ui)}")

    sg = texts["SUBMISSION_GUIDE.md"]
    mm = re.search(r"the four suites make \*\*(\d+) automated assertions\*\*", sg)
    check("SUBMISSION_GUIDE states the live total",
          bool(mm) and int(mm.group(1)) == total,
          f"doc={mm.group(1) if mm else None} live={total}")

    mm = re.search(r"npm run check:logic\s+# (\d+) headless assertions", sg)
    check("SUBMISSION_GUIDE states the live logic count",
          bool(mm) and int(mm.group(1)) == logic,
          f"doc={mm.group(1) if mm else None} live={logic}")

    mm = re.search(r"npm run smoke:ui\s+# (\d+) assertions", sg)
    check("SUBMISSION_GUIDE states the live UI-render count",
          bool(mm) and int(mm.group(1)) == ui,
          f"doc={mm.group(1) if mm else None} live={ui}")

    mm = re.search(r"RESULT: ALL (\d+) FRONTEND LOGIC CHECKS PASSED", sg)
    check("SUBMISSION_GUIDE's expected-result block matches the live logic count",
          bool(mm) and int(mm.group(1)) == logic,
          f"doc={mm.group(1) if mm else None} live={logic}")

    mm = re.search(r"RESULT: ALL (\d+) COMPONENT RENDER CHECKS PASSED", sg)
    check("SUBMISSION_GUIDE's expected-result block matches the live UI count",
          bool(mm) and int(mm.group(1)) == ui,
          f"doc={mm.group(1) if mm else None} live={ui}")

    mm = re.search(r"RESULT: ALL (\d+) PIPELINE TESTS PASSED", sg)
    check("SUBMISSION_GUIDE's expected-result block matches the live backend count",
          bool(mm) and int(mm.group(1)) == backend,
          f"doc={mm.group(1) if mm else None} live={backend}")

    arch = texts["docs/ARCHITECTURE.md"]
    mm = re.search(r"\| Backend \| `python backend/test_pipeline\.py` \| (\d+) assertions",
                   arch)
    check("ARCHITECTURE states the live backend count",
          bool(mm) and int(mm.group(1)) == backend,
          f"doc={mm.group(1) if mm else None} live={backend}")

    mm = re.search(r"\| Logic \| `npm run check:logic` \| (\d+) headless assertions", arch)
    check("ARCHITECTURE states the live logic count",
          bool(mm) and int(mm.group(1)) == logic,
          f"doc={mm.group(1) if mm else None} live={logic}")

    mm = re.search(r"\| UI render \| `npm run smoke:ui` \| (\d+) assertions", arch)
    check("ARCHITECTURE states the live UI-render count",
          bool(mm) and int(mm.group(1)) == ui,
          f"doc={mm.group(1) if mm else None} live={ui}")

    mm = re.search(r"test_pipeline\.py\s+([\d,]+) LOC\s+(\d+) assertions", arch)
    check("the ARCHITECTURE module map states the live backend count",
          bool(mm) and int(mm.group(2)) == backend,
          f"doc={mm.group(2) if mm else None} live={backend}")

    # The compliance audit prints how many source files it scans.
    scanned = m.get("scanned_files")
    if scanned:
        mm = re.search(r"\((\d+) files scanned\)", readme)
        check("README states the live compliance-scan file count",
              bool(mm) and int(mm.group(1)) == scanned,
              f"doc={mm.group(1) if mm else None} live={scanned}")
        mm = re.search(r"scans (\d+) files with 0 offenders", sg)
        check("SUBMISSION_GUIDE states the live compliance-scan file count",
              bool(mm) and int(mm.group(1)) == scanned,
              f"doc={mm.group(1) if mm else None} live={scanned}")


# ---------------------------------------------------------------------------
# 2. The API surface
# ---------------------------------------------------------------------------

ROUTE_RE = re.compile(r'@app\.(?:get|post|put|delete|patch|websocket)\(\s*"([^"]+)"')


def real_routes() -> set:
    routes = set()
    for path in sorted((ROOT / "backend").glob("*.py")):
        for m in ROUTE_RE.finditer(path.read_text(encoding="utf-8")):
            routes.add(m.group(1))
    return routes


def path_matches(pattern: str, concrete: str) -> bool:
    """True when `concrete` is an instance of the route template `pattern`."""
    p, c = pattern.strip("/").split("/"), concrete.strip("/").split("/")
    if len(p) != len(c):
        return False
    for seg_p, seg_c in zip(p, c):
        if seg_p.startswith("{") and seg_p.endswith("}"):
            continue
        if seg_p != seg_c:
            return False
    return True


def check_endpoints(texts: dict) -> None:
    routes = real_routes()
    documented = set()
    for rel, text in texts.items():
        for m in re.finditer(r"/api/[A-Za-z0-9_\-{}/]*", text):
            token = m.group(0).rstrip("/")
            if token == "/api":
                continue
            documented.add(token)

    unmatched = sorted(
        p for p in documented
        if not any(path_matches(r, p) for r in routes))
    check("every /api path in the docs is a real backend route", not unmatched,
          ", ".join(unmatched))

    # The README is the canonical API reference: every route must appear there.
    readme_text = texts["README.md"]
    readme_paths = set(re.findall(r"/api/[A-Za-z0-9_\-{}/]*", readme_text))
    undocumented = []
    for r in sorted(routes):
        if r in readme_text:
            continue
        if "{" in r and any(path_matches(r, d) for d in readme_paths):
            continue
        undocumented.append(r)
    check("every backend route is documented in the README API reference",
          not undocumented, ", ".join(undocumented))

    check("the README documents the WebSocket feed",
          "/ws" in readme_text, "expected a mention of /ws")


# ---------------------------------------------------------------------------
# 3. Scripts and file paths
# ---------------------------------------------------------------------------

def check_scripts(texts: dict) -> None:
    pkg = json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))
    scripts = set(pkg.get("scripts", {}))
    mentioned = set()
    for text in texts.values():
        mentioned |= set(re.findall(r"npm run ([\w:.-]+)", text))
    unknown = sorted(s for s in mentioned if s not in scripts)
    check("every `npm run <script>` in the docs exists in frontend/package.json",
          not unknown, ", ".join(unknown))


PATH_RE = re.compile(
    r"`((?:backend|frontend|infra|docs|tools)/[A-Za-z0-9_./-]+)")


def check_paths(texts: dict) -> None:
    missing = []
    for rel, text in texts.items():
        for m in PATH_RE.finditer(text):
            token = m.group(1).rstrip("/.,")
            if token.endswith(("/", "*")):
                continue
            # `.env` / `.env.local` are files the operator creates locally.
            if re.search(r"\.env(\.local)?$", token):
                continue
            if (ROOT / token).exists():
                continue
            # A bare filename (no directory) may live anywhere in the tree.
            if "/" not in token and any(
                    p.name == token for p in ROOT.rglob(token)
                    if ".git" not in p.parts):
                continue
            missing.append(f"{rel}:{token}")
    check("every repository path quoted in the docs exists", not missing,
          ", ".join(sorted(set(missing))))

    scripts = set()
    for text in texts.values():
        for m in re.finditer(r"`python ([A-Za-z0-9_./-]+\.py)", text):
            scripts.add(m.group(1))
    missing = sorted(
        s for s in scripts
        if not (ROOT / s).exists() and not (ROOT / "backend" / s).exists()
        and not (ROOT / "infra" / s).exists() and not (ROOT / "tools" / s).exists())
    check("every `python <script>.py` quoted in the docs exists", not missing,
          ", ".join(missing))


# ---------------------------------------------------------------------------
# 4. The ARCHITECTURE module map
# ---------------------------------------------------------------------------

LOC_MAP_RE = re.compile(
    r"^\s*([A-Za-z0-9_./-]+\.(?:py|ts|tsx|json))\s+([\d,]+) LOC", re.M)
MAP_ENTRY_RE = re.compile(
    r"^\s+([A-Za-z0-9_./-]+\.(?:py|ts|tsx|json|css))\b(.*)$", re.M)


def resolve_map_entry(name: str) -> pathlib.Path:
    """Resolve a module-map entry (path relative to backend/, frontend/src/ or root)."""
    for base in ("backend", "frontend/src", ""):
        cand = ROOT / base / name if base else ROOT / name
        if cand.exists():
            return cand
    return ROOT / name


def check_module_map(texts: dict) -> None:
    arch = texts["docs/ARCHITECTURE.md"]
    stale = []
    for m in LOC_MAP_RE.finditer(arch):
        name, stated = m.group(1), int(m.group(2).replace(",", ""))
        path = resolve_map_entry(name)
        if not path.exists():
            stale.append(f"{name} (missing file)")
            continue
        actual = line_count(path)
        if not loc_acceptable(stated, actual):
            stale.append(f"{name} doc={stated} actual={actual}")
        elif loc_drift(stated, actual):
            notes.append(f"{name} size drifted by {loc_drift(stated, actual):+d} lines")
    check("every LOC figure in the ARCHITECTURE module map is within 5%",
          not stale, "; ".join(stale))

    listed = {m.group(1) for m in MAP_ENTRY_RE.finditer(arch)}
    listed_basenames = {p.rsplit("/", 1)[-1] for p in listed}
    missing = sorted(
        p.name for p in sorted((ROOT / "backend").glob("*.py"))
        if p.name not in listed_basenames)
    check("every backend module appears in the ARCHITECTURE module map",
          not missing, ", ".join(missing))

    lib_missing = sorted(
        p.name for p in sorted((ROOT / "frontend" / "src" / "lib").glob("*"))
        if p.is_file() and p.suffix in (".ts", ".tsx")
        and p.name not in listed_basenames)
    check("every frontend/src/lib module appears in the ARCHITECTURE module map",
          not lib_missing, ", ".join(lib_missing))

    mm = re.search(r"components/\s+HUD, drawers, modals \((\d+) files\)", arch)
    actual = len([p for p in (ROOT / "frontend" / "src" / "components").rglob("*")
                  if p.is_file() and "three" not in p.relative_to(
                      ROOT / "frontend" / "src" / "components").parts])
    check("the ARCHITECTURE component count is exact",
          bool(mm) and int(mm.group(1)) == actual,
          f"doc={mm.group(1) if mm else None} actual={actual}")

    mm = re.search(r"components/three/\s+the 3D scene \((\d+) files\)", arch)
    actual = len([p for p in (ROOT / "frontend" / "src" / "components" / "three").glob("*")
                  if p.is_file()])
    check("the ARCHITECTURE 3D-scene file count is exact",
          bool(mm) and int(mm.group(1)) == actual,
          f"doc={mm.group(1) if mm else None} actual={actual}")


# ---------------------------------------------------------------------------
# 5. The README scale line and the architecture diagram
# ---------------------------------------------------------------------------

def check_scale(texts: dict) -> None:
    readme = texts["README.md"]
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=str(ROOT), capture_output=True, text=True,
        timeout=120)
    files = [f for f in tracked.stdout.splitlines() if f.strip()]
    source = [f for f in files if f.endswith((".py", ".ts", ".tsx"))]
    loc = sum(line_count(ROOT / f) for f in source)

    mm = re.search(
        r"\*\*Scale:\*\* ([\d,]+) tracked files . ~?([\d,]+) LOC of Python \+ TypeScript "
        r"\((\d+) source files\)", readme)
    ok = bool(mm)
    detail = ""
    if ok:
        stated_files = int(mm.group(1).replace(",", ""))
        stated_loc = int(mm.group(2).replace(",", ""))
        stated_src = int(mm.group(3))
        # A "~" figure is approximate by construction: allow 5% drift.
        loc_ok = abs(stated_loc - loc) <= max(50, int(loc * 0.05))
        ok = stated_files == len(files) and stated_src == len(source) and loc_ok
        detail = (f"files doc={stated_files} actual={len(files)}; "
                  f"source doc={stated_src} actual={len(source)}; "
                  f"loc doc={stated_loc} actual={loc}")
    check("the README scale line matches the repository", ok, detail)

    mm = re.search(r"EdgeEngine \(([\d,]+) LOC browser-native twin\)", readme)
    actual = module_lines("frontend/src/lib/edgeEngine.ts")
    check("the README EdgeEngine size is within 5%",
          bool(mm) and loc_acceptable(int(mm.group(1).replace(",", "")), actual),
          f"doc={mm.group(1) if mm else None} actual={actual}")

    diagram = {
        r"Stage A\s+Synthetic ingest \(([\d,]+) LOC\)":
            "backend/stage_a_synthetic_engine.py",
        r"Stage B\s+Deterministic math \(([\d,]+) LOC\)":
            "backend/stage_b_math_engine.py",
        r"Stage C\s+Foundry agent router \(([\d,]+) LOC\)":
            "backend/stage_c_foundry_agents.py",
        r"Stage D & E\s+Personalizer \(([\d,]+) LOC\)":
            "backend/stage_d_e_personalizer.py",
    }
    for pattern, rel in diagram.items():
        mm = re.search(pattern, readme)
        actual = (module_lines(rel) if rel in PACKAGE_PATHS
                  else line_count(ROOT / rel))
        check(f"the README size for {rel} is within 5%",
              bool(mm) and loc_acceptable(int(mm.group(1).replace(",", "")), actual),
              f"doc={mm.group(1) if mm else None} actual={actual}")

    mm = re.search(r"RAI & numeric critic \(([\d,]+) LOC\)", readme)
    actual = sum(line_count(ROOT / f"backend/{n}") for n in
                 ("rai_shield.py", "agent_trace.py", "content_safety.py"))
    check("the README size for the RAI layer is within 5%",
          bool(mm) and loc_acceptable(int(mm.group(1).replace(",", "")), actual),
          f"doc={mm.group(1) if mm else None} actual={actual}")


def check_arm(texts: dict) -> None:
    tpl = json.loads((ROOT / "infra" / "main.json").read_text(encoding="utf-8"))
    resources = len(tpl.get("resources", []))
    readme = texts["README.md"]
    mm = re.search(r"(\d+)-resource Azure ARM template", readme)
    check("the README ARM resource count is exact",
          bool(mm) and int(mm.group(1)) == resources,
          f"doc={mm.group(1) if mm else None} actual={resources}")

    arch = texts["docs/ARCHITECTURE.md"]
    mm = re.search(r"infra/main\.json\s+([\d,]+) LOC\s+ARM template \((\d+) resources\)",
                   arch)
    actual_loc = line_count(ROOT / "infra" / "main.json")
    check("the ARCHITECTURE ARM template figures are exact",
          bool(mm) and int(mm.group(1).replace(",", "")) == actual_loc
          and int(mm.group(2)) == resources,
          f"doc={mm.groups() if mm else None} actual=({actual_loc}, {resources})")


# ---------------------------------------------------------------------------
# 6. The gate itself is documented everywhere
# ---------------------------------------------------------------------------

def check_gate_documented(texts: dict) -> None:
    """Every doc that lists the verification gate must list the doc-lint."""
    for rel in ("README.md", "SUBMISSION_GUIDE.md", "CONTRIBUTING.md"):
        text = texts[rel]
        if "backend/test_pipeline.py" not in text:
            continue
        check(f"{rel} lists the doc-lint in its verification gate",
              "tools/doc_lint.py" in text, "add `python tools/doc_lint.py`")


def main() -> int:
    print("AETHER PITCH — documentation lint")
    print(f"repo: {ROOT}")
    print()
    texts = docs_text()
    measured = measure_suites()
    print()
    check_counts(texts, measured)
    check_endpoints(texts)
    check_scripts(texts)
    check_paths(texts)
    check_module_map(texts)
    check_scale(texts)
    check_arm(texts)
    check_gate_documented(texts)

    print()
    for note in notes:
        print(f"[NOTE] {note}")
    if failures:
        print(f"RESULT: {len(failures)} FAILED -> {failures}")
        return 1
    print("RESULT: DOC LINT PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
