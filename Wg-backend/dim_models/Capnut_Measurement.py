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

SIDE_EXPOSURE = 35000.0 
SIDE_GAIN = 5.3132         

# 📏 PIXEL-TO-MM (PMM) FINAL PERFECT CALIBRATION
PMM_CAM_TOP_OD = 45.13  
PMM_CAM_TOP_ID = 47.28  
PMM_CAM_SIDE_X = 31.09  
PMM_CAM_SIDE_Y = 56.74  

# 🎯 CAPNUT BLUEPRINT TOLERANCES
TOP_OD_FLATS_MIN = 35.38 
TOP_OD_FLATS_MAX = 36.10  

TOP_ID_MIN = 16.85 
TOP_ID_MAX = 17.45

SIDE_HEIGHT_MIN = 17.20 
SIDE_HEIGHT_MAX = 17.80 # Nominal 17.50mm ± 0.30mm tolerance

SIDE_WIDTH_MIN = 35.38 
SIDE_WIDTH_MAX = 36.10  

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

model = YOLO(r"C:\Users\abiji\deepinsight-windows\Wg-backend\surface_models\Capnut_best.pt")

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
# HELPER: DRAW TEXT WITH BLACK OUTLINE FOR READABILITY
# =====================================================================
def draw_text_outline(img, text, position, font_scale, color):
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 2, cv2.LINE_AA)

# =====================================================================
# 5. CAPNUT MEASUREMENT LOGIC
# =====================================================================
def measure_top_view(full_img, pmm_od, pmm_id, ai_box):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    if ai_box is not None:
        ax1, ay1, ax2, ay2 = map(int, ai_box)
        mask = np.zeros_like(thresh)
        pad = 30 
        cv2.rectangle(mask, (max(0, ax1-pad), max(0, ay1-pad)), (min(w_img, ax2+pad), min(h_img, ay2+pad)), 255, -1)
        thresh = cv2.bitwise_and(thresh, mask)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    thresh_clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(thresh_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    valid_contours = [c for c in contours if cv2.contourArea(c) > 1000]
    if len(valid_contours) < 1:
        return 0.0, 0.0, "FAIL", False, False, None, None
        
    outer_contour = max(valid_contours, key=cv2.contourArea)
    
    # OD (ACROSS FLATS)
    rect = cv2.minAreaRect(outer_contour)
    (cx, cy), (w_px, h_px), angle = rect
    
    od_flats_px = min(w_px, h_px)
    od_flats_mm = od_flats_px / pmm_od
    
    # ID (INNER THREAD / BORE)
    id_mm = 0.0
    circle_id_data = None
    
    box_size = int(od_flats_px * 0.7) 
    x1 = max(0, int(cx - box_size // 2))
    y1 = max(0, int(cy - box_size // 2))
    x2 = min(w_img, int(cx + box_size // 2))
    y2 = min(h_img, int(cy + box_size // 2))
    
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
            
            id_mm = (radius_in_px * 2) / pmm_id
            circle_id_data = (global_cx, global_cy, int(radius_in_px))
        
    # INDIVIDUAL COLOR STATUSES
    od_pass = (TOP_OD_FLATS_MIN <= od_flats_mm <= TOP_OD_FLATS_MAX)
    id_pass = (TOP_ID_MIN <= id_mm <= TOP_ID_MAX)
    overall_status = "PASS" if (od_pass and id_pass) else "FAIL"
    
    return od_flats_mm, id_mm, overall_status, od_pass, id_pass, rect, circle_id_data

def measure_side_view(full_img, pmm_x, pmm_y, ai_box, od_flats_mm=0.0, od_pass=False):
    if ai_box is None:
        return 0.0, od_flats_mm, "FAIL", False, od_pass, None

    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    ax1, ay1, ax2, ay2 = map(int, ai_box)
    
    mask = np.zeros_like(thresh)
    pad = 20 
    cv2.rectangle(mask, (max(0, ax1-pad), max(0, ay1-pad)), (min(gray.shape[1], ax2+pad), min(gray.shape[0], ay2+pad)), 255, -1)
    thresh = cv2.bitwise_and(thresh, mask)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 15)) 
    fused_mask = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    contours, _ = cv2.findContours(fused_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid_contours = [c for c in contours if cv2.contourArea(c) > 2000]
    
    if not valid_contours:
        return 0.0, od_flats_mm, "FAIL", False, od_pass, None
        
    main_contour = max(valid_contours, key=cv2.contourArea)
    bx, by, bw, bh = cv2.boundingRect(main_contour)
    
    final_x = bx
    final_y = by
    final_w = bw
    final_h = ay2 - by 
    
    box_data = (final_x, final_y, final_w, final_h) 
    
    height_mm = final_h / pmm_y
    width_mm = od_flats_mm # Set side width value directly to OD Flats (36mm) measurement
    
    h_pass = (SIDE_HEIGHT_MIN <= height_mm <= SIDE_HEIGHT_MAX)
    w_pass = od_pass # If OD Flat passes, side width also passes; else both fail
    overall_status = "PASS" if (h_pass and w_pass) else "FAIL"
    
    return height_mm, width_mm, overall_status, h_pass, w_pass, box_data

# =====================================================================
# 6. MAIN LOOP
# =====================================================================
print("\n[INFO] CAPNUT SCRIPT RUNNING. Press 'q' to quit.")

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
            
            results = model(frame_bgr, stream=True, verbose=False, conf=0.25) 
            annotated_frame = frame_bgr.copy()
            
            ai_box = None
            has_defect = False
            
            # 🧠 THE CLASS FILTER: Separates Measurements from Defect Alarms
            for r in results:
                annotated_frame = r.plot()  # Draws all YOLO boxes (OK_Part and Face_Damage)
                
                for box, cls in zip(r.boxes.xyxy, r.boxes.cls):
                    class_name = r.names[int(cls)]
                    
                    if class_name.lower() in ("ok_part", "okay", "okay_part", "capnut", "ok_capnut"):
                        # We ONLY use the OK_Part box for measurement math!
                        ai_box = box.cpu().numpy()
                    else:
                        # If it sees ANYTHING else (Face_Damage, Undersize, etc.), flag the alarm!
                        has_defect = True
            
            name = ""
            
            if idx == TOP_CAM_INDEX: 
                name = "CAM (TOP VIEW)"
                od_flats, id_mm, status, od_pass, id_pass, rect_box, circle_id = measure_top_view(frame_bgr, PMM_CAM_TOP_OD, PMM_CAM_TOP_ID, ai_box)
                
                # 🚨 OVERRIDE STATUS IF YOLO FOUND A DEFECT!
                if has_defect:
                    status = "FAIL (DEFECT)"
                    status_color = (0, 0, 255)
                else:
                    status_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
                    
                c_od = (0, 255, 0) if od_pass else (0, 0, 255)
                c_id = (0, 255, 0) if id_pass else (0, 0, 255)
                
                if rect_box is not None and not has_defect: 
                    box = cv2.boxPoints(rect_box)
                    box = np.int32(box)
                    cv2.drawContours(annotated_frame, [box], 0, status_color, 2)
                
                if circle_id is not None:
                    cx_in, cy_in, r_in = circle_id
                    cv2.circle(annotated_frame, (cx_in, cy_in), r_in, (255, 0, 255), 2)

                display_frame = cv2.resize(annotated_frame, (640, 480))
                draw_text_outline(display_frame, f"ACTIVE: {name}", (10, 30), 0.8, (0, 255, 0))
                
                if status != "":
                    draw_text_outline(display_frame, f"STATUS: {status}", (10, 370), 1.0, status_color)
                    draw_text_outline(display_frame, f"OD (Flats 36mm): {od_flats:.2f}mm", (10, 410), 0.8, c_od)
                    draw_text_outline(display_frame, f"ID (Bore 17.15mm): {id_mm:.2f}mm", (10, 450), 0.8, c_id)
                
                ai_frames[0] = display_frame

            elif idx == SIDE_CAM_INDEX: 
                name = "CAM (SIDE VIEW)"
                # Pass OD flats measurement and pass flag from top view
                od_flats_val = od_flats if 'od_flats' in locals() else 0.0
                od_pass_val = od_pass if 'od_pass' in locals() else False
                height, width, status, h_pass, w_pass, box_data = measure_side_view(frame_bgr, PMM_CAM_SIDE_X, PMM_CAM_SIDE_Y, ai_box, od_flats_val, od_pass_val)
                
                # 🚨 OVERRIDE STATUS IF YOLO FOUND A DEFECT!
                if has_defect:
                    status = "FAIL (DEFECT)"
                    status_color = (0, 0, 255)
                else:
                    status_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
                    
                c_h = (0, 255, 0) if h_pass else (0, 0, 255)
                c_w = (0, 255, 0) if w_pass else (0, 0, 255)
                
                if box_data is not None and not has_defect:
                    bx, by, bw, bh = box_data
                    cv2.rectangle(annotated_frame, (bx, by), (bx + bw, by + bh), status_color, 2)

                display_frame = cv2.resize(annotated_frame, (640, 480))
                draw_text_outline(display_frame, f"ACTIVE: {name}", (10, 30), 0.8, (0, 255, 0))
                
                if status != "":
                    draw_text_outline(display_frame, f"STATUS: {status}", (10, 370), 1.0, status_color)
                    draw_text_outline(display_frame, f"Total Height: {height:.2f}mm", (10, 410), 0.8, c_h)
                    draw_text_outline(display_frame, f"Width: {width:.2f}mm", (10, 450), 0.8, c_w)
                
                ai_frames[1] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow("SYSMAC - CAPNUT MEASUREMENT", stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

for cam in cameras:
    cam.MV_CC_StopGrabbing()
    cam.MV_CC_CloseDevice()
    cam.MV_CC_DestroyHandle()

cv2.destroyAllWindows()