"""
main.py — WGDeepInsight FastAPI backend (GigE direct connection)
Run with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Endpoints
---------
GET  /health                      → camera + model status
GET  /stream/{part}/measure       → MJPEG live camera feed (measurement overlays)
GET  /stream/{part}/inspect       → MJPEG live camera feed (YOLO bounding boxes)
POST /trigger/{part}/measure      → one-shot dimensional measurement → JSON
POST /trigger/{part}/inspect      → one-shot surface defect detection → JSON
POST /run-test/{part}             → run both → final verdict + analytics JSON

Response additions (vs original):
  stage_timings  : { grab_ms, measure_ms, inspect_ms, total_ms }
  model_accuracy : { top_conf, side_conf, avg_conf }
  rejection_reason: set to "part_not_recognized" when YOLO finds no boxes
"""

import asyncio
import base64
import time
import contextlib
import cv2
import numpy as np

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response

from camera_manager import CameraManager
from part_runners import run_measurement, run_inspection


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: open cameras. Shutdown: close cameras."""
    print("[API] Initialising GigE camera manager…")
    mgr = CameraManager.instance()
    print(f"[API] Cameras: {'ready' if mgr.ready else 'DEMO MODE'}")
    yield
    CameraManager.instance().shutdown()


app = FastAPI(title="WGDeepInsight Inspection API", version="2.0.0", lifespan=lifespan)

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
    top_d  = cv2.resize(top,  (640, 640))
    side_d = cv2.resize(side, (640, 640))
    cv2.putText(top_d,  f"LIVE | {part.upper()} | TOP VIEW",  (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0,230,100), 2)
    cv2.putText(side_d, f"LIVE | {part.upper()} | SIDE VIEW", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0,200,255), 2)
    ts = time.strftime("%H:%M:%S")
    cv2.putText(top_d,  ts, (10, 620), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (180,180,180), 1)
    cv2.putText(side_d, ts, (10, 620), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (180,180,180), 1)
    return top_d, side_d


async def _mjpeg_generator(part: str, cam: str = "all", mode: str = "measurement"):
    """Yields multipart MJPEG frames. cam can be 'top', 'side', or 'all'."""
    mgr = CameraManager.instance()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, part, mode)
    while True:
        top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
        top_d, side_d = _annotate_live_measure(part, top, side)
        if cam == "top":
            frame = top_d
        elif cam == "side":
            frame = side_d
        else:
            frame = np.hstack([top_d, side_d])
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        yield (
            b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
            + buf.tobytes()
            + b"\r\n"
        )
        await asyncio.sleep(1 / 20)  # ~20 fps smooth live stream


@app.get("/stream/{part}/measure")
async def stream_measure(part: str, cam: str = "all"):
    key = _normalise(part)
    return StreamingResponse(
        _mjpeg_generator(key, cam=cam, mode="measurement"),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stream/{part}/inspect")
async def stream_inspect(part: str, cam: str = "all"):
    key = _normalise(part)
    return StreamingResponse(
        _mjpeg_generator(key, cam=cam, mode="inspect"),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stream/{part}/top")
async def stream_top(part: str):
    key = _normalise(part)
    return StreamingResponse(
        _mjpeg_generator(key, cam="top", mode="measurement"),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stream/{part}/side")
async def stream_side(part: str):
    key = _normalise(part)
    return StreamingResponse(
        _mjpeg_generator(key, cam="side", mode="measurement"),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ── Trigger endpoints ──────────────────────────────────────────────────────

@app.post("/trigger/{part}/measure")
async def trigger_measure(part: str):
    """Capture one frame pair, run dimensional measurement, return JSON results."""
    key = _normalise(part)
    mgr = CameraManager.instance()
    started = time.time()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key, "measurement")

    t0 = time.time()
    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    grab_ms = int((time.time() - t0) * 1000)

    result = await asyncio.get_event_loop().run_in_executor(
        None, run_measurement, key, top, side
    )
    measure_ms = int((time.time() - t0) * 1000) - grab_ms
    result["duration_ms"] = int((time.time() - started) * 1000)
    result["stage_timings"] = {"grab_ms": grab_ms, "measure_ms": measure_ms}
    return JSONResponse(content=result)


@app.post("/trigger/{part}/inspect")
async def trigger_inspect(part: str):
    """Capture one frame pair, run YOLO defect detection, return JSON results."""
    key = _normalise(part)
    mgr = CameraManager.instance()
    started = time.time()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key, "inspect")

    t0 = time.time()
    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    grab_ms = int((time.time() - t0) * 1000)

    result = await asyncio.get_event_loop().run_in_executor(
        None, run_inspection, key, top, side
    )
    inspect_ms = int((time.time() - t0) * 1000) - grab_ms
    result["duration_ms"] = int((time.time() - started) * 1000)
    result["stage_timings"] = {"grab_ms": grab_ms, "inspect_ms": inspect_ms}
    return JSONResponse(content=result)


@app.post("/run-test/{part}")
async def run_test(part: str):
    """
    Capture one frame pair, run BOTH measurement and defect inspection,
    combine and return a final verdict with full stage timings and model accuracy.

    Response shape:
    {
      "verdict":          "ok" | "reject",
      "rejection_reason": null | "part_not_recognized" | "measurement_fail" | "defect_detected",
      "measure_status":   "PASS" | "FAIL",
      "inspect_status":   "pass" | "reject",
      "measurements":     [...],
      "defects":          [...],
      "model_accuracy":   { "top_conf": float, "side_conf": float, "avg_conf": float },
      "stage_timings":    { "grab_ms": int, "measure_ms": int, "inspect_ms": int, "total_ms": int },
      "top_measure_b64":  "<jpeg>",
      "side_measure_b64": "<jpeg>",
      "top_inspect_b64":  "<jpeg>",
      "side_inspect_b64": "<jpeg>",
      "duration_ms":      int,
    }
    """
    key = _normalise(part)
    mgr = CameraManager.instance()
    total_start = time.time()

    # ── 1. Grab frame pair ────────────────────────────────────────────────
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key)
    t_grab = time.time()
    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    grab_ms = int((time.time() - t_grab) * 1000)

    loop = asyncio.get_event_loop()

    # ── 2. Run measurement and inspection in parallel ──────────────────────
    t_analysis = time.time()
    measure_res, inspect_res = await asyncio.gather(
        loop.run_in_executor(None, run_measurement, key, top, side),
        loop.run_in_executor(None, run_inspection,  key, top, side),
    )
    analysis_ms = int((time.time() - t_analysis) * 1000)
    measure_ms  = analysis_ms // 2   # approximate split
    inspect_ms  = analysis_ms - measure_ms

    total_ms = int((time.time() - total_start) * 1000)

    # ── 3. Model accuracy from inspect result ─────────────────────────────
    model_accuracy = inspect_res.pop("model_accuracy", {
        "top_conf":  0.0,
        "side_conf": 0.0,
        "avg_conf":  0.0,
    })

    # ── 4. Verdict logic ──────────────────────────────────────────────────
    measure_pass  = measure_res["status"] == "PASS"
    inspect_pass  = inspect_res["status"] == "pass"
    part_seen     = inspect_res.get("part_detected", True)   # set by run_inspection

    rejection_reason = None
    if not part_seen:
        verdict = "reject"
        rejection_reason = "part_not_recognized"
    elif not measure_pass and not inspect_pass:
        verdict = "reject"
        rejection_reason = "measurement_fail_and_defect_detected"
    elif not measure_pass:
        verdict = "reject"
        rejection_reason = "measurement_fail"
    elif not inspect_pass:
        verdict = "reject"
        rejection_reason = "defect_detected"
    else:
        verdict = "ok"

    return JSONResponse(content={
        "verdict":           verdict,
        "rejection_reason":  rejection_reason,
        "measure_status":    measure_res["status"],
        "inspect_status":    inspect_res["status"],
        "measurements":      measure_res["measurements"],
        "defects":           inspect_res["defects"],
        "model_accuracy":    model_accuracy,
        "stage_timings": {
            "grab_ms":    grab_ms,
            "measure_ms": measure_ms,
            "inspect_ms": inspect_ms,
            "total_ms":   total_ms,
        },
        "top_measure_b64":  measure_res["top_annotated_b64"],
        "side_measure_b64": measure_res["side_annotated_b64"],
        "top_inspect_b64":  inspect_res["top_annotated_b64"],
        "side_inspect_b64": inspect_res["side_annotated_b64"],
        "duration_ms":      total_ms,
    })


# ── Snapshot One-Shot Capture ──────────────────────────────────────────────────

@app.get("/capture/{part}/top")
async def capture_top_snapshot(part: str):
    """Capture one high-resolution JPEG snapshot frame from Top camera."""
    key = _normalise(part)
    mgr = CameraManager.instance()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key)
    top, _ = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    _, buf = cv2.imencode(".jpg", top, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return Response(content=buf.tobytes(), media_type="image/jpeg")


@app.get("/capture/{part}/side")
async def capture_side_snapshot(part: str):
    """Capture one high-resolution JPEG snapshot frame from Side camera."""
    key = _normalise(part)
    mgr = CameraManager.instance()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key)
    _, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    _, buf = cv2.imencode(".jpg", side, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return Response(content=buf.tobytes(), media_type="image/jpeg")


# ── Multi-Pair Background Trigger & Batch Inspection ─────────────────────────

PRE_FETCHED_PAIRS: dict[tuple[str, int], dict] = {}


@app.post("/process-pair/{part}")
async def process_pair(part: str, pair_index: int = 1):
    """
    Triggered asynchronously when the user clicks 'Capture Image'.
    Pre-runs AI models in background to avoid any delay when user clicks 'Inspect':
    - Pair 1: Runs BOTH Dimensional Measurement and Surface Defect detection.
    - Pairs 2..5: Runs Surface Defect detection ONLY.
    """
    key = _normalise(part)
    mgr = CameraManager.instance()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key)

    top, side = await asyncio.get_event_loop().run_in_executor(None, mgr.grab_pair)
    loop = asyncio.get_event_loop()

    pair_num = max(1, min(pair_index, 5))

    if pair_num == 1:
        measure_res, inspect_res = await asyncio.gather(
            loop.run_in_executor(None, run_measurement, key, top, side),
            loop.run_in_executor(None, run_inspection,  key, top, side),
        )
    else:
        inspect_res = await loop.run_in_executor(None, run_inspection, key, top, side)
        measure_res = {
            "status": "PASS",
            "measurements": [],
            "top_annotated_b64": "",
            "side_annotated_b64": "",
        }

    res_data = {
        "pair_index": pair_num,
        "measure_res": measure_res,
        "inspect_res": inspect_res,
    }
    PRE_FETCHED_PAIRS[(key, pair_num)] = res_data
    return JSONResponse(content={"status": "ok", "pair_index": pair_num})


@app.post("/run-test-batch/{part}")
async def run_test_batch(part: str, count: int = 1):
    """
    Run multi-pair batch inspection for up to N captured image pairs.
    Pair #1: Dimensional Measurement + Surface Defect Inspection (2 dim + 2 surface images).
    Pairs #2..N: Surface Defect Inspection ONLY (0 dim + 2 surface images per pair).
    """
    key = _normalise(part)
    mgr = CameraManager.instance()
    total_start = time.time()
    await asyncio.get_event_loop().run_in_executor(None, mgr.set_parameters, key)

    num_pairs = max(1, min(count, 5))
    annotated_frames = []
    all_measurements = []
    all_defects = []
    has_rejection = False

    loop = asyncio.get_event_loop()

    for pair_idx in range(num_pairs):
        pair_num = pair_idx + 1

        # Retrieve pre-fetched background result if available
        cached_res = PRE_FETCHED_PAIRS.get((key, pair_num))
        if cached_res:
            measure_res = cached_res["measure_res"]
            inspect_res = cached_res["inspect_res"]
        else:
            top, side = await loop.run_in_executor(None, mgr.grab_pair)
            if pair_num == 1:
                measure_res, inspect_res = await asyncio.gather(
                    loop.run_in_executor(None, run_measurement, key, top, side),
                    loop.run_in_executor(None, run_inspection,  key, top, side),
                )
            else:
                inspect_res = await loop.run_in_executor(None, run_inspection, key, top, side)
                measure_res = {
                    "status": "PASS",
                    "measurements": [],
                    "top_annotated_b64": "",
                    "side_annotated_b64": "",
                }

        measure_pass = measure_res["status"] == "PASS"
        inspect_pass = inspect_res["status"] == "pass"
        pair_pass = measure_pass and inspect_pass
        if not pair_pass:
            has_rejection = True

        # Tag measurements with pair_index (Pair 1 only)
        pair_measures = []
        for m in measure_res.get("measurements", []):
            m_copy = dict(m)
            m_copy["pair_index"] = pair_num
            pair_measures.append(m_copy)
            all_measurements.append(m_copy)

        # Tag defects with pair_index
        pair_defects = []
        for d in inspect_res.get("defects", []):
            d_copy = dict(d)
            d_copy["pair_index"] = pair_num
            pair_defects.append(d_copy)
            all_defects.append(d_copy)

        annotated_frames.append({
            "pair_index": pair_num,
            "top_measure_b64": measure_res.get("top_annotated_b64", ""),
            "side_measure_b64": measure_res.get("side_annotated_b64", ""),
            "top_inspect_b64": inspect_res.get("top_annotated_b64", ""),
            "side_inspect_b64": inspect_res.get("side_annotated_b64", ""),
            "measurements": pair_measures,
            "defects": pair_defects,
            "measure_status": measure_res["status"],
            "inspect_status": inspect_res["status"],
            "pass": pair_pass,
        })

    # Clear pre-fetched cache after batch run completes
    PRE_FETCHED_PAIRS.clear()

    overall_verdict = "reject" if has_rejection else "ok"
    total_ms = int((time.time() - total_start) * 1000)

    return JSONResponse(content={
        "verdict": overall_verdict,
        "total_pairs": num_pairs,
        "annotated_frames": annotated_frames,
        "measurements": all_measurements,
        "defects": all_defects,
        "duration_ms": total_ms,
    })


