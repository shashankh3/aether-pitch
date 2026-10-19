#!/usr/bin/env bash
# ============================================================
#  AETHER PITCH — one-command studio launcher (macOS / Linux)
#  Starts the FastAPI pipeline (port 8000) + Next.js studio (port 3000)
# ============================================================
set -e
cd "$(dirname "$0")"

echo "[AETHER] Installing backend dependencies..."
(cd backend && python3 -m pip install -q -r requirements.txt) || true

echo "[AETHER] Starting backend on :8000 ..."
(cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000) &
BACK_PID=$!

echo "[AETHER] Installing frontend dependencies..."
(cd frontend && [ -d node_modules ] || npm install --no-audit --no-fund)

echo "[AETHER] Starting studio on :3000 ..."
(cd frontend && npm run dev) &
FRONT_PID=$!

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null' EXIT
echo "[AETHER] Booting... opening http://localhost:3000 in 8s"
sleep 8
( xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null ) || true

echo
echo "  Backend  : http://localhost:8000  (REST + WebSocket /ws)"
echo "  Studio   : http://localhost:3000"
echo "  API docs : http://localhost:8000/docs"
echo "  Ctrl+C stops both services."
wait
