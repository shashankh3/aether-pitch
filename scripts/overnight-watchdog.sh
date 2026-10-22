#!/usr/bin/env bash
# AETHER PITCH - overnight autonomous improvement watchdog (macOS / Linux).
#
# Re-launches `opencode run` against overnight_prompt.md until the wall-clock
# window expires. Each launch is a fresh session; the agent rebuilds its
# bearings from AUTONOMOUS_BACKLOG.md / AUTONOMOUS_LOG.md, so state survives
# between iterations.
#
# Robustness:
#   * model failover - if the primary model errors, the next in the list is
#     tried within the same iteration
#   * loud failure - if every model fails for MAX_FAIL consecutive iterations
#     the loop aborts instead of spinning uselessly
#   * clean stop - touch STOP_OVERNIGHT in the repo root
#
# Usage:
#   chmod +x scripts/overnight-watchdog.sh
#   nohup ./scripts/overnight-watchdog.sh 8 5 >/dev/null 2>&1 &
#   touch STOP_OVERNIGHT     # stop it

set -uo pipefail

HOURS="${1:-8}"
COOLDOWN="${2:-5}"
BRANCH="overnight-auto-improve"
PROMPT_FILE="overnight_prompt.md"
LOG_DIR="logs/overnight"
STOP_FILE="STOP_OVERNIGHT"
MODELS="${MODELS:-fireworks-ai/accounts/fireworks/models/kimi-k3,fireworks-ai/accounts/fireworks/models/glm-5p3,openrouter/minimax/minimax-m3.1-flash:free}"
MAX_FAIL="${MAX_FAIL:-5}"
IFS=',' read -r -a MODEL_LIST <<<"$MODELS"

cd "$(dirname "$0")/.." || exit 1
mkdir -p "$LOG_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="${LOG_DIR}/watchdog-${STAMP}.log"
STATUS="${LOG_DIR}/overnight_status.json"
LOCK="${LOG_DIR}/watchdog.lock"

say() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG"; }

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
say "watchdog start - opencode $(opencode --version 2>&1 | head -1) - window ${HOURS}h - ends $(date -r "$END" 2>/dev/null || echo "@$END")"
say "model failover order: ${MODEL_LIST[*]}"

# The brief is inlined into the user message rather than attached with --file:
# an attached file arrives as file/tool-output content, which the model
# correctly treats as untrusted instructions and refuses to follow.
BRIEF="$(cat "$PROMPT_FILE")"
MESSAGE="Run the overnight autonomous improvement loop for this repository.
The complete brief is reproduced below - follow it exactly.
Work on the ${BRANCH} branch. Start at section 0 (ORIENTATION).

----- BEGIN BRIEF -----
${BRIEF}
----- END BRIEF -----"
say "brief loaded: ${#BRIEF} chars"

ITER=0
CONSEC_FAIL=0
LAST_MODEL=""

while [ "$(date +%s)" -lt "$END" ]; do
  ITER=$((ITER + 1))
  if [ -f "$STOP_FILE" ]; then say "STOP file detected - shutting down."; break; fi

  REMAIN=$(( END - $(date +%s) ))
  say "--- iteration $ITER starting (${REMAIN}s remaining) ---"

  HEAD_BEFORE="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  OUT="${LOG_DIR}/iter-${STAMP}-${ITER}.log"
  STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  USED_MODEL=""
  CODE=1
  : >"$OUT"
  for MODEL in "${MODEL_LIST[@]}"; do
    MODEL="$(echo "$MODEL" | tr -d '[:space:]')"
    [ -z "$MODEL" ] && continue
    say "    trying model ${MODEL}"
    # The brief is already inlined into $MESSAGE - do NOT pass --file: an
    # attached file arrives as untrusted file content and the model refuses
    # to act on it.
    opencode run --auto --print-logs --log-level INFO \
      --title "overnight-iter-${ITER}" -m "$MODEL" "$MESSAGE" >>"$OUT" 2>&1
    CODE=$?
    if [ "$CODE" -eq 0 ]; then USED_MODEL="$MODEL"; break; fi
    say "    model ${MODEL} failed (exit ${CODE}) - trying next"
  done

  HEAD_AFTER="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  if [ "$CODE" -eq 0 ]; then
    CONSEC_FAIL=0
    LAST_MODEL="$USED_MODEL"
    say "--- iteration $ITER done: OK via ${USED_MODEL}; HEAD ${HEAD_BEFORE} -> ${HEAD_AFTER} ---"
  else
    CONSEC_FAIL=$((CONSEC_FAIL + 1))
    say "--- iteration $ITER FAILED: every model errored (exit ${CODE}); HEAD ${HEAD_BEFORE} -> ${HEAD_AFTER} ---"
    if [ "$CONSEC_FAIL" -ge "$MAX_FAIL" ]; then
      say "FATAL: ${CONSEC_FAIL} consecutive failed iterations - aborting rather than spinning."
      printf '{"status":"aborted","reason":"%d consecutive failures","iteration":%d,"head":"%s","ended":"%s","log":"%s"}\n' \
        "$CONSEC_FAIL" "$ITER" "$HEAD_AFTER" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$LOG" >"$STATUS"
      break
    fi
  fi

  printf '{"iteration":%d,"started_utc":"%s","exit_code":%d,"model":"%s","head_before":"%s","head_after":"%s","log":"%s"}\n' \
    "$ITER" "$STARTED" "$CODE" "$USED_MODEL" "$HEAD_BEFORE" "$HEAD_AFTER" "$OUT" \
    >>"${LOG_DIR}/overnight_iterations.jsonl"

  printf '{"status":"running","iteration":%d,"head":"%s","model":"%s","ends":%s,"log":"%s"}\n' \
    "$ITER" "$HEAD_AFTER" "$USED_MODEL" "$END" "$LOG" >"$STATUS"

  if [ -f "$STOP_FILE" ]; then say "STOP file detected - shutting down."; break; fi
  if [ "$(date +%s)" -lt "$END" ]; then sleep "$COOLDOWN"; fi
done

say "watchdog finished after ${ITER} iteration(s)."
printf '{"status":"finished","iterations":%d,"model":"%s","head":"%s","ended":"%s","log":"%s"}\n' \
  "$ITER" "$LAST_MODEL" "$(git rev-parse --short HEAD 2>/dev/null || echo '?')" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$LOG" >"$STATUS"
exit 0
