"""Mark a pending backlog line as completed by substring match."""
import pathlib
import sys

path = pathlib.Path("AUTONOMOUS_BACKLOG.md")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
key = sys.argv[1] if len(sys.argv) > 1 else ""
files = sys.argv[2] if len(sys.argv) > 2 else ""
note = sys.argv[3] if len(sys.argv) > 3 else ""

hit = False
for i, line in enumerate(lines):
    if line.startswith("- [ ] ") and key.lower() in line.lower():
        entry = line.replace("- [ ] ", "- [x] ", 1).rstrip()
        if files:
            entry += f"\n    - files: {files}"
        if note:
            entry += f"\n    - note: {note}"
        lines[i] = entry + "\n"
        hit = True
        break

path.write_text("".join(lines), encoding="utf-8")
print("marked done" if hit else f"NO MATCH for {key!r}")
