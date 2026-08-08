"""
camera_manager.py — Singleton Hikrobot GigE camera manager.

Keeps both cameras open for the lifetime of the server process so every
part script can grab frames without re-initialising hardware.

Usage
-----
    from camera_manager import CameraManager
    mgr = CameraManager.instance()
    top_frame, side_frame = mgr.grab_pair()
"""

import sys
import ctypes
import threading
import time
import numpy as np
import cv2

# ── MVS SDK path ──────────────────────────────────────────────────────────────
sys.path.append(r"C:\Program Files (x86)\MVS\Development\Samples\Python")
sys.path.append(r"./MvImport")

DEMO_MODE = False  # set True if cameras are not attached (returns synthetic frames)

try:
    from MvImport.MvCameraControl_class import (
        MV_CC_DEVICE_INFO_LIST,
        MV_CC_DEVICE_INFO,
        MvCamera,
        MV_GIGE_DEVICE,
        MV_ACCESS_Exclusive,
        MV_TRIGGER_MODE_OFF,
        MV_FRAME_OUT_INFO_EX,
    )
except ImportError:
    print("[WARN] MvImport not found — running in DEMO MODE (synthetic frames)")
    DEMO_MODE = True


TOP_CAM_SERIAL  = "DA5211006"
SIDE_CAM_SERIAL = "DA4265515"

BUF_SIZE = 4000 * 3000 * 3  # worst-case 4K RGB buffer


class CameraManager:
    """Thread-safe singleton that owns both GigE cameras."""

    _instance: "CameraManager | None" = None
    _lock = threading.Lock()

    def __init__(self):
        self._cam_lock = threading.Lock()
        self._cameras: dict[str, object] = {}        # "top" | "side" → MvCamera
        self._data_buf = (ctypes.c_ubyte * BUF_SIZE)()
        self._frame_info = MV_FRAME_OUT_INFO_EX() if not DEMO_MODE else None
        self._demo_counter = 0
        if not DEMO_MODE:
            self._open_cameras()

    @classmethod
    def instance(cls) -> "CameraManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── internal ──────────────────────────────────────────────────────────────

    def _open_cameras(self):
        device_list = MV_CC_DEVICE_INFO_LIST()
        ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
        if ret != 0 or device_list.nDeviceNum < 1:
            print("[WARN] No Hikrobot cameras found — falling back to DEMO MODE")
            global DEMO_MODE
            DEMO_MODE = True
            return

        for i in range(device_list.nDeviceNum):
            info = ctypes.cast(
                device_list.pDeviceInfo[i], ctypes.POINTER(MV_CC_DEVICE_INFO)
            ).contents

            serial = ""
            if info.nTLayerType == MV_GIGE_DEVICE:
                for ch in info.SpecialInfo.stGigEInfo.chSerialNumber:
                    if ch == 0:
                        break
                    serial += chr(ch)

            cam = MvCamera()
            cam.MV_CC_CreateHandle(info)
            cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)

            pkt = cam.MV_CC_GetOptimalPacketSize()
            if int(pkt) > 0:
                cam.MV_CC_SetIntValue("GevSCPSPacketSize", pkt)

            cam.MV_CC_SetIntValue("GevSCPD", 1000)
            cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
            cam.MV_CC_SetFloatValue("AcquisitionFrameRate", 15.0)
            cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)

            if serial == TOP_CAM_SERIAL:
                cam.MV_CC_StartGrabbing()
                self._cameras["top"] = cam
                print(f"[CAM] Top camera ready  ({serial})")

            elif serial == SIDE_CAM_SERIAL:
                cam.MV_CC_StartGrabbing()
                self._cameras["side"] = cam
                print(f"[CAM] Side camera ready ({serial})")

        if "top" not in self._cameras or "side" not in self._cameras:
            print("[WARN] Could not open both cameras — DEMO MODE")
            DEMO_MODE = True

    # ── public API ────────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return DEMO_MODE or ("top" in self._cameras and "side" in self._cameras)

    def _grab_one(self, which: str) -> np.ndarray | None:
        cam = self._cameras.get(which)
        if cam is None:
            return None
        with self._cam_lock:
            ret = cam.MV_CC_GetOneFrameTimeout(
                ctypes.byref(self._data_buf), BUF_SIZE, self._frame_info, 2000
            )
            if ret != 0:
                return None
            h = self._frame_info.nHeight
            w = self._frame_info.nWidth
            frame_len = self._frame_info.nFrameLen
            raw = np.frombuffer(self._data_buf, count=frame_len, dtype=np.uint8)
            if frame_len == h * w:
                return cv2.cvtColor(raw.reshape((h, w)), cv2.COLOR_BayerBG2BGR)
            return raw.reshape((h, w, 3))

    def _demo_frame(self, label: str, color: tuple) -> np.ndarray:
        """Generates a synthetic frame for demo / testing when cameras are absent."""
        self._demo_counter += 1
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (30, 30, 40)
        cv2.putText(frame, f"DEMO — {label}", (40, 220), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
        cv2.putText(frame, f"frame {self._demo_counter}", (40, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1)
        # Fake moving bounding box
        t = self._demo_counter % 120
        x = 100 + int(80 * abs(t - 60) / 60)
        cv2.rectangle(frame, (x, 150), (x + 200, 350), color, 2)
        return frame

    def grab_pair(self) -> tuple[np.ndarray, np.ndarray]:
        """Return (top_frame, side_frame) — blocking, ~15 fps rate."""
        if DEMO_MODE:
            time.sleep(1 / 15)
            return (
                self._demo_frame("TOP VIEW", (0, 255, 100)),
                self._demo_frame("SIDE VIEW", (0, 180, 255)),
            )
        top  = self._grab_one("top")
        side = self._grab_one("side")
        if top is None:
            top = self._demo_frame("TOP (no frame)", (100, 100, 255))
        if side is None:
            side = self._demo_frame("SIDE (no frame)", (100, 100, 255))
        return top, side

    def shutdown(self):
        for cam in self._cameras.values():
            cam.MV_CC_StopGrabbing()
            cam.MV_CC_CloseDevice()
            cam.MV_CC_DestroyHandle()
        self._cameras.clear()
        print("[CAM] Cameras closed.")
