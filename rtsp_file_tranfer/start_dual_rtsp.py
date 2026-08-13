"""
start_dual_rtsp.py — Hikrobot dual-camera RTSP publisher (LAP side).

Opens BOTH GigE cameras by serial number, grabs frames via the MVS SDK,
and pushes each to MediaMTX as separate RTSP streams:

    rtsp://<LAP_IP>:8554/top   ← Top camera  (serial DA5211006)
    rtsp://<LAP_IP>:8554/side  ← Side camera (serial DA4265515)

The SBU board (or any RTSP client on the same LAN) can then pull these streams.

Usage (on LAP, run MediaMTX first):
    mediamtx.exe           # in a separate terminal from rtsp_file_tranfer/
    python start_dual_rtsp.py [--fps 5] [--width 1280] [--height 720]
    python start_dual_rtsp.py --top-serial DA5211006 --side-serial DA4265515

Press Ctrl+C to stop both streams cleanly.
"""

import argparse
import shutil
import subprocess
import sys
import threading
import time
from ctypes import *
from pathlib import Path

import cv2
import numpy as np

# ── MVS SDK import ─────────────────────────────────────────────────────────────
MVS_IMPORT_DIRS = [
    Path(r"C:\Program Files (x86)\MVS\Development\Samples\Python\MvImport"),
    Path("/opt/MVS/Samples/64/Python/MvImport"),
    Path("/opt/MVS/Development/Samples/Python/MvImport"),
    Path(__file__).resolve().parent / "MvImport",
]

for p in MVS_IMPORT_DIRS:
    if p.exists():
        sys.path.append(str(p))
        break
else:
    raise FileNotFoundError(
        "MvImport SDK not found. Install Hikrobot MVS and add MvImport to path."
    )

from MvCameraControl_class import *
from CameraParams_header import *
from MvErrorDefine_const import *
from PixelType_header import *


# ── Camera serial numbers ───────────────────────────────────────────────────────
DEFAULT_TOP_SERIAL  = "DA5211006"
DEFAULT_SIDE_SERIAL = "DA4265515"

# Exposure / gain presets for each part type (used when set_part() is called)
# These mirror the values in Wg-backend/camera_manager.py
PART_PRESETS: dict[str, dict] = {
    "capnut":  {"top_exposure": 3000.0, "top_gain": 1.0,  "side_exposure": 35000.0, "side_gain": 5.3132},
    "stud":    {"top_exposure": 3000.0, "top_gain": 1.0,  "side_exposure": 30000.0, "side_gain": 5.3132},
    "adapter": {"top_exposure": 2000.0, "top_gain": 0.0,  "side_exposure": 35000.0, "side_gain": 7.0},
    "adaptor": {"top_exposure": 2000.0, "top_gain": 0.0,  "side_exposure": 35000.0, "side_gain": 7.0},
    "pin":     {"top_exposure": 2000.0, "top_gain": 0.0,  "side_exposure": 35000.0, "side_gain": 7.3132},
}


# ── Utility helpers ─────────────────────────────────────────────────────────────

def check_ret(ret, action):
    if ret != 0:
        raise RuntimeError(f"{action} failed: 0x{ret:x}")


def int_to_ip(ip_int: int) -> str:
    return ".".join(str((ip_int >> s) & 0xFF) for s in (24, 16, 8, 0))


def serial_from_info(info) -> str:
    s = ""
    for ch in info.SpecialInfo.stGigEInfo.chSerialNumber:
        if ch == 0:
            break
        s += chr(ch)
    return s


# ── HikrobotCamera ─────────────────────────────────────────────────────────────

class HikrobotCamera:
    """Opens a single GigE camera by serial number and streams frames."""

    def __init__(self, serial: str, exposure: float, gain: float, fps: float):
        self.serial   = serial
        self.exposure = exposure
        self.gain     = gain
        self.fps      = fps
        self.cam      = MvCamera()
        self.opened   = False
        self._lock    = threading.Lock()

    def open(self):
        device_list = MV_CC_DEVICE_INFO_LIST()
        ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
        check_ret(ret, "Enum devices")

        if device_list.nDeviceNum == 0:
            raise RuntimeError("No GigE cameras found on the network.")

        found_serials = []
        target_info = None
        for i in range(device_list.nDeviceNum):
            info = cast(device_list.pDeviceInfo[i], POINTER(MV_CC_DEVICE_INFO)).contents
            if info.nTLayerType != MV_GIGE_DEVICE:
                continue
            s = serial_from_info(info)
            found_serials.append(s)
            if s == self.serial:
                target_info = info
                break

        if target_info is None:
            raise RuntimeError(
                f"Camera serial '{self.serial}' not found. Found: {found_serials}"
            )

        check_ret(self.cam.MV_CC_CreateHandle(target_info), "Create handle")
        check_ret(self.cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0), "Open camera")
        self.opened = True

        # Optimal packet size for GigE
        pkt = self.cam.MV_CC_GetOptimalPacketSize()
        if int(pkt) > 0:
            self.cam.MV_CC_SetIntValue("GevSCPSPacketSize", pkt)
        self.cam.MV_CC_SetIntValue("GevSCPD", 3000)

        # Disable trigger, set frame rate
        self.cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)
        self.cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
        self.cam.MV_CC_SetFloatValue("AcquisitionFrameRate", float(self.fps))

        # Exposure & gain
        self.cam.MV_CC_SetEnumValue("ExposureAuto", 0)
        self.cam.MV_CC_SetFloatValue("ExposureTime", float(self.exposure))
        self.cam.MV_CC_SetEnumValue("GainAuto", 0)
        self.cam.MV_CC_SetFloatValue("Gain", float(self.gain))

        # Pick best available pixel format
        for fmt in ["BayerRG8", "BayerGB8", "BayerGR8", "BayerBG8", "RGB8Packed", "BGR8Packed"]:
            if self.cam.MV_CC_SetEnumValueByString("PixelFormat", fmt) == 0:
                print(f"[CAM {self.serial}] PixelFormat: {fmt}")
                break

        check_ret(self.cam.MV_CC_StartGrabbing(), "Start grabbing")
        print(f"[CAM {self.serial}] Opened and grabbing.")

    def set_exposure_gain(self, exposure: float, gain: float):
        """Dynamically update exposure and gain (thread-safe)."""
        with self._lock:
            if not self.opened:
                return
            self.cam.MV_CC_SetEnumValue("ExposureAuto", 0)
            self.cam.MV_CC_SetFloatValue("ExposureTime", float(exposure))
            self.cam.MV_CC_SetEnumValue("GainAuto", 0)
            self.cam.MV_CC_SetFloatValue("Gain", float(gain))
            self.exposure = exposure
            self.gain     = gain

    def read(self) -> np.ndarray | None:
        """Grab one frame, return BGR numpy array or None on timeout."""
        frame_out = MV_FRAME_OUT()
        memset(byref(frame_out), 0, sizeof(frame_out))

        with self._lock:
            ret = self.cam.MV_CC_GetImageBuffer(frame_out, 1000)
            if ret != 0:
                return None

            try:
                info = frame_out.stFrameInfo
                w, h = info.nWidth, info.nHeight
                dst_size   = w * h * 3
                dst_buffer = (c_ubyte * dst_size)()

                cp = MV_CC_PIXEL_CONVERT_PARAM()
                memset(byref(cp), 0, sizeof(cp))
                cp.nWidth          = w
                cp.nHeight         = h
                cp.pSrcData        = frame_out.pBufAddr
                cp.nSrcDataLen     = info.nFrameLen
                cp.enSrcPixelType  = info.enPixelType
                cp.enDstPixelType  = PixelType_Gvsp_BGR8_Packed
                cp.pDstBuffer      = dst_buffer
                cp.nDstBufferSize  = dst_size

                check_ret(self.cam.MV_CC_ConvertPixelType(cp), "Convert pixel")
                return np.frombuffer(dst_buffer, dtype=np.uint8).reshape((h, w, 3)).copy()
            finally:
                self.cam.MV_CC_FreeImageBuffer(frame_out)

    def close(self):
        if not self.opened:
            return
        self.cam.MV_CC_StopGrabbing()
        self.cam.MV_CC_CloseDevice()
        self.cam.MV_CC_DestroyHandle()
        self.opened = False
        print(f"[CAM {self.serial}] Closed.")


# ── RTSPPublisher ───────────────────────────────────────────────────────────────

class RTSPPublisher:
    """Pushes raw BGR frames to an RTSP server (MediaMTX) via ffmpeg stdin pipe."""

    def __init__(self, rtsp_url: str, width: int, height: int, fps: int):
        self.rtsp_url = rtsp_url
        self.width    = width
        self.height   = height
        self.fps      = max(int(fps), 1)
        self.proc     = None

    def start(self):
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise FileNotFoundError(
                "ffmpeg not found. Install it: https://ffmpeg.org/download.html"
            )

        cmd = [
            ffmpeg,
            "-hide_banner", "-loglevel", "warning",
            "-f",       "rawvideo",
            "-pix_fmt", "bgr24",
            "-s",       f"{self.width}x{self.height}",
            "-r",       str(self.fps),
            "-i",       "pipe:0",
            "-an",
            "-c:v",     "libx264",
            "-preset",  "ultrafast",
            "-tune",    "zerolatency",
            "-profile:v", "baseline",
            "-pix_fmt", "yuv420p",
            "-g",       str(max(self.fps * 2, 10)),
            "-bf",      "0",
            "-f",       "rtsp",
            "-rtsp_transport", "tcp",
            self.rtsp_url,
        ]

        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        print(f"[RTSP] Publishing -> {self.rtsp_url}")

    def write(self, frame: np.ndarray):
        if self.proc is None or self.proc.stdin is None:
            return
        if self.proc.poll() is not None:
            print(f"[RTSP] ffmpeg exited for {self.rtsp_url}")
            return
        try:
            self.proc.stdin.write(frame.tobytes())
        except BrokenPipeError:
            print(f"[RTSP] Broken pipe for {self.rtsp_url}")

    def stop(self):
        if not self.proc:
            return
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
        except Exception:
            pass
        self.proc.terminate()
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        print(f"[RTSP] Stopped -> {self.rtsp_url}")


# ── Per-camera streaming thread ─────────────────────────────────────────────────

def stream_camera(
    camera:    HikrobotCamera,
    publisher: RTSPPublisher,
    label:     str,
    width:     int,
    height:    int,
    fps:       int,
    stop_evt:  threading.Event,
):
    """
    Worker thread: grab → resize → push loop.
    Runs until stop_evt is set or a fatal error occurs.
    """
    frame_interval = 1.0 / max(fps, 1)
    reconnect_delay = 2.0
    consecutive_failures = 0

    print(f"[{label}] Stream loop started.")
    while not stop_evt.is_set():
        loop_start = time.time()

        frame = camera.read()
        if frame is None:
            consecutive_failures += 1
            if consecutive_failures % 20 == 1:
                print(f"[{label}] WARNING: frame grab failed (x{consecutive_failures}), retrying…")
            time.sleep(0.05)
            continue

        consecutive_failures = 0

        # Resize to requested output resolution
        if frame.shape[1] != width or frame.shape[0] != height:
            frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)

        publisher.write(frame)

        elapsed = time.time() - loop_start
        sleep_t = frame_interval - elapsed
        if sleep_t > 0:
            time.sleep(sleep_t)

    print(f"[{label}] Stream loop ended.")


# ── Part-switching support ──────────────────────────────────────────────────────

def apply_part_preset(
    top_cam:  HikrobotCamera,
    side_cam: HikrobotCamera,
    part_key: str,
):
    """Apply exposure/gain preset for the given part key (e.g. 'capnut')."""
    p = PART_PRESETS.get(part_key.lower().replace("-", "").replace(" ", ""))
    if not p:
        print(f"[PRESET] Unknown part '{part_key}', keeping current settings.")
        return
    top_cam.set_exposure_gain(p["top_exposure"],  p["top_gain"])
    side_cam.set_exposure_gain(p["side_exposure"], p["side_gain"])
    print(f"[PRESET] Applied '{part_key}' preset -> "
          f"top exp={p['top_exposure']} gain={p['top_gain']}  "
          f"side exp={p['side_exposure']} gain={p['side_gain']}")


class SimulatedCamera:
    """Simulated GigE camera that generates synthetic frames when physical hardware is absent."""
    def __init__(self, serial: str, exposure: float, gain: float, fps: float):
        self.serial = serial
        self.exposure = exposure
        self.gain = gain
        self.fps = fps
        self.opened = False
        self._counter = 0
        self._lock = threading.Lock()

    def open(self):
        self.opened = True
        print(f"[Simulated CAM {self.serial}] Opened and generating synthetic frames.")

    def set_exposure_gain(self, exposure: float, gain: float):
        with self._lock:
            self.exposure = exposure
            self.gain = gain

    def read(self) -> np.ndarray | None:
        if not self.opened:
            return None
        with self._lock:
            self._counter += 1
            # Generate a 1280x720 synthetic frame
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            frame[:] = (20, 20, 25) # dark background

            # Draw some grids/patterns
            for i in range(0, 1280, 80):
                cv2.line(frame, (i, 0), (i, 720), (40, 40, 40), 1)
            for j in range(0, 720, 80):
                cv2.line(frame, (0, j), (1280, j), (40, 40, 40), 1)

            # Draw a simulated "part" in the center depending on the serial
            is_top = "5211006" in self.serial or "top" in self.serial.lower()
            label = "TOP CAMERA" if is_top else "SIDE CAMERA"
            color = (0, 255, 100) if is_top else (0, 180, 255)

            # Draw center alignment circle
            cv2.circle(frame, (640, 360), 200, (50, 50, 50), 2)
            cv2.circle(frame, (640, 360), 10, (0, 0, 255), -1)

            # Simulated part shape (moving slightly to simulate motion)
            t = self._counter % 100
            offset = int(10 * np.sin(t * 2 * np.pi / 100))
            if is_top:
                # Top view: draw a concentric hexagon/circle for capnut/stud
                cv2.circle(frame, (640 + offset, 360), 120, color, 3)
                # Draw internal thread circle
                cv2.circle(frame, (640 + offset, 360), 60, (150, 150, 150), 2)
            else:
                # Side view: draw a rectangular bolt-like shape
                cv2.rectangle(frame, (540, 240 + offset), (740, 480 + offset), color, 3)
                # Thread ridges
                for y in range(280, 450, 20):
                    cv2.line(frame, (540, y + offset), (740, y + offset), (150, 150, 150), 2)

            # Labels and info
            cv2.putText(frame, f"SIMULATED | {label} | Serial {self.serial}", (30, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
            cv2.putText(frame, f"Exp: {self.exposure}us | Gain: {self.gain}dB", (30, 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
            cv2.putText(frame, f"Frame: {self._counter} | FPS: {self.fps}", (30, 130),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
            
            # Timestamp
            ts = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, ts, (950, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (180, 180, 180), 2)

            return frame

    def close(self):
        self.opened = False
        print(f"[Simulated CAM {self.serial}] Closed.")


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Dual Hikrobot GigE → RTSP publisher for WGDeepInsight"
    )
    parser.add_argument("--top-serial",  default=DEFAULT_TOP_SERIAL,
                        help="Serial number of the TOP camera")
    parser.add_argument("--side-serial", default=DEFAULT_SIDE_SERIAL,
                        help="Serial number of the SIDE camera")

    parser.add_argument("--mediamtx-host", default="127.0.0.1",
                        help="IP / hostname of the MediaMTX server (default: 127.0.0.1)")
    parser.add_argument("--mediamtx-port", type=int, default=8554,
                        help="RTSP port of MediaMTX (default: 8554)")

    parser.add_argument("--width",  type=int, default=1280, help="Output frame width")
    parser.add_argument("--height", type=int, default=720,  help="Output frame height")
    parser.add_argument("--fps",    type=int, default=5,    help="Stream frame rate (default: 5)")

    parser.add_argument("--top-exposure",  type=float, default=3000.0,
                        help="Initial top camera exposure (µs)")
    parser.add_argument("--top-gain",      type=float, default=1.0,
                        help="Initial top camera gain (dB)")
    parser.add_argument("--side-exposure", type=float, default=35000.0,
                        help="Initial side camera exposure (µs)")
    parser.add_argument("--side-gain",     type=float, default=5.3132,
                        help="Initial side camera gain (dB)")

    parser.add_argument("--part", default=None,
                        help="Optional: apply part preset on startup (capnut|stud|adapter|pin)")

    args = parser.parse_args()

    base_url = f"rtsp://{args.mediamtx_host}:{args.mediamtx_port}"
    top_url  = f"{base_url}/top"
    side_url = f"{base_url}/side"

    top_cam  = HikrobotCamera(args.top_serial,  args.top_exposure,  args.top_gain,  args.fps)
    side_cam = HikrobotCamera(args.side_serial, args.side_exposure, args.side_gain, args.fps)

    top_pub  = RTSPPublisher(top_url,  args.width, args.height, args.fps)
    side_pub = RTSPPublisher(side_url, args.width, args.height, args.fps)

    stop_evt = threading.Event()

    try:
        print("=" * 60)
        print("  WGDeepInsight Dual RTSP Publisher")
        print("=" * 60)
        print(f"  TOP  camera  -> {top_url}  (serial: {args.top_serial})")
        print(f"  SIDE camera  -> {side_url}  (serial: {args.side_serial})")
        print(f"  Resolution   : {args.width}x{args.height} @ {args.fps} fps")
        print("=" * 60)

        # Open cameras
        try:
            top_cam.open()
        except Exception as e:
            print(f"[MAIN] Failed to open physical TOP camera, using simulated camera. Error: {e}")
            top_cam = SimulatedCamera(args.top_serial, args.top_exposure, args.top_gain, args.fps)
            top_cam.open()

        try:
            side_cam.open()
        except Exception as e:
            print(f"[MAIN] Failed to open physical SIDE camera, using simulated camera. Error: {e}")
            side_cam = SimulatedCamera(args.side_serial, args.side_exposure, args.side_gain, args.fps)
            side_cam.open()

        # Apply optional part preset
        if args.part:
            apply_part_preset(top_cam, side_cam, args.part)

        # Start RTSP publishers
        top_pub.start()
        side_pub.start()

        # Launch streaming threads
        t_top = threading.Thread(
            target=stream_camera,
            args=(top_cam, top_pub, "TOP", args.width, args.height, args.fps, stop_evt),
            daemon=True, name="stream-top",
        )
        t_side = threading.Thread(
            target=stream_camera,
            args=(side_cam, side_pub, "SIDE", args.width, args.height, args.fps, stop_evt),
            daemon=True, name="stream-side",
        )

        t_top.start()
        t_side.start()

        print("\nStreaming... Press Ctrl+C to stop.\n")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[MAIN] Shutting down…")

    finally:
        stop_evt.set()

        # Give threads a moment to exit
        time.sleep(0.5)

        top_pub.stop()
        side_pub.stop()
        top_cam.close()
        side_cam.close()

        print("[MAIN] Done.")


if __name__ == "__main__":
    main()
