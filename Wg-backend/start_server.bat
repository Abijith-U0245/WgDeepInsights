@echo off
echo ======================================
echo   WGDeepInsight Inspection API Server
echo   Direct GigE Camera Mode (MVS SDK)
echo ======================================
echo.
cd /d "%~dp0"

REM ── GigE Camera IPs & Serials (Verified via MVS Studio) ───────────────────
set GIGE_TOP_IP=10.10.12.6
set GIGE_SIDE_IP=10.10.12.2
set GIGE_RIGHT_IP=10.10.12.1

set GIGE_TOP_SERIAL=DB0763438
set GIGE_SIDE_SERIAL=DB0763412
set GIGE_RIGHT_SERIAL=DB1473979

echo Camera Configuration:
echo   Box 1 (TOP VIEW)        → Serial DB0763438 (IP %GIGE_TOP_IP%)
echo   Box 2 (LEFT SIDE VIEW)  → Serial DB0763412 (IP %GIGE_SIDE_IP%, 180° Rotated)
echo   Box 3 (RIGHT SIDE VIEW) → Serial DB1473979 (IP %GIGE_RIGHT_IP%, 180° Rotated)
echo.

REM Install dependencies if needed
echo Checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting FastAPI server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
