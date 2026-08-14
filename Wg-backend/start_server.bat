@echo off
echo ======================================
echo   WGDeepInsight Inspection API Server
echo   Direct GigE Camera Mode (MVS SDK)
echo ======================================
echo.
cd /d "%~dp0"

REM ── GigE Camera IPs ──────────────────────────────────────────────────────
REM Set these to match your Hikrobot camera IPs (check in MVS Studio software)
set GIGE_TOP_IP=192.168.1.101
set GIGE_SIDE_IP=192.168.1.102

REM Optional: override camera settings
REM set GIGE_EXPOSURE=80000
REM set GIGE_GAIN=12.0
REM set GIGE_FPS=15

echo Camera IPs:
echo   TOP  → %GIGE_TOP_IP%
echo   SIDE → %GIGE_SIDE_IP%
echo.

REM Install dependencies if needed
echo Checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting FastAPI server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
