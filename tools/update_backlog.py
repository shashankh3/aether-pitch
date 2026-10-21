"""Update the autonomous backlog after a completed task (robust matcher)."""
import pathlib
import re
import sys
from datetime import datetime, timezone

path = pathlib.Path("AUTONOMOUS_BACKLOG.md")
text = path.read_text(encoding="utf-8")
key = sys.argv[1] if len(sys.argv) > 1 else ""
files = sys.argv[2] if len(sys.argv) > 2 else ""
note = sys.argv[3] if len(sys.argv) > 3 else ""

stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
text = re.sub(r"Last Updated: .*", f"Last Updated: {stamp}", text, count=1)

lines = text.splitlines(keepends=True)
out = []
done_line = None
for line in lines:
    if key and line.startswith("- [ ] ") and key.lower() in line.lower():
        done_line = line.replace("- [ ] ", "- [x] ", 1).rstrip()
        continue
    out.append(line)
text = "".join(out)

if done_line:
    entry = done_line
    if files:
        entry += f"\n  - files: {files}"
    if note:
        entry += f"\n  - note: {note}"
    text = text.replace("## Completed\n", f"## Completed\n{entry}\n", 1)
elif key:
    print(f"WARNING: no pending task matched {key!r}")
else:
    print("no key supplied")

path.write_text(text, encoding="utf-8")
print("backlog updated")
