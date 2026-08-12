#!/bin/bash
# ==============================================================================
#  start_server_sbu.sh — WGDeepInsight Backend Startup Script (SBU / Rockchip)
# ==============================================================================
#
# Sets RTSP_TOP_URL and RTSP_SIDE_URL to point at the LAP's MediaMTX server,
# then starts the FastAPI backend.
#
# USAGE:
#   1. Edit the LAP_IP variable below to match your laptop's LAN IP.
#   2. Make executable: chmod +x start_server_sbu.sh
#   3. Run: ./start_server_sbu.sh
#
# The LAP must be running:
#   - mediamtx.exe  (from rtsp_file_tranfer/)
#   - start_dual_rtsp.py
# ==============================================================================

# ── CONFIGURE THIS ─────────────────────────────────────────────────────────────
LAP_IP="192.168.1.100"      # ← Change to your laptop's LAN IP address
MEDIAMTX_PORT="8554"
# ──────────────────────────────────────────────────────────────────────────────

export RTSP_TOP_URL="rtsp://${LAP_IP}:${MEDIAMTX_PORT}/top"
export RTSP_SIDE_URL="rtsp://${LAP_IP}:${MEDIAMTX_PORT}/side"

echo "======================================================"
echo "  WGDeepInsight Inspection API Server (SBU Mode)"
echo "======================================================"
echo ""
echo "  RTSP_TOP_URL  = $RTSP_TOP_URL"
echo "  RTSP_SIDE_URL = $RTSP_SIDE_URL"
echo ""
echo "  Make sure the LAP is running:"
echo "    1) mediamtx.exe"
echo "    2) python start_dual_rtsp.py"
echo ""

cd "$(dirname "$0")"

# Install / update dependencies
echo "Checking dependencies..."
pip install -r requirements.txt --quiet

echo ""
echo "Starting FastAPI server on http://0.0.0.0:8000"
echo "Press Ctrl+C to stop."
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
