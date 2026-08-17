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
TOP_EXPOSURE = 3000.0   
TOP_GAIN = 1.0        

SIDE_EXPOSURE = 30000.0 
SIDE_GAIN = 5.3132         

# 📏 PIXEL-TO-MM (PMM) FINAL PERFECT CALIBRATION
PMM_CAM_TOP    = 33.24  
PMM_CAM_SIDE_Y = 31.57  

# 🎯 STUD BLUEPRINT TOLERANCES
TOP_OD_MIN = 7.60 
TOP_OD_MAX = 8.20  

SIDE_HEIGHT_MIN = 37.30 
SIDE_HEIGHT_MAX = 38.90 

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

model = YOLO(r"C:\Users\abiji\deepinsight\Wg-backend\surface_models\Stud_best.pt")

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
        
    elif serial_num == SIDE_CAM_SERIAL:
        cam.MV_CC_SetFloatValue("ExposureTime", SIDE_EXPOSURE) 
        cam.MV_CC_SetFloatValue("Gain", SIDE_GAIN)
        camera_dict[SIDE_CAM_INDEX] = cam

if len(camera_dict) < 2:
    print("[ERROR] Could not find BOTH serial numbers. Check your cameras!")
    sys.exit()
    
cameras = [camera_dict[0], camera_dict[1]]

for cam in cameras:
    cam.MV_CC_StartGrabbing()

data_buf = (ctypes.c_ubyte * (4000 * 3000 * 3))() 
stFrameInfo = MV_FRAME_OUT_INFO_EX()

# =====================================================================
# 5. STUD MEASUREMENT LOGIC
# =====================================================================
def measure_top_view(full_img, pmm, ai_box):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    if ai_box is not None:
        ax1, ay1, ax2, ay2 = map(int, ai_box)
        mask = np.zeros_like(thresh)
        pad = 20 
        cv2.rectangle(mask, (max(0, ax1-pad), max(0, ay1-pad)), (min(w_img, ax2+pad), min(h_img, ay2+pad)), 255, -1)
        thresh = cv2.bitwise_and(thresh, mask)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    valid_contours = [c for c in contours if cv2.contourArea(c) > 500]
    if len(valid_contours) < 1:
        return 0.0, "ERROR", None
        
    outer_contour = max(valid_contours, key=cv2.contourArea)
    (cx, cy), radius_in_px = cv2.minEnclosingCircle(outer_contour)
    
    od_mm = (radius_in_px * 2) / pmm
    circle_od_data = (int(cx), int(cy), int(radius_in_px))
        
    status = "PASS" if (TOP_OD_MIN <= od_mm <= TOP_OD_MAX) else "FAIL"
    return od_mm, status, circle_od_data

def measure_side_view(full_img, pmm_y, ai_box):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    if ai_box is not None:
        ax1, ay1, ax2, ay2 = map(int, ai_box)
        mask = np.zeros_like(thresh)
        pad = 15 
        cv2.rectangle(mask, (max(0, ax1-pad), max(0, ay1-pad)), (min(w_img, ax2+pad), min(h_img, ay2+pad)), 255, -1)
        thresh = cv2.bitwise_and(thresh, mask)
    
    thresh[-40:, :] = 0 
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 60)) 
    fused_mask = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    contours, _ = cv2.findContours(fused_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid_contours = [c for c in contours if cv2.contourArea(c) > 2000]
    
    if not valid_contours:
        return 0.0, 0, "ERROR", None, []
        
    main_contour = max(valid_contours, key=cv2.contourArea)
    x, y, w_px, h_px = cv2.boundingRect(main_contour)
    
    height_mm = h_px / pmm_y
    box_data = (x, y, w_px, h_px) 
    
    peaks_y_coords = []
    
    roi_x_start = x + int(w_px * 0.10)
    roi_x_end = x + int(w_px * 0.30)
    
    if h_px > 0 and roi_x_end > roi_x_start:
        thread_roi = gray[y:y+h_px, roi_x_start:roi_x_end]
        row_averages = np.mean(thread_roi, axis=1)
        
        top_thread_limit = int(h_px * 0.48)   
        bottom_thread_start = int(h_px * 0.65) 
        row_averages[top_thread_limit:bottom_thread_start] = 0 
        
        smoothed = cv2.GaussianBlur(row_averages.reshape(-1, 1), (5, 1), 0).flatten()
        
        min_peak_dist = int(pmm_y * 1.0) 
        
        for i in range(5, len(smoothed) - 5):
            if smoothed[i] == 0: continue 
            
            if smoothed[i] == max(smoothed[i-5:i+6]):
                local_min = min(smoothed[i-5:i+6])
                if (smoothed[i] - local_min) > 3: 
                    global_y = y + i
                    if not peaks_y_coords or (global_y - peaks_y_coords[-1]) >= min_peak_dist:
                        peaks_y_coords.append(global_y)
                    else:
                        last_i = peaks_y_coords[-1] - y
                        if smoothed[i] > smoothed[last_i]:
                            peaks_y_coords[-1] = global_y
                            
    thread_count = len(peaks_y_coords)
    
    status = "PASS" if (SIDE_HEIGHT_MIN <= height_mm <= SIDE_HEIGHT_MAX) else "FAIL"
    
    return height_mm, thread_count, status, box_data, peaks_y_coords

# =====================================================================
# 6. MAIN LOOP
# =====================================================================
print("\n[INFO] FINAL STUD SCRIPT RUNNING (MEASUREMENT ONLY). Press 'q' to quit.")

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
            
            # --- YOLO AI RUNS IN BACKGROUND (PLOTTING DISABLED) ---
            results = model(frame_bgr, stream=True, verbose=False, conf=0.4) 
            annotated_frame = frame_bgr.copy()
            
            ai_box = None
            for r in results:
                # The line `annotated_frame = r.plot()` has been entirely removed
                if len(r.boxes) > 0:
                    ai_box = r.boxes.xyxy.cpu().numpy()[0] 
            
            hud_status, hud_line1, hud_line2 = "", "", ""
            hud_color = (0, 255, 0)
            name = ""
            
            if idx == TOP_CAM_INDEX: 
                name = "CAM (TOP VIEW)"
                od_mm, status, circle_id = measure_top_view(frame_bgr, PMM_CAM_TOP, ai_box)
                
                hud_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
                
                if circle_id is not None:
                    cx_in, cy_in, r_in = circle_id
                    cv2.circle(annotated_frame, (cx_in, cy_in), r_in, (255, 0, 255), 4)
                    
                hud_status = f"STATUS: {status}"
                hud_line1 = f"OD (7.9mm): {od_mm:.2f}mm"

                display_frame = cv2.resize(annotated_frame, (640, 480))
                cv2.putText(display_frame, f"ACTIVE: {name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                if hud_status != "":
                    cv2.putText(display_frame, hud_status, (10, 420), cv2.FONT_HERSHEY_SIMPLEX, 1.0, hud_color, 2)
                    cv2.putText(display_frame, hud_line1, (10, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
                
                ai_frames[0] = display_frame

            elif idx == SIDE_CAM_INDEX: 
                name = "CAM (SIDE VIEW)"
                height, thread_count, status, box_data, peaks = measure_side_view(frame_bgr, PMM_CAM_SIDE_Y, ai_box)
                
                if box_data is not None:
                    bx, by, bw, bh = box_data
                    hud_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
                    
                    cv2.rectangle(annotated_frame, (bx, by), (bx + bw, by + bh), hud_color, 4)
                    
                    for py in peaks:
                        cv2.line(annotated_frame, (bx, py), (bx + bw, py), (0, 255, 255), 1)
                    
                    hud_status = f"STATUS: {status}"
                    hud_line1 = f"Total Height: {height:.2f}mm"
                    hud_line2 = f"Threads Count: {thread_count}"

                display_frame = cv2.resize(annotated_frame, (640, 480))
                cv2.putText(display_frame, f"ACTIVE: {name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                if hud_status != "":
                    cv2.putText(display_frame, hud_status, (10, 370), cv2.FONT_HERSHEY_SIMPLEX, 1.0, hud_color, 2)
                    cv2.putText(display_frame, hud_line1, (10, 405), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                    cv2.putText(display_frame, hud_line2, (10, 440), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2) 
                
                ai_frames[1] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow("SYSMAC - STUD MEASUREMENT", stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

for cam in cameras:
    cam.MV_CC_StopGrabbing()
    cam.MV_CC_CloseDevice()
    cam.MV_CC_DestroyHandle()

cv2.destroyAllWindows()