import sys
import cv2
import numpy as np
import ctypes
from ultralytics import YOLO

# =====================================================================
# 1. HARDWARE ROUTING
# =====================================================================
TOP_CAM_INDEX = 0  
SIDE_CAM_INDEX = 1   

# =====================================================================
# 2. CALIBRATION & CAMERA SETTINGS
# =====================================================================
TOP_EXPOSURE = 4274.0   
TOP_GAIN = 0.0        

SIDE_EXPOSURE = 33571.0 
SIDE_GAIN = 6.3         

# =====================================================================
# 3. IMPORT SDK & LOAD AI
# =====================================================================
sys.path.append(r"C:\Program Files (x86)\MVS\Development\Samples\Python")
sys.path.append(r"./MvImport") 
try:
    from MvImport.MvCameraControl_class import *
except ImportError:
    print("[ERROR] Could not find MvImport.")
    sys.exit()

# YOLO Model Loading
model = YOLO(r"C:\Users\abiji\deepinsight\Wg-backend\surface_models\Adaptor_best.pt")

# =====================================================================
# 4. INITIALIZE CAMERAS & LOCK BY SERIAL NUMBER
# =====================================================================
TOP_CAM_SERIAL = "DA5211006"  
SIDE_CAM_SERIAL = "DA4265515" 

deviceList = MV_CC_DEVICE_INFO_LIST()
ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, deviceList)

if ret != 0 or deviceList.nDeviceNum < 2:
    print("[ERROR] Need 2 Hikrobot cameras for this dual setup!")
    sys.exit()

camera_dict = {}

for i in range(deviceList.nDeviceNum):
    stDeviceList = ctypes.cast(deviceList.pDeviceInfo[i], ctypes.POINTER(MV_CC_DEVICE_INFO)).contents
    
    serial_num = ""
    if stDeviceList.nTLayerType == MV_GIGE_DEVICE:
        for per in stDeviceList.SpecialInfo.stGigEInfo.chSerialNumber:
            if per == 0: break
            serial_num += chr(per)
            
    print(f"[INFO] Found Camera with Serial: {serial_num}")
    
    cam = MvCamera()
    cam.MV_CC_CreateHandle(stDeviceList)
    cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)
    
    nPacketSize = cam.MV_CC_GetOptimalPacketSize()
    if int(nPacketSize) > 0: 
        cam.MV_CC_SetIntValue("GevSCPSPacketSize", nPacketSize)
        
    cam.MV_CC_SetIntValue("GevSCPD", 1000) 
    cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
    cam.MV_CC_SetFloatValue("AcquisitionFrameRate", 15.0) 
    cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)
    
    cam.MV_CC_SetEnumValue("ExposureAuto", 0) 
    cam.MV_CC_SetEnumValue("GainAuto", 0)
    
    if serial_num == TOP_CAM_SERIAL:
        cam.MV_CC_SetFloatValue("ExposureTime", TOP_EXPOSURE) 
        cam.MV_CC_SetFloatValue("Gain", TOP_GAIN)
        camera_dict[TOP_CAM_INDEX] = cam
        print(" -> Assigned to TOP VIEW")
        
    elif serial_num == SIDE_CAM_SERIAL:
        cam.MV_CC_SetFloatValue("ExposureTime", SIDE_EXPOSURE) 
        cam.MV_CC_SetFloatValue("Gain", SIDE_GAIN)
        camera_dict[SIDE_CAM_INDEX] = cam
        print(" -> Assigned to SIDE VIEW")

if len(camera_dict) < 2:
    print("[ERROR] Could not find BOTH serial numbers. Check your cameras!")
    sys.exit()
    
cameras = [camera_dict[0], camera_dict[1]]

for cam in cameras:
    cam.MV_CC_StartGrabbing()

data_buf = (ctypes.c_ubyte * (4000 * 3000 * 3))() 
stFrameInfo = MV_FRAME_OUT_INFO_EX()

# =====================================================================
# 5. MAIN LOOP (MODEL ONLY)
# =====================================================================
print("\n[INFO] AI MODEL SCRIPT RUNNING. Press 'q' to quit.")

while True:
    ai_frames = [None, None] 
    
    for idx, cam in enumerate(cameras):
        ret = cam.MV_CC_GetOneFrameTimeout(ctypes.byref(data_buf), len(data_buf), stFrameInfo, 1000)
        
        if ret == 0:
            h, w, frame_len = stFrameInfo.nHeight, stFrameInfo.nWidth, stFrameInfo.nFrameLen
            raw_data = np.frombuffer(data_buf, count=frame_len, dtype=np.uint8)
            
            if frame_len == h * w:
                frame_bgr = cv2.cvtColor(raw_data.reshape((h, w)), cv2.COLOR_BayerBG2BGR) 
            else:
                frame_bgr = raw_data.reshape((h, w, 3))
            
            # --- RUN YOLO AI ---
            results = model(frame_bgr, stream=True, verbose=False, conf=0.6) 
            annotated_frame = frame_bgr.copy()
            
            # --- PLOT YOLO VISUALS ---
            for r in results:
                annotated_frame = r.plot()
            
            name = "CAM (TOP VIEW)" if idx == TOP_CAM_INDEX else "CAM (SIDE VIEW)"
            
            display_frame = cv2.resize(annotated_frame, (640, 480))
            cv2.putText(display_frame, f"ACTIVE: {name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            
            if idx == TOP_CAM_INDEX:
                ai_frames[0] = display_frame
            else:
                ai_frames[1] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow("SYSMAC - ADAPTOR AI MODEL", stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

for cam in cameras:
    cam.MV_CC_StopGrabbing()
    cam.MV_CC_CloseDevice()
    cam.MV_CC_DestroyHandle()

cv2.destroyAllWindows()