import sys
import ctypes

sys.path.append(r"C:\Program Files (x86)\MVS\Development\Samples\Python")
sys.path.append(r"./MvImport")

try:
    from MvImport.MvCameraControl_class import (
        MV_CC_DEVICE_INFO_LIST,
        MV_CC_DEVICE_INFO,
        MvCamera,
        MV_GIGE_DEVICE,
    )
except ImportError:
    print("MvImport SDK not found. Make sure MVS is installed.")
    sys.exit(1)

def detect():
    device_list = MV_CC_DEVICE_INFO_LIST()
    ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
    if ret != 0:
        print(f"Error enumerating devices: {ret}")
        return

    print(f"Number of devices found: {device_list.nDeviceNum}")
    for i in range(device_list.nDeviceNum):
        info = ctypes.cast(
            device_list.pDeviceInfo[i], ctypes.POINTER(MV_CC_DEVICE_INFO)
        ).contents

        serial = ""
        ip = ""
        if info.nTLayerType == MV_GIGE_DEVICE:
            # Serial Number
            for ch in info.SpecialInfo.stGigEInfo.chSerialNumber:
                if ch == 0:
                    break
                serial += chr(ch)
            
            # IP Address
            ip_val = info.SpecialInfo.stGigEInfo.nCurrentIp
            ip = f"{(ip_val >> 24) & 0xff}.{(ip_val >> 16) & 0xff}.{(ip_val >> 8) & 0xff}.{ip_val & 0xff}"
            
            # Model Name
            model = ""
            for ch in info.SpecialInfo.stGigEInfo.chModelName:
                if ch == 0:
                    break
                model += chr(ch)

            print(f"Camera #{i}:")
            print(f"  Model:  {model}")
            print(f"  Serial: {serial}")
            print(f"  IP:     {ip}")

if __name__ == "__main__":
    detect()
