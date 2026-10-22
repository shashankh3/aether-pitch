"""Check every tracked text file for a UTF-8 BOM or double-encoded UTF-8."""
import pathlib
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

files = subprocess.run(
    ["git", "ls-files"], capture_output=True, text=True, check=True
).stdout.splitlines()

bom, moji = [], []
MARKERS = ("\u00c2", "\u00c3", "\u00ce", "\u00d9", "\u00cf", "\u00cb", "\u00e2\u20ac",
           "\u00e2\u0080", "\u00e3")

for path in files:
    p = pathlib.Path(path)
    if not p.is_file():
        continue
    raw = p.read_bytes()
    if raw[:3] == b"\xef\xbb\xbf":
        bom.append(path)
        continue
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        continue
    for lineno, line in enumerate(text.splitlines(), 1):
        if any(m in line for m in MARKERS):
            moji.append(f"{path}:{lineno}")
            break

print(f"BOM files: {bom or 'none'}")
print(f"mojibake files: {moji or 'none'}")
sys.exit(1 if (bom or moji) else 0)
