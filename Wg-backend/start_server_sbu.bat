@echo off
REM ==============================================================================
REM  start_server_sbu.bat — WGDeepInsight Backend in RTSP mode (Windows / LAP test)
REM ==============================================================================
REM
REM Use this to TEST the RTSP pipeline locally on the LAP before deploying to SBU.
REM It points RTSP URLs to localhost (MediaMTX running on same machine).
REM
REM For the actual SBU (Rockchip/Linux), use start_server_sbu.sh instead and
REM update LAP_IP to the laptop's LAN IP address.
REM ==============================================================================

echo ======================================
echo   WGDeepInsight — RTSP Mode (SBU)
echo ======================================
echo.

cd /d "%~dp0"

REM ── CONFIGURE: Change to LAP LAN IP when running on the real SBU board ──
set LAP_IP=127.0.0.1
set MEDIAMTX_PORT=8554

set RTSP_TOP_URL=rtsp://%LAP_IP%:%MEDIAMTX_PORT%/top
set RTSP_SIDE_URL=rtsp://%LAP_IP%:%MEDIAMTX_PORT%/side

echo   RTSP_TOP_URL  = %RTSP_TOP_URL%
echo   RTSP_SIDE_URL = %RTSP_SIDE_URL%
echo.
echo   Ensure LAP is running:
echo     1) mediamtx.exe  (in rtsp_file_tranfer/)
echo     2) python start_dual_rtsp.py
echo.

REM Install dependencies if needed
echo Checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting FastAPI server on http://0.0.0.0:8000
echo Press Ctrl+C to stop.
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
