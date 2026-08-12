@echo off
REM ==============================================================================
REM  start_rtsp_lap.bat — LAP side RTSP publisher startup
REM ==============================================================================
REM
REM This script starts the full LAP-side RTSP pipeline:
REM   Step 1: MediaMTX RTSP server (in background)
REM   Step 2: Dual camera RTSP publisher
REM
REM Run this on the LAPTOP before starting the SBU backend.
REM The SBU will then connect to rtsp://LAP_IP:8554/top and /side
REM ==============================================================================

echo ======================================
echo   WGDeepInsight — LAP RTSP Publisher
echo ======================================
echo.

cd /d "%~dp0"

REM ── Optional: configure camera settings ──────────────────────────────────────
REM Defaults: 5 fps, 1280x720, capnut exposure preset
REM Change --part to: capnut | stud | adapter | adaptor | pin
set PART=capnut
set FPS=5
set WIDTH=1280
set HEIGHT=720

echo Starting MediaMTX RTSP server in background...
start "MediaMTX" /B mediamtx.exe

REM Give MediaMTX a moment to initialize
timeout /t 2 /nobreak > NUL

echo.
echo Starting dual camera RTSP publisher...
echo   Part preset : %PART%
echo   Resolution  : %WIDTH%x%HEIGHT% @ %FPS% fps
echo   Streams:
echo     rtsp://127.0.0.1:8554/top   (TOP  camera)
echo     rtsp://127.0.0.1:8554/side  (SIDE camera)
echo.
echo Press Ctrl+C to stop the publisher.
echo (MediaMTX will keep running in its own window)
echo.

python start_dual_rtsp.py ^
    --fps %FPS% ^
    --width %WIDTH% ^
    --height %HEIGHT% ^
    --part %PART%

echo.
echo Publisher stopped. MediaMTX may still be running in the background.
pause
