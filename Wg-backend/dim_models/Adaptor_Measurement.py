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
# 2. DEFAULT CALIBRATION & CAMERA SETTINGS
# =====================================================================
# 🛠️ Locked perfectly to the settings from your screenshot!
TOP_EXPOSURE = 4274.0   
TOP_GAIN = 0.0        

SIDE_EXPOSURE = 33571.0 
SIDE_GAIN = 6.3         

# 📏 PIXEL-TO-MM (PMM) GOLDEN CALIBRATION
PMM_CAM_TOP    = 59.28  # Recalibrated to pull 10.24mm down to ~10.00mm
PMM_CAM_SIDE_X = 31.26  # Recalibrated to pull 27.12mm down to ~27.00mm
PMM_CAM_SIDE_Y = 31.25  # Recalibrated to push 43.54mm up to ~44.00mm

# 🎯 REAL-WORLD CNC TOLERANCES
TOP_ID_MIN = 9.70
TOP_ID_MAX = 10.30  

SIDE_HEIGHT_MIN = 43.70 
SIDE_HEIGHT_MAX = 44.30 
SIDE_WIDTH_MIN = 26.70  
SIDE_WIDTH_MAX = 27.30

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

model = YOLO(r"C:\Users\abiji\deepinsight-windows\Wg-backend\surface_models\Adaptor_best.pt")

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
# 5. HELPER FUNCTIONS & MEASUREMENT LOGIC
# =====================================================================
def draw_text_outline(img, text, position, font_scale, color):
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 2, cv2.LINE_AA)

def measure_top_view(full_img, pmm):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    valid_contours = [c for c in contours if cv2.contourArea(c) > 1000]
    if len(valid_contours) < 1:
        return 0.0, "ERROR", None
        
    outer_contour = max(valid_contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(outer_contour)
    (cx_out, cy_out), (w_px, h_px), angle = rect
    
    id_mm = 0.0
    circle_id_data = None
    
    box_size = int(min(w_px, h_px) * 0.6)
    x1 = max(0, int(cx_out - box_size // 2))
    y1 = max(0, int(cy_out - box_size // 2))
    x2 = min(gray.shape[1], int(cx_out + box_size // 2))
    y2 = min(gray.shape[0], int(cy_out + box_size // 2))
    
    if x2 > x1 and y2 > y1:
        roi = gray[y1:y2, x1:x2]
        roi_blur = cv2.GaussianBlur(roi, (5, 5), 0)
        _, roi_thresh = cv2.threshold(roi_blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        roi_contours, _ = cv2.findContours(roi_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if len(roi_contours) > 0:
            best_c = max(roi_contours, key=cv2.contourArea)
            (local_cx, local_cy), radius_in_px = cv2.minEnclosingCircle(best_c)
            
            global_cx = int(x1 + local_cx)
            global_cy = int(y1 + local_cy)
            
            id_mm = (radius_in_px * 2) / pmm
            circle_id_data = (global_cx, global_cy, int(radius_in_px))
        
    status = "PASS" if (TOP_ID_MIN <= id_mm <= TOP_ID_MAX) else "FAIL"
    return id_mm, status, circle_id_data

def measure_side_view(full_img, pmm_x, pmm_y):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresh[-40:, :] = 0 
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 60)) 
    fused_mask = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    contours, _ = cv2.findContours(fused_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid_contours = [c for c in contours if cv2.contourArea(c) > 5000]
    
    if not valid_contours:
        return 0.0, 0.0, 0, "ERROR", None
        
    main_contour = max(valid_contours, key=cv2.contourArea)
    x, y, w_px, h_px = cv2.boundingRect(main_contour)
    
    height_mm = h_px / pmm_y
    width_mm = w_px / pmm_x
    box_data = (x, y, w_px, h_px) 
    
    thread_count = 0
    roi_x_start = x + int(w_px * 0.3)
    roi_x_end = x + int(w_px * 0.7)
    
    if h_px > 0 and roi_x_end > roi_x_start:
        thread_roi = gray[y:y+h_px, roi_x_start:roi_x_end]
        row_averages = np.mean(thread_roi, axis=1)
        mean_brightness = np.mean(row_averages)
        
        smoothed = cv2.GaussianBlur(row_averages.reshape(-1, 1), (5, 1), 0).flatten()
        
        for i in range(2, len(smoothed) - 2):
            if smoothed[i] > smoothed[i-1] and smoothed[i] > smoothed[i+1]:
                if smoothed[i] > mean_brightness * 1.05: 
                    thread_count += 1
    
    status = "PASS"
    if not (SIDE_HEIGHT_MIN <= height_mm <= SIDE_HEIGHT_MAX) or not (SIDE_WIDTH_MIN <= width_mm <= SIDE_WIDTH_MAX):
        status = "FAIL"
    
    return height_mm, width_mm, thread_count, status, box_data

# =====================================================================
# 6. LIVE TUNING UI SETUP
# =====================================================================
window_name = "SYSMAC - ADAPTOR MASTER TUNING"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
cv2.resizeWindow(window_name, 1280, 700)

def nothing(x):
    pass

# Create Trackbars for Exposure and Gain
cv2.createTrackbar("Top Exp", window_name, int(TOP_EXPOSURE), 100000, nothing)
cv2.createTrackbar("Top Gain", window_name, int(TOP_GAIN * 10), 200, nothing)
cv2.createTrackbar("Side Exp", window_name, int(SIDE_EXPOSURE), 100000, nothing)
cv2.createTrackbar("Side Gain", window_name, int(SIDE_GAIN * 10), 200, nothing)

last_t_exp, last_t_gain = int(TOP_EXPOSURE), int(TOP_GAIN * 10)
last_s_exp, last_s_gain = int(SIDE_EXPOSURE), int(SIDE_GAIN * 10)

# =====================================================================
# 7. MAIN LOOP (LIVE AI + MEASUREMENT + TUNING)
# =====================================================================
print("\n[INFO] MASTER TUNING SCRIPT RUNNING. Use sliders to adjust cameras. Press 'q' to quit.")

while True:
    t_exp = cv2.getTrackbarPos("Top Exp", window_name)
    t_gain = cv2.getTrackbarPos("Top Gain", window_name)
    s_exp = cv2.getTrackbarPos("Side Exp", window_name)
    s_gain = cv2.getTrackbarPos("Side Gain", window_name)

    if t_exp != last_t_exp:
        camera_dict[TOP_CAM_INDEX].MV_CC_SetFloatValue("ExposureTime", float(max(t_exp, 10))) 
        last_t_exp = t_exp
    if t_gain != last_t_gain:
        camera_dict[TOP_CAM_INDEX].MV_CC_SetFloatValue("Gain", float(t_gain / 10.0))
        last_t_gain = t_gain
        
    if s_exp != last_s_exp:
        camera_dict[SIDE_CAM_INDEX].MV_CC_SetFloatValue("ExposureTime", float(max(s_exp, 10)))
        last_s_exp = s_exp
    if s_gain != last_s_gain:
        camera_dict[SIDE_CAM_INDEX].MV_CC_SetFloatValue("Gain", float(s_gain / 10.0))
        last_s_gain = s_gain

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
            results = model(frame_bgr, stream=False, verbose=False, conf=0.6) 
            annotated_frame = results[0].plot()
            
            defect_count = 0
            for box in results[0].boxes:
                class_id = int(box.cls[0])
                class_name = model.names[class_id].lower()
                if class_name != "okay" and class_name != "ok_part" and class_name != "okay_pin":
                    defect_count += 1
            
            name = ""
            
            # --- ROUTE TO MEASUREMENT LOGIC ---
            if idx == TOP_CAM_INDEX: 
                name = "CAM (TOP VIEW)"
                id_mm, m_status, circle_id = measure_top_view(frame_bgr, PMM_CAM_TOP)
                
                # Overall Pass/Fail combines both Measurement AND Defect AI
                final_status = "PASS" if (m_status == "PASS" and defect_count == 0) else "FAIL"
                hud_color = (0, 255, 0) if final_status == "PASS" else (0, 0, 255)
                
                # Individual dynamic Red/Green color based on tolerance
                color_id = (0, 255, 0) if (TOP_ID_MIN <= id_mm <= TOP_ID_MAX) else (0, 0, 255)
                
                if circle_id is not None:
                    cx_in, cy_in, r_in = circle_id
                    cv2.circle(annotated_frame, (cx_in, cy_in), r_in, (255, 0, 255), 4)

                display_frame = cv2.resize(annotated_frame, (640, 480))
                draw_text_outline(display_frame, f"ACTIVE: {name}", (10, 30), 0.8, (0, 255, 0))
                
                draw_text_outline(display_frame, f"STATUS: {final_status}", (10, 380), 1.0, hud_color)
                draw_text_outline(display_frame, f"ID (10mm Bore): {id_mm:.2f}mm", (10, 440), 0.8, color_id)
                
                ai_frames[0] = display_frame

            elif idx == SIDE_CAM_INDEX: 
                name = "CAM (SIDE VIEW)"
                height, width, thread_count, m_status, box_data = measure_side_view(frame_bgr, PMM_CAM_SIDE_X, PMM_CAM_SIDE_Y)
                
                # Overall Pass/Fail combines both Measurement AND Defect AI
                final_status = "PASS" if (m_status == "PASS" and defect_count == 0) else "FAIL"
                hud_color = (0, 255, 0) if final_status == "PASS" else (0, 0, 255)
                
                # Individual dynamic Red/Green color based on tolerance
                color_h = (0, 255, 0) if (SIDE_HEIGHT_MIN <= height <= SIDE_HEIGHT_MAX) else (0, 0, 255)
                color_w = (0, 255, 0) if (SIDE_WIDTH_MIN <= width <= SIDE_WIDTH_MAX) else (0, 0, 255)
                
                if box_data is not None:
                    bx, by, bw, bh = box_data
                    cv2.rectangle(annotated_frame, (bx, by), (bx + bw, by + bh), (255, 0, 255), 4)
                
                display_frame = cv2.resize(annotated_frame, (640, 480))
                draw_text_outline(display_frame, f"ACTIVE: {name}", (10, 30), 0.8, (0, 255, 0))
                
                draw_text_outline(display_frame, f"STATUS: {final_status}", (10, 380), 1.0, hud_color)
                draw_text_outline(display_frame, f"Total Height: {height:.2f}mm", (10, 420), 0.8, color_h)
                draw_text_outline(display_frame, f"Width: {width:.2f}mm", (10, 460), 0.8, color_w)
                
                ai_frames[1] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow(window_name, stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        print("\n--- FINAL CALIBRATED SETTINGS ---")
        print(f"TOP_EXPOSURE = {last_t_exp}.0")
        print(f"TOP_GAIN = {last_t_gain / 10.0}")
        print(f"SIDE_EXPOSURE = {last_s_exp}.0")
        print(f"SIDE_GAIN = {last_s_gain / 10.0}")
        print("---------------------------------\n")
        break

for cam in cameras:
    cam.MV_CC_StopGrabbing()
    cam.MV_CC_CloseDevice()
    cam.MV_CC_DestroyHandle()

cv2.destroyAllWindows()