@echo off
echo ======================================
echo   WGDeepInsight Inspection API Server
echo ======================================
echo.
cd /d "%~dp0"

REM Install dependencies if needed
echo Checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting FastAPI server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
