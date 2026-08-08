import sys
import ctypes
import numpy as np
import time

sys.path.append(r"C:\Program Files (x86)\MVS\Development\Samples\Python")
sys.path.append(r"./MvImport")

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
    print("MvImport SDK not found.")
    sys.exit(1)

TOP_CAM_SERIAL  = "DA5211006"
SIDE_CAM_SERIAL = "DA4265515"
BUF_SIZE = 4000 * 3000 * 3

def test_grab():
    device_list = MV_CC_DEVICE_INFO_LIST()
    ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
    if ret != 0 or device_list.nDeviceNum < 1:
        print("No cameras found.")
        return

    data_buf = (ctypes.c_ubyte * BUF_SIZE)()
    frame_info = MV_FRAME_OUT_INFO_EX()

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

        print(f"\nTesting Camera: {serial}")
        cam = MvCamera()
        ret = cam.MV_CC_CreateHandle(info)
        if ret != 0:
            print(f"  MV_CC_CreateHandle failed: {ret}")
            continue

        ret = cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)
        if ret != 0:
            print(f"  MV_CC_OpenDevice failed: {ret}")
            continue

        # Start Grabbing
        ret = cam.MV_CC_StartGrabbing()
        if ret != 0:
            print(f"  MV_CC_StartGrabbing failed: {ret}")
            cam.MV_CC_CloseDevice()
            continue

        # Try to grab 5 frames
        for f in range(5):
            ret = cam.MV_CC_GetOneFrameTimeout(
                ctypes.byref(data_buf), BUF_SIZE, frame_info, 2000
            )
            if ret == 0:
                print(f"  Frame {f} grab success! Size: {frame_info.nWidth}x{frame_info.nHeight}, Len: {frame_info.nFrameLen}")
            else:
                # Print hex error code
                print(f"  Frame {f} grab failed! Error: 0x{ret:08X}")
            time.sleep(0.1)

        cam.MV_CC_StopGrabbing()
        cam.MV_CC_CloseDevice()
        cam.MV_CC_DestroyHandle()

if __name__ == "__main__":
    test_grab()
