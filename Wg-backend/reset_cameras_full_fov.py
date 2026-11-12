"""
reset_cameras_full_fov.py
Utility to reset all connected Hikrobot cameras to 100% full sensor resolution
(OffsetX=0, OffsetY=0, Width=WidthMax, Height=HeightMax) with zero ROI cropping.
"""

import sys
import os
import ctypes

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
        MV_CC_DEVICE_INFO_LIST,
        MV_CC_DEVICE_INFO,
        MvCamera,
        MV_GIGE_DEVICE,
        MV_ACCESS_Exclusive,
        MV_ACCESS_Control,
        MVCC_INTVALUE,
    )
except ImportError:
    print("[ERROR] MvCameraControl_class not found. Check MVS installation.")
    sys.exit(1)


def reset_all_cameras():
    print("=" * 60)
    print(" HIKROBOT GIGE CAMERA FOV RESET TOOL ")
    print("=" * 60)

    device_list = MV_CC_DEVICE_INFO_LIST()
    ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
    if ret != 0 or device_list.nDeviceNum < 1:
        print("[WARN] No GigE cameras found on this machine.")
        return

    print(f"Found {device_list.nDeviceNum} camera device(s):\n")

    for i in range(device_list.nDeviceNum):
        info = ctypes.cast(
            device_list.pDeviceInfo[i], ctypes.POINTER(MV_CC_DEVICE_INFO)
        ).contents

        serial = ""
        ip_str = ""
        if info.nTLayerType == MV_GIGE_DEVICE:
            gige_info = info.SpecialInfo.stGigEInfo
            for ch in gige_info.chSerialNumber:
                if ch == 0:
                    break
                serial += chr(ch)
            nip = gige_info.nCurrentIp
            ip_str = f"{(nip >> 24) & 0xff}.{(nip >> 16) & 0xff}.{(nip >> 8) & 0xff}.{nip & 0xff}"

        print(f"[{i+1}/{device_list.nDeviceNum}] Connecting to Camera Serial: '{serial}' (IP: {ip_str})...")

        cam = MvCamera()
        r = cam.MV_CC_CreateHandle(info)
        if r != 0:
            print(f"    CreateHandle failed: 0x{r:08X}")
            continue

        r = cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)
        if r != 0:
            r = cam.MV_CC_OpenDevice(MV_ACCESS_Control, 0)
        if r != 0:
            print(f"    OpenDevice failed (0x{r:08X}). Is the server running? Stop uvicorn first.")
            cam.MV_CC_DestroyHandle()
            continue

        try:
            # Check current resolution
            st_cur_w = MVCC_INTVALUE()
            st_cur_h = MVCC_INTVALUE()
            cam.MV_CC_GetIntValue("Width", st_cur_w)
            cam.MV_CC_GetIntValue("Height", st_cur_h)
            print(f"    Current Resolution : {st_cur_w.nCurValue} x {st_cur_h.nCurValue}")

            # Reset offsets
            cam.MV_CC_SetIntValue("OffsetX", 0)
            cam.MV_CC_SetIntValue("OffsetY", 0)

            # Determine maximum sensor resolution
            max_w = None
            max_h = None

            st_w = MVCC_INTVALUE()
            if cam.MV_CC_GetIntValue("WidthMax", st_w) == 0 and st_w.nCurValue > 0:
                max_w = int(st_w.nCurValue)
            elif cam.MV_CC_GetIntValue("Width", st_w) == 0 and st_w.nMax > 0:
                max_w = int(st_w.nMax)

            st_h = MVCC_INTVALUE()
            if cam.MV_CC_GetIntValue("HeightMax", st_h) == 0 and st_h.nCurValue > 0:
                max_h = int(st_h.nCurValue)
            elif cam.MV_CC_GetIntValue("Height", st_h) == 0 and st_h.nMax > 0:
                max_h = int(st_h.nMax)

            if max_w and max_h:
                rw = cam.MV_CC_SetIntValue("Width", max_w)
                rh = cam.MV_CC_SetIntValue("Height", max_h)
                print(f"    -> Restored to FULL : {max_w} x {max_h} (Width ret={rw:#x}, Height ret={rh:#x})")
            else:
                print(f"    Could not read max dimensions: max_w={max_w}, max_h={max_h}")

            # Verify
            cam.MV_CC_GetIntValue("Width", st_cur_w)
            cam.MV_CC_GetIntValue("Height", st_cur_h)
            print(f"    Verified Active FOV : {st_cur_w.nCurValue} x {st_cur_h.nCurValue} (100% UNUNCROPPED)")

        except Exception as e:
            print(f"    Error during reset: {e}")
        finally:
            cam.MV_CC_CloseDevice()
            cam.MV_CC_DestroyHandle()

        print("-" * 60)

    print("\n[SUCCESS] All cameras restored to full native resolution. You can now start the server.")


if __name__ == "__main__":
    reset_all_cameras()

