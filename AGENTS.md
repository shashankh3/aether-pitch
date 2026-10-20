# AGENTS.md — Rules & Operational Guidelines for FIFAXLR8 (AETHER PITCH)

## CRITICAL: Windows Terminal & Shell Execution Rules
1. **NEVER start long-running servers or background daemons inside tool commands:**
   - **DO NOT RUN:** `npm run dev`, `python -m uvicorn`, `Start-Process ...`, or `start /b ...`.
   - **Why:** On Windows, background processes inherit open stdout/stderr pipes, causing OpenCode's tool execution runner to hang indefinitely waiting for EOF.
2. **Servers are ALREADY running in the background:**
   - **Frontend:** `http://localhost:3000` (Next.js 14)
   - **Backend:** `http://127.0.0.1:8000` (FastAPI / Uvicorn)
   - **API Docs:** `http://127.0.0.1:8000/docs`
3. **How to verify runtime status without hanging:**
   - Use non-blocking HTTP requests:
     ```powershell
     Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
     Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 5
     ```
   - Or test builds statically:
     ```bash
     cd frontend && npm run build
     python backend/test_pipeline.py
     ```
4. **All terminal commands must be short-lived and non-interactive:**
   - Never run commands that prompt for user input or await manual termination (e.g. `npm init`, interactive git prompts, interactive REPLs).

## Project Architecture & Tech Stack
- **Frontend (`/frontend`):** Next.js 14 (App Router), React Three Fiber (R3F), Three.js, Lucide Icons, Tailwind CSS / Vanilla CSS.
- **Backend (`/backend`):** FastAPI, Uvicorn, Azure AI Foundry integration with 100% synthetic 10Hz football telemetry.
- **Core Modules:**
  - 14-part biomechanical avatar rig with singleton geometry pooling.
  - CV auto-eventing viewport + homography projection.
  - DVR time-machine & 3D telestrator (15-second buffer).
  - SMPTE broadcast alpha mode (`?overlay=alpha`).
  - Fan personalization runtime & 3-act cinematic recap.
  - 10Hz resilient edge fallback engine (`edgeEngine.ts`).

## Verification Workflow
- Frontend validity: `cd frontend && npm run build`
- Backend pipeline validity: `python backend/test_pipeline.py`
