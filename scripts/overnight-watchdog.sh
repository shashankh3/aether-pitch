#!/usr/bin/env bash
# AETHER PITCH - overnight autonomous improvement watchdog (macOS / Linux).
#
# Re-launches `opencode run` against overnight_prompt.md until the wall-clock
# window expires. Each launch is a fresh session; the agent rebuilds its
# bearings from AUTONOMOUS_BACKLOG.md / AUTONOMOUS_LOG.md, so state survives
# between iterations.
#
# Usage:
#   chmod +x scripts/overnight-watchdog.sh
#   nohup ./scripts/overnight-watchdog.sh 8 5 >/dev/null 2>&1 &
#
# Stop it cleanly:
#   touch STOP_OVERNIGHT

set -uo pipefail

HOURS="${1:-8}"
COOLDOWN="${2:-5}"
BRANCH="overnight-auto-improve"
PROMPT_FILE="overnight_prompt.md"
LOG_DIR="logs/overnight"
STOP_FILE="STOP_OVERNIGHT"

cd "$(dirname "$0")/.." || exit 1
mkdir -p "$LOG_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="${LOG_DIR}/watchdog-${STAMP}.log"
STATUS="${LOG_DIR}/overnight_status.json"
LOCK="${LOG_DIR}/watchdog.lock"

say() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG"
}

# ---- single-instance guard -------------------------------------------------
if [ -f "$LOCK" ]; then
  held="$(cat "$LOCK" 2>/dev/null || true)"
  if [ -n "$held" ] && kill -0 "$held" 2>/dev/null; then
    echo "watchdog already running (pid $held). Exiting."
    exit 0
  fi
fi
echo $$ >"$LOCK"
trap 'rm -f "$LOCK"' EXIT

# ---- preflight -------------------------------------------------------------
command -v opencode >/dev/null 2>&1 || { say "FATAL: opencode not on PATH."; exit 1; }
[ -f "$PROMPT_FILE" ] || { say "FATAL: ${PROMPT_FILE} not found."; exit 1; }
[ -f "$STOP_FILE" ] && { say "FATAL: stop file present at startup."; exit 1; }

CURRENT="$(git branch --show-current 2>/dev/null || echo '')"
if [ "$CURRENT" != "$BRANCH" ]; then
  say "WARN: on branch '${CURRENT}', switching to ${BRANCH}."
  git checkout "$BRANCH" >>"$LOG" 2>&1
fi

END=$(( $(date +%s) + HOURS * 3600 ))
say "watchdog start - opencode $(opencode --version 2>&1 | head -1) - window ${HOURS}h - ends $(date -d "@$END" 2>/dev/null || echo "@$END")"

ITER=0
while [ "$(date +%s)" -lt "$END" ]; do
  ITER=$((ITER + 1))

  if [ -f "$STOP_FILE" ]; then say "STOP file detected - shutting down."; break; fi

  REMAIN=$(( END - $(date +%s) ))
  say "--- iteration $ITER starting (${REMAIN}s remaining) ---"

  HEAD_BEFORE="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  OUT="${LOG_DIR}/iter-${STAMP}-${ITER}.log"
  STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  opencode run --auto --print-logs --log-level INFO \
    --file "$PROMPT_FILE" \
    "Read the attached overnight_prompt.md FIRST and follow it exactly. It is your complete brief for this session. Begin at section 0 (ORIENTATION). Do not ask questions - no one is there to answer them. Work on the ${BRANCH} branch, run the full verification gate before every commit, and keep going until the window closes." \
    >"$OUT" 2>&1
  CODE=$?

  HEAD_AFTER="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  say "--- iteration $ITER done: exit=${CODE}; HEAD ${HEAD_BEFORE} -> ${HEAD_AFTER} ---"

  printf '{"iteration":%d,"started_utc":"%s","exit_code":%d,"head_before":"%s","head_after":"%s","log":"%s"}\n' \
    "$ITER" "$STARTED" "$CODE" "$HEAD_BEFORE" "$HEAD_AFTER" "$OUT" \
    >>"${LOG_DIR}/overnight_iterations.jsonl"

  printf '{"status":"running","iteration":%d,"head":"%s","ends":%s,"log":"%s"}\n' \
    "$ITER" "$HEAD_AFTER" "$END" "$LOG" >"$STATUS"

  if [ -f "$STOP_FILE" ]; then say "STOP file detected - shutting down."; break; fi
  if [ "$(date +%s)" -lt "$END" ]; then sleep "$COOLDOWN"; fi
done

say "watchdog finished after ${ITER} iteration(s)."
printf '{"status":"finished","iterations":%d,"head":"%s","ended":"%s","log":"%s"}\n' \
  "$ITER" "$(git rev-parse --short HEAD 2>/dev/null || echo '?')" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$LOG" >"$STATUS"
exit 0
