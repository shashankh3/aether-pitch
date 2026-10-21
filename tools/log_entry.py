"""Append an entry to the autonomous execution log."""
import pathlib
import sys
from datetime import datetime, timezone

task = sys.argv[1] if len(sys.argv) > 1 else ""
files = sys.argv[2] if len(sys.argv) > 2 else ""
verify = sys.argv[3] if len(sys.argv) > 3 else ""

stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
entry = (
    f"\n### {stamp} — {task}\n"
    f"- Files: {files}\n"
    f"- Verification: {verify}\n"
)
p = pathlib.Path("AUTONOMOUS_LOG.md")
with p.open("a", encoding="utf-8") as fh:
    fh.write(entry)
print("log appended")
