"""
camera_manager.py — Singleton RTSP camera manager (SBU / Rockchip board).

On the SBU the GigE cameras are NOT directly connected — instead the LAP
publishes two RTSP streams via MediaMTX, and this manager pulls those streams
using OpenCV VideoCapture over the LAN.

RTSP URLs are configured via environment variables (or fall back to localhost
for local development when both processes run on the same machine):

    RTSP_TOP_URL   = rtsp://<LAP_IP>:8554/top    (default: rtsp://127.0.0.1:8554/top)
    RTSP_SIDE_URL  = rtsp://<LAP_IP>:8554/side   (default: rtsp://127.0.0.1:8554/side)

The public API is identical to the original GVCP-based manager so that
main.py, part_runners.py, and all other callers need zero changes:

    from camera_manager import CameraManager
    mgr = CameraManager.instance()
    top_frame, side_frame = mgr.grab_pair()
"""

import os
import threading
import time
import numpy as np
import cv2

# ── RTSP URL configuration ────────────────────────────────────────────────────
RTSP_TOP_URL  = os.environ.get("RTSP_TOP_URL",  "rtsp://127.0.0.1:8554/top")
RTSP_SIDE_URL = os.environ.get("RTSP_SIDE_URL", "rtsp://127.0.0.1:8554/side")

# How many consecutive read failures before we log a warning
_WARN_AFTER_FAILURES = 20

# Seconds to wait before trying to reconnect a dead capture
_RECONNECT_DELAY = 3.0

# OpenCV backend preference: FFMPEG handles RTSP well on all platforms
_CAP_BACKEND = cv2.CAP_FFMPEG

DEMO_MODE = False  # set True to bypass RTSP (returns synthetic frames)


class _RTSPCapture:
    """
    Thread-safe wrapper around cv2.VideoCapture for a single RTSP stream.
    Auto-reconnects if the stream drops.
    """

    def __init__(self, url: str, label: str):
        self.url   = url
        self.label = label
        self._cap: cv2.VideoCapture | None = None
        self._lock = threading.Lock()
        self._failures = 0

    def _open(self) -> bool:
        cap = cv2.VideoCapture(self.url, _CAP_BACKEND)
        # Lower buffer to minimise latency
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if cap.isOpened():
            self._cap = cap
            self._failures = 0
            print(f"[CAM] {self.label} RTSP connected → {self.url}")
            return True
        cap.release()
        return False

    def read(self) -> np.ndarray | None:
        """Grab one frame. Returns BGR numpy array or None on failure."""
        with self._lock:
            if self._cap is None or not self._cap.isOpened():
                # Try to reconnect
                if not self._open():
                    self._failures += 1
                    if self._failures % _WARN_AFTER_FAILURES == 1:
                        print(f"[CAM] {self.label} cannot connect to {self.url} "
                              f"(attempt {self._failures})")
                    time.sleep(_RECONNECT_DELAY)
                    return None

            ok, frame = self._cap.read()
            if not ok or frame is None:
                self._failures += 1
                if self._failures % _WARN_AFTER_FAILURES == 1:
                    print(f"[CAM] {self.label} read failed (x{self._failures}), "
                          f"will reconnect…")
                # Force reconnect next call
                self._cap.release()
                self._cap = None
                return None

            self._failures = 0
            return frame

    @property
    def ready(self) -> bool:
        """True if the stream is currently open and delivering frames."""
        with self._lock:
            return self._cap is not None and self._cap.isOpened()

    def release(self):
        with self._lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None
        print(f"[CAM] {self.label} released.")


class CameraManager:
    """
    Thread-safe singleton that owns both RTSP camera streams.

    Drop-in replacement for the original GVCP-based CameraManager —
    the public API (grab_pair, set_parameters, ready, shutdown) is identical.
    """

    _instance: "CameraManager | None" = None
    _lock = threading.Lock()

    def __init__(self):
        global DEMO_MODE
        self._demo_counter = 0

        if DEMO_MODE:
            print("[CAM] DEMO MODE — synthetic frames only.")
            self._top_cap  = None
            self._side_cap = None
            return

        self._top_cap  = _RTSPCapture(RTSP_TOP_URL,  "TOP")
        self._side_cap = _RTSPCapture(RTSP_SIDE_URL, "SIDE")

        # Probe the streams at startup — warn but don't crash if not ready yet
        print(f"[CAM] Probing RTSP streams…")
        print(f"[CAM]   TOP  → {RTSP_TOP_URL}")
        print(f"[CAM]   SIDE → {RTSP_SIDE_URL}")

        top_ok  = self._top_cap._open()
        side_ok = self._side_cap._open()

        if not top_ok or not side_ok:
            print("[CAM] WARNING: One or more RTSP streams unreachable at startup. "
                  "Will retry on first grab_pair() call.")
            if not top_ok and not side_ok:
                print("[CAM] Falling back to DEMO MODE (no streams available).")
                DEMO_MODE = True

    # ── Singleton ──────────────────────────────────────────────────────────────

    @classmethod
    def instance(cls) -> "CameraManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        if DEMO_MODE:
            return True
        return (
            self._top_cap  is not None and self._top_cap.ready and
            self._side_cap is not None and self._side_cap.ready
        )

    def set_parameters(self, part_name: str):
        """
        On the RTSP pipeline the SBU cannot directly set camera exposure/gain
        (those are controlled by start_dual_rtsp.py on the LAP).

        This method is a no-op here to preserve API compatibility with
        part_runners.py and main.py. If you need dynamic part-switching,
        set the --part flag on start_dual_rtsp.py or call the optional
        LAP HTTP endpoint separately.
        """
        # No-op: exposure is managed on the LAP side by start_dual_rtsp.py
        pass

    def grab_pair(self) -> tuple[np.ndarray, np.ndarray]:
        """
        Return (top_frame, side_frame) as BGR numpy arrays.
        Falls back to synthetic demo frames if either stream is unavailable.
        """
        if DEMO_MODE:
            time.sleep(1 / 15)
            return (
                self._demo_frame("TOP VIEW",  (0, 255, 100)),
                self._demo_frame("SIDE VIEW", (0, 180, 255)),
            )

        top  = self._top_cap.read()  if self._top_cap  else None
        side = self._side_cap.read() if self._side_cap else None

        if top is None:
            top = self._demo_frame("TOP (no frame)", (100, 100, 255))
        if side is None:
            side = self._demo_frame("SIDE (no frame)", (100, 100, 255))

        return top, side

    def shutdown(self):
        """Release RTSP streams on server shutdown."""
        if self._top_cap:
            self._top_cap.release()
        if self._side_cap:
            self._side_cap.release()
        print("[CAM] Camera manager shut down.")

    # ── Internal ───────────────────────────────────────────────────────────────

    def _demo_frame(self, label: str, color: tuple) -> np.ndarray:
        """Generates a synthetic frame for DEMO / testing when streams are absent."""
        self._demo_counter += 1
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (30, 30, 40)
        cv2.putText(frame, f"DEMO — {label}",     (40, 220),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
        cv2.putText(frame, f"frame {self._demo_counter}", (40, 270),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1)
        cv2.putText(frame, "RTSP streams not connected", (40, 310),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 100, 100), 1)
        # Moving fake bounding box
        t = self._demo_counter % 120
        x = 100 + int(80 * abs(t - 60) / 60)
        cv2.rectangle(frame, (x, 150), (x + 200, 350), color, 2)
        return frame
