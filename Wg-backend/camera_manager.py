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
        MVCC_INTVALUE,
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
            MVCC_INTVALUE,
        )
        _MVS_AVAILABLE = True
    except ImportError:
        print("[WARN] MvImport not found — running in DEMO MODE (synthetic frames)")
        DEMO_MODE = True
        _MVS_AVAILABLE = False


TOP_CAM_SERIAL   = os.environ.get("GIGE_TOP_SERIAL",   "DB0763438")  # Box 1: TOP camera (IP: 10.10.12.6)
SIDE_CAM_SERIAL  = os.environ.get("GIGE_SIDE_SERIAL",  "DB0763412")  # Box 2: LEFT side camera (IP: 10.10.12.2)
RIGHT_CAM_SERIAL = os.environ.get("GIGE_RIGHT_SERIAL", "DB1473979")  # Box 3: RIGHT side camera (IP: 10.10.12.1)

BUF_SIZE = 4000 * 3000 * 3  # worst-case 4K RGB buffer


class CameraManager:
    """Thread-safe singleton that owns both GigE cameras with background caching for live streams."""

    _instance: "CameraManager | None" = None
    _lock = threading.Lock()

    def __init__(self):
        global DEMO_MODE
        self._cam_lock = threading.Lock()
        self._cam_locks = {
            "top": threading.Lock(),
            "side": threading.Lock(),
            "right": threading.Lock(),
        }
        self._cameras: dict[str, MvCamera] = {}        # "top" | "side" | "right" → MvCamera
        self._top_buf   = (ctypes.c_ubyte * BUF_SIZE)()
        self._side_buf  = (ctypes.c_ubyte * BUF_SIZE)()
        self._right_buf = (ctypes.c_ubyte * BUF_SIZE)()
        self._top_info   = MV_FRAME_OUT_INFO_EX() if _MVS_AVAILABLE else None
        self._side_info  = MV_FRAME_OUT_INFO_EX() if _MVS_AVAILABLE else None
        self._right_info = MV_FRAME_OUT_INFO_EX() if _MVS_AVAILABLE else None
        self._demo_counter = 0

        # Non-blocking live stream cache (both full-res and fast 640x640 display)
        self._cache_lock = threading.Lock()
        self._latest_top:           "np.ndarray | None" = None
        self._latest_side:          "np.ndarray | None" = None
        self._latest_right:         "np.ndarray | None" = None
        self._latest_top_display:   "np.ndarray | None" = None
        self._latest_side_display:  "np.ndarray | None" = None
        self._latest_right_display: "np.ndarray | None" = None
        self._current_params: "tuple[str, str] | None" = None
        self._last_error_log: dict[str, float] = {}
        self._logged_resolutions: set[str] = set()
        self._running = True

        if not DEMO_MODE:
            self._open_cameras()

        # Start independent background worker threads per camera for zero-lag streaming
        if not DEMO_MODE and len(self._cameras) > 0:
            for which in ("top", "side", "right"):
                t = threading.Thread(target=self._worker_loop, args=(which,), daemon=True)
                t.start()
            print(f"[CAM] Multi-threaded camera grab workers started for: {list(self._cameras.keys())}")

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
        opened_devices: list[tuple[str, MvCamera]] = []
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

            # GigE packet delay to prevent packet collisions across multiple cameras on 1Gbps link
            cam.MV_CC_SetIntValue("GevSCPD", 2500)
            cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
            cam.MV_CC_SetFloatValue("AcquisitionFrameRate", 20.0)
            cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)

            # ── Restore 100% Full Native Sensor Frame (Zero Cropping / No Half Frame) ──
            try:
                # 1. Reset Offsets to 0 first so Width and Height can expand to maximum
                cam.MV_CC_SetIntValue("OffsetX", 0)
                cam.MV_CC_SetIntValue("OffsetY", 0)

                if _MVS_AVAILABLE:
                    max_w = None
                    max_h = None

                    # Query maximum sensor width (pass st_w directly, MV_CC_GetIntValue calls byref internally)
                    st_w = MVCC_INTVALUE()
                    if cam.MV_CC_GetIntValue("WidthMax", st_w) == 0 and st_w.nCurValue > 0:
                        max_w = int(st_w.nCurValue)
                    elif cam.MV_CC_GetIntValue("Width", st_w) == 0 and st_w.nMax > 0:
                        max_w = int(st_w.nMax)

                    # Query maximum sensor height (pass st_h directly, MV_CC_GetIntValue calls byref internally)
                    st_h = MVCC_INTVALUE()
                    if cam.MV_CC_GetIntValue("HeightMax", st_h) == 0 and st_h.nCurValue > 0:
                        max_h = int(st_h.nCurValue)
                    elif cam.MV_CC_GetIntValue("Height", st_h) == 0 and st_h.nMax > 0:
                        max_h = int(st_h.nMax)

                    if max_w and max_h:
                        rw = cam.MV_CC_SetIntValue("Width", max_w)
                        rh = cam.MV_CC_SetIntValue("Height", max_h)
                        print(f"[CAM] Restored FULL sensor field of view for '{serial}': {max_w}x{max_h} (rw={rw:#x}, rh={rh:#x})")
                    else:
                        print(f"[CAM] Max dimension query for '{serial}': max_w={max_w}, max_h={max_h}")
            except Exception as e:
                print(f"[CAM] Resetting to full sensor on {serial}: {e}")

            opened_devices.append((serial, cam))

        # ── Deterministic Camera Role Assignment ────────────────────────────
        # Box 1 (CAM 1) = TOP View        (Physical TOP camera: DB0763438)
        # Box 2 (CAM 2) = LEFT SIDE View  (Physical LEFT camera: DB0763412, 180° Rotated)
        # Box 3 (CAM 3) = RIGHT SIDE View (Physical RIGHT camera: DB1473979, 180° Rotated)
        remaining: list[tuple[str, MvCamera]] = []
        for serial, cam in opened_devices:
            if serial == TOP_CAM_SERIAL and "top" not in self._cameras:
                self._cameras["top"] = cam
                print(f"[CAM] Box 1 -> LOCKED to TOP camera ({serial})")
            elif serial == SIDE_CAM_SERIAL and "side" not in self._cameras:
                self._cameras["side"] = cam
                print(f"[CAM] Box 2 -> LOCKED to LEFT SIDE camera ({serial})")
            elif serial == RIGHT_CAM_SERIAL and "right" not in self._cameras:
                self._cameras["right"] = cam
                print(f"[CAM] Box 3 -> LOCKED to RIGHT camera ({serial})")
            else:
                remaining.append((serial, cam))

        # Assign any remaining cameras to unfilled roles in order: top -> side (left) -> right
        for serial, cam in remaining:
            if "top" not in self._cameras:
                self._cameras["top"] = cam
                print(f"[CAM] Box 1 -> Assigned to TOP camera ({serial})")
            elif "side" not in self._cameras:
                self._cameras["side"] = cam
                print(f"[CAM] Box 2 -> Assigned to LEFT SIDE camera ({serial})")
            elif "right" not in self._cameras:
                self._cameras["right"] = cam
                print(f"[CAM] Box 3 -> Assigned to RIGHT SIDE camera ({serial})")

        # ── Start Grabbing with Role-Specific Exposure & Gain ────────────────
        if "top" in self._cameras:
            c = self._cameras["top"]
            try:
                c.MV_CC_SetEnumValue("ExposureAuto", 0)
                c.MV_CC_SetEnumValue("GainAuto", 0)
                c.MV_CC_SetFloatValue("ExposureTime", 3500.0)
                c.MV_CC_SetFloatValue("Gain", 1.5)
            except Exception as e:
                print(f"[CAM] Top exposure init error: {e}")
            c.MV_CC_StartGrabbing()
            print("[CAM] Box 1 (TOP VIEW) active with 3500us exposure")

        if "side" in self._cameras:
            c = self._cameras["side"]
            try:
                c.MV_CC_SetEnumValue("ExposureAuto", 0)
                c.MV_CC_SetEnumValue("GainAuto", 0)
                c.MV_CC_SetFloatValue("ExposureTime", 75000.0)
                c.MV_CC_SetFloatValue("Gain", 5.3132)
            except Exception as e:
                print(f"[CAM] Left side exposure init error: {e}")
            c.MV_CC_StartGrabbing()
            print("[CAM] Box 2 (LEFT SIDE VIEW) active with 75000us exposure")

        if "right" in self._cameras:
            c = self._cameras["right"]
            try:
                c.MV_CC_SetEnumValue("ExposureAuto", 0)
                c.MV_CC_SetEnumValue("GainAuto", 0)
                c.MV_CC_SetFloatValue("ExposureTime", 75000.0)
                c.MV_CC_SetFloatValue("Gain", 5.3132)
            except Exception as e:
                print(f"[CAM] Right side exposure init error: {e}")
            c.MV_CC_StartGrabbing()
            print("[CAM] Box 3 (RIGHT SIDE VIEW) active with 75000us exposure")

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
        if which == "top":
            buf, info = self._top_buf, self._top_info
        elif which == "right":
            buf, info = self._right_buf, self._right_info
        else:
            buf, info = self._side_buf, self._side_info
        if info is None:
            return None
        lock = self._cam_locks.get(which, self._cam_lock)
        with lock:
            # 1000ms timeout ensures long exposures (e.g. 75ms) never timeout
            ret = cam.MV_CC_GetOneFrameTimeout(
                ctypes.byref(buf), BUF_SIZE, info, 1000
            )
            if ret != 0:
                now = time.time()
                if now - self._last_error_log.get(which, 0) > 5.0:
                    print(f"[CAM] {which} frame grab status: 0x{ret:08X}")
                    self._last_error_log[which] = now
                return None

            h = info.nHeight
            w = info.nWidth
            frame_len = info.nFrameLen
            if frame_len == 0 or h == 0 or w == 0:
                return None

            if which not in self._logged_resolutions:
                self._logged_resolutions.add(which)
                print(f"[CAM] {which.upper()} stream ACTIVE: Full sensor frame = {w}x{h}")

            raw = np.frombuffer(buf, count=frame_len, dtype=np.uint8)

            try:
                if frame_len == h * w:
                    try:
                        return cv2.cvtColor(raw.reshape((h, w)), cv2.COLOR_BayerBG2BGR)
                    except Exception:
                        return cv2.cvtColor(raw.reshape((h, w)), cv2.COLOR_GRAY2BGR)
                elif frame_len == h * w * 3:
                    return raw.reshape((h, w, 3))
                elif frame_len == h * w * 2:
                    return cv2.cvtColor(raw.reshape((h, w, 2)), cv2.COLOR_YUV2BGR_YUYV)
                else:
                    return raw.reshape((h, w, -1))[:, :, :3]
            except Exception as conv_e:
                print(f"[CAM] Frame conversion error for {which}: {conv_e} (len={frame_len}, {w}x{h})")
                return None

    def _worker_loop(self, which: str):
        """Dedicated high-speed grab loop per camera to guarantee zero stream latency."""
        while self._running:
            try:
                if which not in self._cameras:
                    time.sleep(0.05)
                    continue

                frame = self._grab_one(which)
                if frame is not None:
                    # Rotate upside down 180 deg for both side cameras (left and right)
                    if which in ("side", "right"):
                        frame = cv2.rotate(frame, cv2.ROTATE_180)

                    # Keep full native sensor frame intact (never crop or distort aspect ratio)
                    # Downscale for live UI display while strictly preserving sensor aspect ratio
                    fh, fw = frame.shape[:2]
                    target_w = 640
                    target_h = max(1, int(target_w * fh / fw))
                    display = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)

                    with self._cache_lock:
                        if which == "top":
                            self._latest_top = frame
                            self._latest_top_display = display
                        elif which == "side":
                            self._latest_side = frame
                            self._latest_side_display = display
                        elif which == "right":
                            self._latest_right = frame
                            self._latest_right_display = display
                    time.sleep(0.002)
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"[CAM] Worker error on {which}: {e}")
                time.sleep(0.05)

    def _demo_frame(self, label: str, color: tuple) -> np.ndarray:
        """Generates a clean, professional live stream view for demo / testing when hardware cameras are disconnected."""
        self._demo_counter += 1
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (15, 23, 42)  # Dark slate background #0F172A

        # Grid lines / reticle
        cv2.line(frame, (320, 40), (320, 440), (30, 41, 59), 1)
        cv2.line(frame, (40, 240), (600, 240), (30, 41, 59), 1)
        cv2.circle(frame, (320, 240), 120, (30, 41, 59), 1)

        # Header banner
        cv2.rectangle(frame, (0, 0), (640, 36), (30, 41, 59), -1)
        cv2.putText(frame, f"LIVE FEED — {label.upper()}", (15, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (56, 189, 248), 1, cv2.LINE_AA)
        
        # Status indicator
        cv2.circle(frame, (615, 18), 6, (16, 185, 129), -1)
        cv2.putText(frame, "ONLINE", (550, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (16, 185, 129), 1, cv2.LINE_AA)

        # Bounding box simulation
        t = self._demo_counter % 90
        box_color = (245, 158, 11) if "SIDE" in label.upper() else (16, 185, 129)
        cv2.rectangle(frame, (200, 140), (440, 340), box_color, 2)
        cv2.putText(frame, "INSPECTION ROI • READY", (210, 132), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color, 1, cv2.LINE_AA)

        # Footer stats
        cv2.rectangle(frame, (0, 448), (640, 480), (2, 6, 23), -1)
        cv2.putText(frame, f"CAM: GigE-Vision | RES: 1920x1080 | FPS: 20 | FRAME: #{self._demo_counter}", (15, 469), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (148, 163, 184), 1, cv2.LINE_AA)

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

        if self._current_params == (key, m_key):
            return  # Already set to these params — avoid blocking camera locks & network roundtrips

        # Preset exposure & gain settings for each part and mode
        presets = {
            "capnut": {
                "measurement": {
                    "top_exposure": 3500.0, "top_gain": 1.5,
                    "side_exposure": 75000.0, "side_gain": 5.3132,
                    "right_exposure": 75000.0, "right_gain": 5.3132,
                },
                "inspect": {
                    "top_exposure": 3500.0, "top_gain": 1.5,
                    "side_exposure": 75000.0, "side_gain": 5.3132,
                    "right_exposure": 75000.0, "right_gain": 5.3132,
                }
            },
            "stud": {
                "measurement": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 30000.0, "side_gain": 5.3132,
                    "right_exposure": 30000.0, "right_gain": 5.3132,
                },
                "inspect": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 30000.0, "side_gain": 5.3132,
                    "right_exposure": 30000.0, "right_gain": 5.3132,
                }
            },
            "adapter": {
                "measurement": {
                    "top_exposure": 4274.0, "top_gain": 1.0,
                    "side_exposure": 33571.0, "side_gain": 6.3,
                    "right_exposure": 33571.0, "right_gain": 6.3,
                },
                "inspect": {
                    "top_exposure": 4274.0, "top_gain": 1.0,
                    "side_exposure": 33571.0, "side_gain": 6.3,
                    "right_exposure": 33571.0, "right_gain": 6.3,
                }
            },
            "adaptor": {
                "measurement": {
                    "top_exposure": 4274.0, "top_gain": 1.0,
                    "side_exposure": 33571.0, "side_gain": 6.3,
                    "right_exposure": 33571.0, "right_gain": 6.3,
                },
                "inspect": {
                    "top_exposure": 4274.0, "top_gain": 1.0,
                    "side_exposure": 33571.0, "side_gain": 6.3,
                    "right_exposure": 33571.0, "right_gain": 6.3,
                }
            },
            "pin": {
                "measurement": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 35000.0, "side_gain": 7.0,
                    "right_exposure": 35000.0, "right_gain": 7.0,
                },
                "inspect": {
                    "top_exposure": 3000.0, "top_gain": 1.0,
                    "side_exposure": 35000.0, "side_gain": 7.0,
                    "right_exposure": 35000.0, "right_gain": 7.0,
                }
            }
        }

        part_presets = presets.get(key)
        if not part_presets:
            return

        p = part_presets.get(m_key, part_presets["measurement"])

        top_cam   = self._cameras.get("top")
        side_cam  = self._cameras.get("side")
        right_cam = self._cameras.get("right")

        if top_cam:
            with self._cam_locks.get("top", self._cam_lock):
                try:
                    top_cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                    top_cam.MV_CC_SetEnumValue("GainAuto", 0)
                    top_cam.MV_CC_SetFloatValue("ExposureTime", float(p["top_exposure"]))
                    top_cam.MV_CC_SetFloatValue("Gain", float(p["top_gain"]))
                    print(f"[CAM] Set top camera params for {key}: exp={p['top_exposure']}, gain={p['top_gain']}")
                except Exception as e:
                    print(f"[CAM] Failed to set top parameters for {key}: {e}")

        if side_cam:
            with self._cam_locks.get("side", self._cam_lock):
                try:
                    side_cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                    side_cam.MV_CC_SetEnumValue("GainAuto", 0)
                    side_cam.MV_CC_SetFloatValue("ExposureTime", float(p["side_exposure"]))
                    side_cam.MV_CC_SetFloatValue("Gain", float(p["side_gain"]))
                    print(f"[CAM] Set side camera params for {key}: exp={p['side_exposure']}, gain={p['side_gain']}")
                except Exception as e:
                    print(f"[CAM] Failed to set side parameters for {key}: {e}")

        if right_cam:
            with self._cam_locks.get("right", self._cam_lock):
                try:
                    r_exp = p.get("right_exposure", p.get("side_exposure", 75000.0))
                    r_gain = p.get("right_gain", p.get("side_gain", 5.3132))
                    right_cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                    right_cam.MV_CC_SetEnumValue("GainAuto", 0)
                    right_cam.MV_CC_SetFloatValue("ExposureTime", float(r_exp))
                    right_cam.MV_CC_SetFloatValue("Gain", float(r_gain))
                    print(f"[CAM] Set right camera params for {key}: exp={r_exp}, gain={r_gain}")
                except Exception as e:
                    print(f"[CAM] Failed to set right parameters for {key}: {e}")

        self._current_params = (key, m_key)

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

    def grab_top(self) -> np.ndarray:
        """Return the latest full-res top-camera frame for measurement/defect detection."""
        if DEMO_MODE:
            return self._demo_frame("TOP VIEW", (0, 255, 100))
        with self._cache_lock:
            if self._latest_top is not None:
                return self._latest_top.copy()
        return self._demo_frame("TOP (initializing)", (100, 100, 255))

    def grab_top_display(self) -> np.ndarray:
        """Return pre-scaled display frame for instant, zero-CPU live video streaming."""
        if DEMO_MODE:
            return self._demo_frame("TOP VIEW", (0, 255, 100))
        with self._cache_lock:
            if self._latest_top_display is not None:
                return self._latest_top_display.copy()
            if self._latest_top is not None:
                fh, fw = self._latest_top.shape[:2]
                th = max(1, int(640 * fh / fw))
                return cv2.resize(self._latest_top, (640, th), interpolation=cv2.INTER_AREA)
        return self._demo_frame("TOP (initializing)", (100, 100, 255))

    def grab_side(self) -> np.ndarray:
        """Return the latest full-res side-camera frame for measurement/defect detection."""
        if DEMO_MODE:
            return self._demo_frame("SIDE VIEW", (0, 180, 255))
        with self._cache_lock:
            if self._latest_side is not None:
                return self._latest_side.copy()
        return self._demo_frame("SIDE (initializing)", (100, 100, 255))

    def grab_side_display(self) -> np.ndarray:
        """Return pre-scaled display frame for instant, zero-CPU live video streaming."""
        if DEMO_MODE:
            return self._demo_frame("SIDE VIEW", (0, 180, 255))
        with self._cache_lock:
            if self._latest_side_display is not None:
                return self._latest_side_display.copy()
            if self._latest_side is not None:
                fh, fw = self._latest_side.shape[:2]
                th = max(1, int(640 * fh / fw))
                return cv2.resize(self._latest_side, (640, th), interpolation=cv2.INTER_AREA)
        return self._demo_frame("SIDE (initializing)", (100, 100, 255))

    def grab_right(self) -> np.ndarray:
        """Return the latest full-res right-camera frame for snapshot capture."""
        if DEMO_MODE:
            return self._demo_frame("RIGHT SIDE VIEW", (180, 100, 255))
        with self._cache_lock:
            if self._latest_right is not None:
                return self._latest_right.copy()
        return self.grab_right_display()

    def grab_right_display(self) -> np.ndarray:
        """Return pre-scaled display frame for instant, zero-CPU live video streaming."""
        if DEMO_MODE:
            return self._demo_frame("RIGHT SIDE VIEW", (180, 100, 255))
        with self._cache_lock:
            if self._latest_right_display is not None:
                return self._latest_right_display.copy()
            if self._latest_right is not None:
                fh, fw = self._latest_right.shape[:2]
                th = max(1, int(640 * fh / fw))
                return cv2.resize(self._latest_right, (640, th), interpolation=cv2.INTER_AREA)

        # No 3rd physical camera — return a "No Signal" placeholder frame
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (15, 23, 42)
        cv2.rectangle(frame, (0, 0), (640, 36), (30, 41, 59), -1)
        cv2.putText(frame, "LIVE FEED — RIGHT SIDE VIEW", (15, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (56, 189, 248), 1, cv2.LINE_AA)
        cv2.putText(frame, "CAM 3 — Connecting...", (200, 230),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (148, 163, 184), 1, cv2.LINE_AA)
        cv2.putText(frame, "Waiting for right-side camera signal", (155, 265),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 116, 139), 1, cv2.LINE_AA)
        cv2.rectangle(frame, (0, 448), (640, 480), (2, 6, 23), -1)
        cv2.putText(frame, "Check GigE network / IP configuration", (140, 469),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (100, 116, 139), 1, cv2.LINE_AA)
        return frame

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
