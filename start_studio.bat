@echo off
REM ============================================================
REM  AETHER PITCH — one-command studio launcher (Windows)
REM  Starts the FastAPI pipeline (port 8000) + Next.js studio (port 3000)
REM ============================================================
setlocal
cd /d "%~dp0"

echo [AETHER] Installing backend dependencies...
pushd backend
python -m pip install -q -r requirements.txt
if errorlevel 1 ( echo Backend dependency install failed & popd & exit /b 1 )
start "AETHER Backend :8000" cmd /k python -m uvicorn main:app --host 0.0.0.0 --port 8000
popd

echo [AETHER] Installing frontend dependencies...
pushd frontend
if not exist node_modules call npm install --no-audit --no-fund
if errorlevel 1 ( echo Frontend dependency install failed & popd & exit /b 1 )
start "AETHER Frontend :3000" cmd /k npm run dev
popd

echo [AETHER] Waiting for services to boot...
timeout /t 10 /nobreak >nul
start http://localhost:3000

echo.
echo   Backend  : http://localhost:8000  (REST + WebSocket /ws)
echo   Studio   : http://localhost:3000
echo   API docs : http://localhost:8000/docs
echo.
echo Close the two spawned windows to stop the studio.
endlocal
