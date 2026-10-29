"""
Checkerboard Calibration Capture — STANDALONE (no camera_manager.py dependency)
=================================================================================
Opens the Hikrobot GigE camera directly using the MVS SDK, with no reliance
on your existing CameraManager singleton. This avoids any conflicts with
background threads/caching in camera_manager.py, and makes it obvious when
the camera can't be opened (no silent DEMO_MODE fallback -- it just fails
loudly, which is what you want for an explicit calibration session).

IMPORTANT: this script requests EXCLUSIVE access to the camera. If your
main inspection server (or the Hikrobot MVS Viewer app) is already running
and holding the camera open, this script will fail to open it -- close
those first.

Usage:
    python capture_calibration_standalone.py

Controls:
    SPACE - save the current frame (only works when checkerboard detected)
    q     - quit
"""

import sys
import os
import ctypes
import numpy as np
import cv2
from datetime import datetime

# ── MVS SDK path (same search list as camera_manager.py) ──────────────────
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

try:
    from MvCameraControl_class import (
        MV_CC_DEVICE_INFO_LIST, MV_CC_DEVICE_INFO, MvCamera,
        MV_GIGE_DEVICE, MV_ACCESS_Exclusive, MV_ACCESS_Control,
        MV_TRIGGER_MODE_OFF, MV_FRAME_OUT_INFO_EX,
    )
except ImportError:
    from MvImport.MvCameraControl_class import (
        MV_CC_DEVICE_INFO_LIST, MV_CC_DEVICE_INFO, MvCamera,
        MV_GIGE_DEVICE, MV_ACCESS_Exclusive, MV_ACCESS_Control,
        MV_TRIGGER_MODE_OFF, MV_FRAME_OUT_INFO_EX,
    )

# ============================== CONFIG ==================================
CAMERA_SERIAL = "DB0763412"   # set to your camera's serial (from the device
                               # enumeration printout). Leave as "" to just
                               # use the FIRST GigE camera found.

BOARD_SIZE = (9, 6)          # INTERNAL corners (cols, rows).
                               # 11x8-square board -> (10, 7)
                               # 10x7-square board -> (9, 6)
SQUARE_SIZE_MM = 25.0

EXPOSURE_US = 5000.0         # microseconds -- raise if the brightness
                               # readout printed below is too low (<60ish),
                               # lower if frames are blown out (>220ish)
GAIN = 0.0

OUTPUT_DIR = "calibration_images_standalone"
MIN_IMAGES_RECOMMENDED = 15
BUF_SIZE = 4000 * 3000 * 3
# ==========================================================================


def open_camera():
    """Enumerates and opens the target GigE camera. Returns an MvCamera
    handle, or None (and prints why) if it couldn't be opened."""
    device_list = MV_CC_DEVICE_INFO_LIST()
    ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
    if ret != 0 or device_list.nDeviceNum < 1:
        print("ERROR: no GigE devices found. Check cabling/power/network config.")
        return None

    print(f"Found {device_list.nDeviceNum} GigE device(s):")
    target_info = None
    for i in range(device_list.nDeviceNum):
        info = ctypes.cast(device_list.pDeviceInfo[i], ctypes.POINTER(MV_CC_DEVICE_INFO)).contents
        serial = ""
        if info.nTLayerType == MV_GIGE_DEVICE:
            for ch in info.SpecialInfo.stGigEInfo.chSerialNumber:
                if ch == 0:
                    break
                serial += chr(ch)
        print(f"  Device #{i}: Serial '{serial}'")

        if not CAMERA_SERIAL or serial == CAMERA_SERIAL:
            target_info = info
            if not CAMERA_SERIAL:
                print(f"  -> No CAMERA_SERIAL set, using this one by default.")
            break

    if target_info is None:
        print(f"ERROR: no device matched CAMERA_SERIAL='{CAMERA_SERIAL}'. "
              f"Check the serial above and update CAMERA_SERIAL, or leave it blank.")
        return None

    cam = MvCamera()
    if cam.MV_CC_CreateHandle(target_info) != 0:
        print("ERROR: MV_CC_CreateHandle failed.")
        return None

    ret = cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)
    if ret != 0:
        print(f"Exclusive open failed (0x{ret:x}), trying Control mode...")
        ret = cam.MV_CC_OpenDevice(MV_ACCESS_Control, 0)
    if ret != 0:
        print(f"ERROR: could not open camera (0x{ret:x}). "
              f"Is it already open in another program (main server / MVS Viewer)? "
              f"Close that first.")
        try:
            cam.MV_CC_DestroyHandle()
        except Exception:
            pass
        return None

    pkt = cam.MV_CC_GetOptimalPacketSize()
    if int(pkt) > 0:
        cam.MV_CC_SetIntValue("GevSCPSPacketSize", pkt)
    cam.MV_CC_SetIntValue("GevSCPD", 1000)
    cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
    cam.MV_CC_SetFloatValue("AcquisitionFrameRate", 20.0)
    cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)

    cam.MV_CC_SetEnumValue("ExposureAuto", 0)
    cam.MV_CC_SetEnumValue("GainAuto", 0)
    cam.MV_CC_SetFloatValue("ExposureTime", EXPOSURE_US)
    cam.MV_CC_SetFloatValue("Gain", GAIN)

    ret = cam.MV_CC_StartGrabbing()
    if ret != 0:
        print(f"ERROR: StartGrabbing failed (0x{ret:x}).")
        return None

    print(f"Camera opened successfully. Exposure={EXPOSURE_US}us, Gain={GAIN}")
    return cam


def grab_frame(cam, buf, info):
    ret = cam.MV_CC_GetOneFrameTimeout(ctypes.byref(buf), BUF_SIZE, info, 500)
    if ret != 0:
        return None
    h, w, frame_len = info.nHeight, info.nWidth, info.nFrameLen
    if frame_len == 0 or h == 0 or w == 0:
        return None
    raw = np.frombuffer(buf, count=frame_len, dtype=np.uint8)
    if frame_len == h * w:
        return cv2.cvtColor(raw.reshape((h, w)), cv2.COLOR_BayerBG2BGR)
    return raw.reshape((h, w, 3))


def get_region(cx, cy, frame_w, frame_h):
    col = min(2, int(cx / frame_w * 3))
    row = min(2, int(cy / frame_h * 3))
    return row * 3 + col


def draw_coverage_overlay(frame, covered_regions, frame_w, frame_h):
    for i in range(1, 3):
        cv2.line(frame, (frame_w * i // 3, 0), (frame_w * i // 3, frame_h), (80, 80, 80), 1)
        cv2.line(frame, (0, frame_h * i // 3), (frame_w, frame_h * i // 3), (80, 80, 80), 1)
    labels = ["TL", "TM", "TR", "ML", "MM", "MR", "BL", "BM", "BR"]
    for idx in range(9):
        row, col = idx // 3, idx % 3
        cx = col * frame_w // 3 + 10
        cy = row * frame_h // 3 + 25
        color = (0, 220, 0) if idx in covered_regions else (0, 0, 220)
        cv2.putText(frame, labels[idx], (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 70)
    print("CHECKERBOARD CALIBRATION CAPTURE -- STANDALONE")
    print("=" * 70)

    cam = open_camera()
    if cam is None:
        print("\nExiting -- camera could not be opened.")
        return

    buf = (ctypes.c_ubyte * BUF_SIZE)()
    info = MV_FRAME_OUT_INFO_EX()

    print(f"Board size (internal corners): {BOARD_SIZE} | Square size: {SQUARE_SIZE_MM}mm")
    print("Press SPACE to capture when the board is detected (green corners).")
    print("Press 'q' to quit.\n")

    covered_regions = set()
    saved_count = 0
    frame_counter = 0

    try:
        while True:
            frame = grab_frame(cam, buf, info)
            if frame is None:
                continue

            frame_h, frame_w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame

            frame_counter += 1
            if frame_counter % 30 == 0:
                mean_val = gray.mean()
                print(f"Frame brightness: mean={mean_val:.1f}, min={gray.min()}, max={gray.max()}"
                      + ("  <-- TOO DARK, raise EXPOSURE_US/GAIN and restart" if mean_val < 40 else "")
                      + ("  <-- TOO BRIGHT, lower EXPOSURE_US/GAIN" if mean_val > 220 else ""))

            found, corners = cv2.findChessboardCorners(
                gray, BOARD_SIZE,
                flags=cv2.CALIB_CB_ADAPTIVE_THRESH + cv2.CALIB_CB_NORMALIZE_IMAGE
            )

            display = frame.copy()
            current_region = None

            if found:
                corners_refined = cv2.cornerSubPix(
                    gray, corners, (11, 11), (-1, -1),
                    (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
                )
                cv2.drawChessboardCorners(display, BOARD_SIZE, corners_refined, found)
                cx, cy = corners_refined.mean(axis=0)[0]
                current_region = get_region(cx, cy, frame_w, frame_h)
                cv2.putText(display, "BOARD DETECTED - press SPACE to capture",
                            (10, frame_h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            else:
                cv2.putText(display, "No checkerboard detected",
                            (10, frame_h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            draw_coverage_overlay(display, covered_regions, frame_w, frame_h)
            cv2.putText(display, f"Captured: {saved_count} | Regions: {len(covered_regions)}/9",
                        (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            show = display
            if frame_w > 1280:
                scale = 1280 / frame_w
                show = cv2.resize(display, (int(frame_w * scale), int(frame_h * scale)))
            cv2.imshow("Calibration Capture (standalone)", show)
            key = cv2.waitKey(1) & 0xFF

            if key == ord(' ') and found:
                timestamp = datetime.now().strftime("%H%M%S")
                filename = os.path.join(OUTPUT_DIR, f"calib_{saved_count+1:04d}_{timestamp}.png")
                cv2.imwrite(filename, frame)
                saved_count += 1
                if current_region is not None:
                    covered_regions.add(current_region)
                print(f"Saved {filename} (region {current_region}, "
                      f"{len(covered_regions)}/9 regions covered)")

            elif key == ord('q'):
                break

    finally:
        cv2.destroyAllWindows()
        try:
            cam.MV_CC_StopGrabbing()
            cam.MV_CC_CloseDevice()
            cam.MV_CC_DestroyHandle()
            print("\nCamera closed cleanly.")
        except Exception as e:
            print(f"Warning during camera cleanup: {e}")

    print(f"\nDone. Captured {saved_count} images in '{OUTPUT_DIR}/'.")
    if saved_count < MIN_IMAGES_RECOMMENDED:
        print(f"NOTE: recommend at least {MIN_IMAGES_RECOMMENDED} images for a stable calibration.")
    if len(covered_regions) < 9:
        print(f"NOTE: {9 - len(covered_regions)} frame region(s) were never covered -- "
              f"the distortion model will be weaker there.")


if __name__ == "__main__":
    main()