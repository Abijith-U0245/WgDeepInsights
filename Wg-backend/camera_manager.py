"""
camera_manager.py — Singleton Hikrobot GigE camera manager.

Keeps both cameras open for the lifetime of the server process so every
part script can grab frames without re-initialising hardware.
Includes continuous background frame caching to support smooth concurrent MJPEG web streams.
"""

import sys
import ctypes
import threading
import time
import os
import numpy as np
import cv2

# ── MVS SDK path ──────────────────────────────────────────────────────────────
_MVS_PATHS = [
    r"C:\Program Files (x86)\MVS\Development\Samples\Python",
    r"C:\Program Files (x86)\MVS\Development\Samples\Python\MvImport",
    r"C:\Program Files\MVS\Development\Samples\Python",
    r"C:\Program Files\MVS\Development\Samples\Python\MvImport",
    r"./MvImport",
]
for p in _MVS_PATHS:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

DEMO_MODE = False  # set True if cameras are not attached (returns synthetic frames)

try:
    from MvCameraControl_class import (
        MV_CC_DEVICE_INFO_LIST,
        MV_CC_DEVICE_INFO,
        MvCamera,
        MV_GIGE_DEVICE,
        MV_ACCESS_Exclusive,
        MV_ACCESS_Control,
        MV_TRIGGER_MODE_OFF,
        MV_FRAME_OUT_INFO_EX,
    )
    _MVS_AVAILABLE = True
except ImportError:
    try:
        from MvImport.MvCameraControl_class import (
            MV_CC_DEVICE_INFO_LIST,
            MV_CC_DEVICE_INFO,
            MvCamera,
            MV_GIGE_DEVICE,
            MV_ACCESS_Exclusive,
            MV_ACCESS_Control,
            MV_TRIGGER_MODE_OFF,
            MV_FRAME_OUT_INFO_EX,
        )
        _MVS_AVAILABLE = True
    except ImportError:
        print("[WARN] MvImport not found — running in DEMO MODE (synthetic frames)")
        DEMO_MODE = True
        _MVS_AVAILABLE = False


TOP_CAM_SERIAL  = os.environ.get("GIGE_TOP_SERIAL",  "DA5211006")
SIDE_CAM_SERIAL = os.environ.get("GIGE_SIDE_SERIAL", "DA4265515")

BUF_SIZE = 4000 * 3000 * 3  # worst-case 4K RGB buffer


class CameraManager:
    """Thread-safe singleton that owns both GigE cameras with background caching for live streams."""

    _instance: "CameraManager | None" = None
    _lock = threading.Lock()

    def __init__(self):
        global DEMO_MODE
        self._cam_lock = threading.Lock()
        self._cameras: dict[str, MvCamera] = {}        # "top" | "side" → MvCamera
        self._top_buf = (ctypes.c_ubyte * BUF_SIZE)()
        self._side_buf = (ctypes.c_ubyte * BUF_SIZE)()
        self._top_info = MV_FRAME_OUT_INFO_EX() if _MVS_AVAILABLE else None
        self._side_info = MV_FRAME_OUT_INFO_EX() if _MVS_AVAILABLE else None
        self._demo_counter = 0

        # Non-blocking live stream cache
        self._cache_lock = threading.Lock()
        self._latest_top: "np.ndarray | None" = None
        self._latest_side: "np.ndarray | None" = None
        self._running = True

        if not DEMO_MODE:
            self._open_cameras()

        # Start continuous background grab thread if hardware cameras connected
        if not DEMO_MODE and len(self._cameras) > 0:
            self._bg_thread = threading.Thread(target=self._bg_grab_loop, daemon=True)
            self._bg_thread.start()
            print("[CAM] Background frame caching thread started.")

    @classmethod
    def instance(cls) -> "CameraManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── internal ──────────────────────────────────────────────────────────────

    def _open_cameras(self):
        global DEMO_MODE
        device_list = MV_CC_DEVICE_INFO_LIST()
        ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
        if ret != 0 or device_list.nDeviceNum < 1:
            print("[WARN] No Hikrobot cameras found — falling back to DEMO MODE")
            DEMO_MODE = True
            return

        print(f"[CAM] Found {device_list.nDeviceNum} GigE device(s). Enumerating serial numbers...")

        found_serials = []
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

            found_serials.append(serial)
            print(f"[CAM] Device #{i}: Serial '{serial}'")

            cam = MvCamera()
            r_create = cam.MV_CC_CreateHandle(info)
            if r_create != 0:
                print(f"[CAM] Failed CreateHandle for serial {serial}: 0x{r_create:x}")
                continue

            r_open = cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)
            if r_open != 0:
                print(f"[CAM] Exclusive OpenDevice failed for serial {serial} (0x{r_open:x}), trying Control mode...")
                r_open = cam.MV_CC_OpenDevice(MV_ACCESS_Control, 0)

            if r_open != 0:
                print(f"[CAM] Failed OpenDevice for serial {serial}: 0x{r_open:x}")
                try:
                    cam.MV_CC_DestroyHandle()
                except Exception:
                    pass
                continue

            pkt = cam.MV_CC_GetOptimalPacketSize()
            if int(pkt) > 0:
                cam.MV_CC_SetIntValue("GevSCPSPacketSize", pkt)

            cam.MV_CC_SetIntValue("GevSCPD", 1000)
            cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
            cam.MV_CC_SetFloatValue("AcquisitionFrameRate", 20.0)
            cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)

            if serial == TOP_CAM_SERIAL:
                cam.MV_CC_StartGrabbing()
                self._cameras["top"] = cam
                print(f"[CAM] Top camera ready ({serial})")

            elif serial == SIDE_CAM_SERIAL:
                cam.MV_CC_StartGrabbing()
                self._cameras["side"] = cam
                print(f"[CAM] Side camera ready ({serial})")

            else:
                cam.MV_CC_StartGrabbing()
                if "top" not in self._cameras:
                    self._cameras["top"] = cam
                    print(f"[CAM] Top camera assigned via index ({serial})")
                elif "side" not in self._cameras:
                    self._cameras["side"] = cam
                    print(f"[CAM] Side camera assigned via index ({serial})")

        # Fallback index mapping if serials didn't match directly but cameras present
        if "top" in self._cameras or "side" in self._cameras:
            DEMO_MODE = False
            print(f"[CAM] Physical cameras active: {list(self._cameras.keys())}")
        else:
            print("[WARN] Could not open physical cameras — DEMO MODE active")
            DEMO_MODE = True

    def _grab_one(self, which: str) -> np.ndarray | None:
        cam = self._cameras.get(which)
        if cam is None:
            return None
        buf = self._top_buf if which == "top" else self._side_buf
        info = self._top_info if which == "top" else self._side_info
        if info is None:
            return None
        with self._cam_lock:
            ret = cam.MV_CC_GetOneFrameTimeout(
                ctypes.byref(buf), BUF_SIZE, info, 300
            )
            if ret != 0:
                return None
            h = info.nHeight
            w = info.nWidth
            frame_len = info.nFrameLen
            if frame_len == 0 or h == 0 or w == 0:
                return None
            raw = np.frombuffer(buf, count=frame_len, dtype=np.uint8)
            if frame_len == h * w:
                return cv2.cvtColor(raw.reshape((h, w)), cv2.COLOR_BayerBG2BGR)
            return raw.reshape((h, w, 3))

    def _bg_grab_loop(self):
        """Continuously grab frames from physical cameras and update live cache."""
        while self._running:
            try:
                top  = self._grab_one("top")
                side = self._grab_one("side")

                if top is None and DEMO_MODE:
                    top = self._demo_frame("TOP VIEW", (0, 255, 100))
                if side is None and DEMO_MODE:
                    side = self._demo_frame("SIDE VIEW", (0, 180, 255))

                with self._cache_lock:
                    if top is not None:
                        self._latest_top = top.copy()
                    if side is not None:
                        self._latest_side = side.copy()

            except Exception as e:
                print(f"[CAM] Background grab error: {e}")
            time.sleep(1 / 20)

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

    # ── public API ────────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return DEMO_MODE or ("top" in self._cameras and "side" in self._cameras) or len(self._cameras) > 0

    def set_parameters(self, part_name: str, mode: str = "measurement"):
        """Dynamically configure the exposure and gain for the specified part and mode."""
        if DEMO_MODE:
            return

        key = part_name.lower().replace("-", "").replace(" ", "")
        m_key = "inspect" if mode.lower() in ("inspect", "surface", "surfacedefect") else "measurement"

        # Preset exposure & gain settings for each part and mode
        presets = {
            "capnut": {
                "measurement": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 35000.0, "side_gain": 5.3132
                },
                "inspect": {
                    "top_exposure": 2000.0, "top_gain": 0.0,
                    "side_exposure": 35000.0, "side_gain": 5.3132
                }
            },
            "stud": {
                "measurement": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 30000.0, "side_gain": 5.3132
                },
                "inspect": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 30000.0, "side_gain": 5.3132
                }
            },
            "adapter": {
                "measurement": {
                    "top_exposure": 4274.0, "top_gain": 0.0,
                    "side_exposure": 33571.0, "side_gain": 6.3
                },
                "inspect": {
                    "top_exposure": 4274.0, "top_gain": 0.0,
                    "side_exposure": 33571.0, "side_gain": 6.3
                }
            },
            "adaptor": {
                "measurement": {
                    "top_exposure": 4274.0, "top_gain": 0.0,
                    "side_exposure": 33571.0, "side_gain": 6.3
                },
                "inspect": {
                    "top_exposure": 4274.0, "top_gain": 0.0,
                    "side_exposure": 33571.0, "side_gain": 6.3
                }
            },
            "pin": {
                "measurement": {
                    "top_exposure": 2000.0, "top_gain": 0.0,
                    "side_exposure": 29500.0, "side_gain": 4.0
                },
                "inspect": {
                    "top_exposure": 2000.0, "top_gain": 0.0,
                    "side_exposure": 35000.0, "side_gain": 7.0
                }
            }
        }

        part_presets = presets.get(key)
        if not part_presets:
            return

        p = part_presets.get(m_key, part_presets["measurement"])

        with self._cam_lock:
            top_cam = self._cameras.get("top")
            side_cam = self._cameras.get("side")

            if top_cam:
                try:
                    top_cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                    top_cam.MV_CC_SetEnumValue("GainAuto", 0)
                    top_cam.MV_CC_SetFloatValue("ExposureTime", p["top_exposure"])
                    top_cam.MV_CC_SetFloatValue("Gain", p["top_gain"])
                    print(f"[CAM] Set top camera params for {key}: exp={p['top_exposure']}, gain={p['top_gain']}")
                except Exception as e:
                    print(f"[CAM] Failed to set top parameters for {key}: {e}")

            if side_cam:
                try:
                    side_cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                    side_cam.MV_CC_SetEnumValue("GainAuto", 0)
                    side_cam.MV_CC_SetFloatValue("ExposureTime", p["side_exposure"])
                    side_cam.MV_CC_SetFloatValue("Gain", p["side_gain"])
                    print(f"[CAM] Set side camera params for {key}: exp={p['side_exposure']}, gain={p['side_gain']}")
                except Exception as e:
                    print(f"[CAM] Failed to set side parameters for {key}: {e}")

    def grab_pair(self) -> tuple[np.ndarray, np.ndarray]:
        """Return (top_frame, side_frame) — non-blocking cached reads for high-speed streaming."""
        if DEMO_MODE:
            time.sleep(1 / 15)
            return (
                self._demo_frame("TOP VIEW", (0, 255, 100)),
                self._demo_frame("SIDE VIEW", (0, 180, 255)),
            )

        with self._cache_lock:
            top  = self._latest_top.copy()  if self._latest_top  is not None else self._demo_frame("TOP (initializing)",  (100, 100, 255))
            side = self._latest_side.copy() if self._latest_side is not None else self._demo_frame("SIDE (initializing)", (100, 100, 255))

        return top, side

    def shutdown(self):
        self._running = False
        with self._cam_lock:
            for cam in self._cameras.values():
                try:
                    cam.MV_CC_StopGrabbing()
                    cam.MV_CC_CloseDevice()
                    cam.MV_CC_DestroyHandle()
                except Exception:
                    pass
            self._cameras.clear()
        print("[CAM] Cameras closed.")
