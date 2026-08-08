"""
main.py — WGDeepInsight FastAPI backend
Run with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Endpoints
---------
GET  /health                      → camera + model status
GET  /stream/{part}/measure       → MJPEG SSE live camera feed (measurement overlays)
GET  /stream/{part}/inspect       → MJPEG SSE live camera feed (YOLO bounding boxes)
POST /trigger/{part}/measure      → one-shot dimensional measurement → JSON
POST /trigger/{part}/inspect      → one-shot surface defect detection → JSON
POST /run-test/{part}             → run both → final verdict + analytics JSON
"""

import asyncio
import base64
import time
import cv2
import numpy as np

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from camera_manager import CameraManager
from part_runners import run_measurement, run_inspection

app = FastAPI(title="WGDeepInsight Inspection API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_PARTS = {"capnut", "stud", "adapter", "adaptor", "pin"}


def _normalise(part: str) -> str:
    key = part.lower().replace("-", "").replace(" ", "")
    if key not in VALID_PARTS:
        raise HTTPException(status_code=404, detail=f"Unknown part: {part}")
    return key


# ── /health ────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    mgr = CameraManager.instance()
    return {"cameras": "ready" if mgr.ready else "demo", "status": "ok"}


# ── Live MJPEG SSE stream ──────────────────────────────────────────────────

def _annotate_live_measure(part: str, top: np.ndarray, side: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Lightweight overlay for the live preview (no heavy YOLO, just the camera feed)."""
    top_d  = cv2.resize(top,  (640, 480))
    side_d = cv2.resize(side, (640, 480))
    cv2.putText(top_d,  f"LIVE | {part.upper()} | TOP VIEW",  (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0,230,100), 2)
    cv2.putText(side_d, f"LIVE | {part.upper()} | SIDE VIEW", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0,200,255), 2)
    ts = time.strftime("%H:%M:%S")
    cv2.putText(top_d,  ts, (10, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (180,180,180), 1)
    cv2.putText(side_d, ts, (10, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (180,180,180), 1)
    return top_d, side_d


async def _mjpeg_generator(part: str):
    """Yields multipart MJPEG frames (top and side stacked side-by-side)."""
    mgr = CameraManager.instance()
    while True:
        top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
        top_d, side_d = _annotate_live_measure(part, top, side)
        stacked = np.hstack([top_d, side_d])
        _, buf = cv2.imencode(".jpg", stacked, [cv2.IMWRITE_JPEG_QUALITY, 75])
        yield (
            b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
            + buf.tobytes()
            + b"\r\n"
        )
        await asyncio.sleep(1 / 15)  # ~15 fps


@app.get("/stream/{part}/measure")
async def stream_measure(part: str):
    key = _normalise(part)
    return StreamingResponse(
        _mjpeg_generator(key),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stream/{part}/inspect")
async def stream_inspect(part: str):
    key = _normalise(part)
    return StreamingResponse(
        _mjpeg_generator(key),   # same live feed — YOLO overlay added only on trigger
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ── Trigger endpoints ──────────────────────────────────────────────────────

@app.post("/trigger/{part}/measure")
async def trigger_measure(part: str):
    """Capture one frame pair, run dimensional measurement, return JSON results."""
    key = _normalise(part)
    mgr = CameraManager.instance()
    started = time.time()
    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    result = await asyncio.get_event_loop().run_in_executor(
        None, run_measurement, key, top, side
    )
    result["duration_ms"] = int((time.time() - started) * 1000)
    return JSONResponse(content=result)


@app.post("/trigger/{part}/inspect")
async def trigger_inspect(part: str):
    """Capture one frame pair, run YOLO defect detection, return JSON results."""
    key = _normalise(part)
    mgr = CameraManager.instance()
    started = time.time()
    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    result = await asyncio.get_event_loop().run_in_executor(
        None, run_inspection, key, top, side
    )
    result["duration_ms"] = int((time.time() - started) * 1000)
    return JSONResponse(content=result)


@app.post("/run-test/{part}")
async def run_test(part: str):
    """
    Capture one frame pair, run BOTH measurement and defect inspection,
    combine and return a final verdict.

    Response shape:
    {
      "verdict": "ok" | "reject",
      "measure_status": "PASS" | "FAIL",
      "inspect_status": "pass" | "reject",
      "measurements": [...],
      "defects": [...],
      "top_measure_b64": "<jpeg>",
      "side_measure_b64": "<jpeg>",
      "top_inspect_b64": "<jpeg>",
      "side_inspect_b64": "<jpeg>",
      "duration_ms": int,
    }
    """
    key = _normalise(part)
    mgr = CameraManager.instance()
    started = time.time()

    # Grab one frame pair — reused for both analyses
    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)

    loop = asyncio.get_event_loop()
    measure_res, inspect_res = await asyncio.gather(
        loop.run_in_executor(None, run_measurement, key, top, side),
        loop.run_in_executor(None, run_inspection,  key, top, side),
    )

    verdict = (
        "ok"
        if measure_res["status"] == "PASS" and inspect_res["status"] == "pass"
        else "reject"
    )

    return JSONResponse(content={
        "verdict":          verdict,
        "measure_status":   measure_res["status"],
        "inspect_status":   inspect_res["status"],
        "measurements":     measure_res["measurements"],
        "defects":          inspect_res["defects"],
        "top_measure_b64":  measure_res["top_annotated_b64"],
        "side_measure_b64": measure_res["side_annotated_b64"],
        "top_inspect_b64":  inspect_res["top_annotated_b64"],
        "side_inspect_b64": inspect_res["side_annotated_b64"],
        "duration_ms":      int((time.time() - started) * 1000),
    })


# ── startup / shutdown ─────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    print("[API] Initialising camera manager…")
    mgr = CameraManager.instance()
    print(f"[API] Cameras: {'ready' if mgr.ready else 'DEMO MODE'}")


@app.on_event("shutdown")
async def shutdown():
    CameraManager.instance().shutdown()
