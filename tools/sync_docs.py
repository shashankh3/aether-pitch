#!/usr/bin/env python3
"""Synchronise the judge-facing doc figures with the live repository.

`tools/doc_lint.py` is the gate: it fails when a documented number no longer
matches reality. This is the other half - it rewrites those numbers from the
live measurement, so the drift is fixed in one command instead of by hand.

    python tools/sync_docs.py           # rewrite the stale figures
    python tools/sync_docs.py --check   # report what would change

Every figure it touches is measured, never guessed.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def run(cmd: list, cwd: pathlib.Path = None) -> str:
    return subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True).stdout


def npm() -> str:
    """npm is a .cmd shim on Windows, so it is not directly executable."""
    import shutil
    found = shutil.which("npm") or shutil.which("npm.cmd")
    if not found:
        raise RuntimeError("npm is not on PATH")
    return found


PACKAGE_PATHS = {
    "backend/stage_c_foundry_agents.py": "backend/agents",
    "frontend/src/lib/edgeEngine.ts": "frontend/src/lib/edgeEngine",
    "frontend/src/lib/types.ts": "frontend/src/lib/types",
}


def count_lines(rel: str) -> int:
    return len(read(rel).splitlines())


def package_lines(rel: str) -> int:
    """LOC in a stable barrel plus every module in its implementation package."""
    folder = ROOT / PACKAGE_PATHS[rel]
    total = count_lines(rel)
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.suffix in (".py", ".ts"):
            total += len(path.read_text(encoding="utf-8").splitlines())
    return total


def measure_suites() -> dict:
    """Run the three headless suites and read their assertion counts."""
    out = run([sys.executable, "backend/test_pipeline.py"])
    m = re.search(r"RESULT: ALL (\d+) PIPELINE TESTS PASSED", out)
    backend = int(m.group(1)) if m else 0
    out = run([npm(), "run", "check:logic"], cwd=ROOT / "frontend")
    m = re.search(r"RESULT: ALL (\d+) FRONTEND LOGIC CHECKS PASSED", out)
    logic = int(m.group(1)) if m else 0
    out = run([npm(), "run", "smoke:ui"], cwd=ROOT / "frontend")
    m = re.search(r"RESULT: ALL (\d+) COMPONENT RENDER CHECKS PASSED", out)
    ui = int(m.group(1)) if m else 0
    return {"backend": backend, "logic": logic, "ui": ui}


def repo_stats() -> dict:
    """The same measurement the doc-lint uses, so the two always agree."""
    tracked = [f for f in run(["git", "ls-files"]).splitlines() if f]
    source = [f for f in tracked if f.endswith((".py", ".ts", ".tsx"))]
    loc = 0
    for f in source:
        try:
            loc += len((ROOT / f).read_text(encoding="utf-8").splitlines())
        except (OSError, UnicodeDecodeError):
            pass
    return {"files": len(tracked), "source": len(source), "loc": loc}


def sub_once(text: str, pattern: str, repl: str, label: str, changes: list) -> str:
    new, n = re.subn(pattern, repl, text, count=1)
    if n == 0:
        print(f"  ! no match for {label}")
    elif new != text:
        changes.append(label)
    return new


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report what would change without writing")
    args = ap.parse_args()

    suites = measure_suites()
    if not all(suites.values()):
        print("could not measure the suites - run them first")
        return 1
    stats = repo_stats()
    total = suites["backend"] + suites["logic"] + suites["ui"]
    print(f"live: {suites['backend']} backend + {suites['logic']} logic "
          f"+ {suites['ui']} ui = {total}")
    print(f"live: {stats['files']} files, {stats['source']} source, {stats['loc']} LOC")

    changes: list = []
    readme = read("README.md")
    guide = read("SUBMISSION_GUIDE.md")
    arch = read("docs/ARCHITECTURE.md")

    # --- README: the scale line -------------------------------------------
    readme = sub_once(
        readme,
        r"\*\*Scale:\*\* [\d,]+ tracked files . ~?[\d,]+ LOC of Python \+ TypeScript "
        r"\(\d+ source files\) . \*\*\d+ automated assertions\*\* "
        r"\(\d+ backend . \d+ headless logic . \d+ headless UI render\)",
        f"**Scale:** {stats['files']:,} tracked files · ~{stats['loc']:,} LOC of "
        f"Python + TypeScript ({stats['source']} source files) · "
        f"**{total} automated assertions** ({suites['backend']} backend · "
        f"{suites['logic']} headless logic · {suites['ui']} headless UI render)",
        "README scale line", changes)

    # --- README: the architecture-diagram sizes ---------------------------
    for pattern, rel in (
        (r"Stage A\s+Synthetic engine \(([\d,]+) LOC\)", "backend/stage_a_synthetic_engine.py"),
        (r"Stage B\s+Math engine \(([\d,]+) LOC\)", "backend/stage_b_math_engine.py"),
        (r"Stage C\s+Foundry agent router \(([\d,]+) LOC\)", "backend/stage_c_foundry_agents.py"),
        (r"Stage D & E\s+Personalizer \(([\d,]+) LOC\)", "backend/stage_d_e_personalizer.py"),
        (r"RAI & numeric critic \(([\d,]+) LOC\)", None),
        (r"EdgeEngine \(([\d,]+) LOC browser-native twin\)", "frontend/src/lib/edgeEngine.ts"),
    ):
        if rel is None:
            # The RAI layer is the sum of three modules.
            actual = sum(count_lines(f"backend/{n}") for n in
                         ("rai_shield.py", "agent_trace.py", "content_safety.py"))
        elif rel in PACKAGE_PATHS:
            actual = package_lines(rel)
        else:
            actual = count_lines(rel)
        m = re.search(pattern, readme)
        if not m:
            continue
        stated = int(m.group(1).replace(",", ""))
        if stated == actual:
            continue
        readme = sub_once(readme, pattern,
                          lambda mm, a=actual: mm.group(0).replace(
                              mm.group(1), f"{a:,}"),
                          f"README size for {rel or 'the RAI layer'}", changes)

    # --- SUBMISSION_GUIDE: the totals -------------------------------------
    guide = sub_once(guide, r"the four suites make \*\*\d+ automated assertions\*\*",
                     f"the four suites make **{total} automated assertions**",
                     "SUBMISSION_GUIDE total", changes)
    guide = sub_once(guide, r"npm run check:logic\s+# \d+ headless assertions",
                     f"npm run check:logic    # {suites['logic']} headless assertions",
                     "SUBMISSION_GUIDE logic count", changes)
    guide = sub_once(guide, r"RESULT: ALL \d+ FRONTEND LOGIC CHECKS PASSED",
                     f"RESULT: ALL {suites['logic']} FRONTEND LOGIC CHECKS PASSED",
                     "SUBMISSION_GUIDE expected logic result", changes)
    guide = sub_once(guide, r"RESULT: ALL \d+ PIPELINE TESTS PASSED",
                     f"RESULT: ALL {suites['backend']} PIPELINE TESTS PASSED",
                     "SUBMISSION_GUIDE expected backend result", changes)
    guide = sub_once(guide, r"RESULT: ALL \d+ COMPONENT RENDER CHECKS PASSED",
                     f"RESULT: ALL {suites['ui']} COMPONENT RENDER CHECKS PASSED",
                     "SUBMISSION_GUIDE expected ui result", changes)

    # --- ARCHITECTURE: the module map and the matrix ----------------------
    for rel in ("backend/stage_a_synthetic_engine.py", "backend/stage_b_math_engine.py",
                "backend/stage_c_foundry_agents.py", "backend/stage_d_e_personalizer.py",
                "backend/main.py", "backend/counterfactual.py", "backend/config.py",
                "backend/agent_trace.py", "backend/test_pipeline.py"):
        actual = count_lines(rel)
        name = rel.rsplit("/", 1)[-1]
        pattern = rf"({re.escape(name)}\s+)([\d,]+)( LOC)"
        m = re.search(pattern, arch)
        if not m:
            continue
        stated = int(m.group(2).replace(",", ""))
        if stated == actual:
            continue
        arch = sub_once(arch, pattern,
                        lambda mm, a=actual: f"{mm.group(1)}{a:,}{mm.group(3)}",
                        f"ARCHITECTURE module map for {name}", changes)

    for rel, folder in (
        ("backend/stage_c_foundry_agents.py", "agents/"),
        ("frontend/src/lib/edgeEngine.ts", "lib/edgeEngine/"),
        ("frontend/src/lib/types.ts", "lib/types/"),
    ):
        actual = package_lines(rel)
        arch = sub_once(
            arch,
            rf"(?m)(^\s+{re.escape(folder)}\s+)([\d,]+)( LOC)",
            lambda mm, a=actual: f"{mm.group(1)}{a:,}{mm.group(3)}",
            f"ARCHITECTURE package size for {folder}", changes)

    arch = sub_once(arch, r"(\| Backend \| `python backend/test_pipeline\.py` \| )\d+( assertions)",
                    rf"\g<1>{suites['backend']}\2", "ARCHITECTURE backend count", changes)
    arch = sub_once(arch, r"(\| Logic \| `npm run check:logic` \| )\d+( headless assertions)",
                    rf"\g<1>{suites['logic']}\2", "ARCHITECTURE logic count", changes)
    arch = sub_once(arch, r"(\| UI render \| `npm run smoke:ui` \| )\d+( assertions)",
                    rf"\g<1>{suites['ui']}\2", "ARCHITECTURE ui count", changes)
    arch = sub_once(arch, r"(test_pipeline\.py\s+)([\d,]+)( LOC\s+)\d+( assertions)",
                    lambda mm: (f"{mm.group(1)}{count_lines('backend/test_pipeline.py'):,}"
                                f"{mm.group(3)}{suites['backend']} assertions"),
                    "ARCHITECTURE module map backend count", changes)

    # The module map must list every module, with its size. This walks the
    # map generically: any entry whose file exists gets its LOC corrected,
    # and any new module is inserted next to its siblings.
    MAP_ENTRY = re.compile(
        r"^(\s+)([A-Za-z0-9_./-]+\.(?:py|ts|tsx|json|css))(\s+)([\d,]+)( LOC)(.*)$",
        re.M)
    roots = [ROOT / "backend", ROOT / "frontend" / "src"]
    known = {}
    for r in roots:
        for p in r.rglob("*"):
            if p.is_file() and p.suffix in (".py", ".ts", ".tsx", ".json", ".css"):
                known.setdefault(p.name, []).append(p)

    def resolve(basename: str):
        cands = known.get(basename) or []
        return cands[0] if len(cands) == 1 else (cands[0] if cands else None)

    def fix_map(text: str) -> str:
        out_lines = []
        for line in text.splitlines(keepends=True):
            m = MAP_ENTRY.match(line)
            if m:
                indent, path, gap, stated, unit, rest = m.groups()
                target = resolve(path.rsplit("/", 1)[-1])
                if target is not None:
                    actual = count_lines(target.relative_to(ROOT).as_posix())
                    if int(stated.replace(",", "")) != actual:
                        line = f"{indent}{path}{gap}{actual:,}{unit}{rest}\n"
                        changes.append(f"ARCHITECTURE module map for {path}")
            out_lines.append(line)
        return "".join(out_lines)

    arch = fix_map(arch)

    # A new module must appear in the map at all. The map lists the backend
    # modules and the frontend lib modules - not every component.
    listed = {m.group(2).rsplit("/", 1)[-1] for m in MAP_ENTRY.finditer(arch)}
    required = []
    for p in sorted((ROOT / "backend").glob("*.py")):
        required.append((p, "backend"))
    for p in sorted((ROOT / "frontend" / "src" / "lib").glob("*")):
        if p.is_file() and p.suffix in (".ts", ".tsx"):
            required.append((p, "frontend/src"))
    for p, base in required:
        if p.name in listed:
            continue
        rel = p.relative_to(ROOT).as_posix()
        short = rel.replace("frontend/src/", "").replace("backend/", "")
        actual = count_lines(rel)
        lines = arch.splitlines(keepends=True)
        anchor = next((i for i, l in enumerate(lines)
                       if re.match(r"\s*lib/runtimeConfig\.ts\s", l)), None)
        if anchor is None:
            continue
        # The map right-aligns the LOC figure at column 32; match it.
        num = f"{actual:,}"
        pad = max(1, 32 - 2 - len(short) - len(num))
        lines.insert(anchor + 1,
                     f"  {short}{' ' * pad}{num} LOC  the {p.stem} module\n")
        arch = "".join(lines)
        changes.append(f"ARCHITECTURE module map: added {short}")

    # The compliance audit prints how many source files it scans.
    out = run([sys.executable, "backend/test_pipeline.py"])
    m = re.search(r"(\d+) files scanned, (\d+) offenders", out)
    if m:
        scanned = int(m.group(1))
        readme = sub_once(readme, r"\((\d+) files scanned\)", f"({scanned} files scanned)",
                          "README compliance-scan file count", changes)
        guide = sub_once(guide, r"scans (\d+) files with 0 offenders",
                         f"scans {scanned} files with 0 offenders",
                         "SUBMISSION_GUIDE compliance-scan file count", changes)

    if args.check:
        print("\nwould change:")
        for c in changes:
            print(f"  - {c}")
        if not changes:
            print("  nothing to do - the docs already match the repository")
        return 0

    write("README.md", readme)
    write("SUBMISSION_GUIDE.md", guide)
    write("docs/ARCHITECTURE.md", arch)
    print("\nupdated:")
    for c in changes:
        print(f"  - {c}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
