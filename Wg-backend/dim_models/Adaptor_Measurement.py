import sys
import cv2
import numpy as np
from ultralytics import YOLO

# 1. IMPORT DEEPAK'S CAMERA MANAGER
from camera_manager import CameraManager

# =====================================================================
# 2. CALIBRATION & CAMERA SETTINGS (GOLDEN CALIBRATION - LOCKED)
# =====================================================================
# 📏 PIXEL-TO-MM (PMM) GOLDEN CALIBRATION (LOCKED)
PMM_CAM_TOP    = 57.89  
PMM_CAM_SIDE_X = 31.12  
PMM_CAM_SIDE_Y = 31.58  

# 🎯 REAL-WORLD CNC TOLERANCES (WIDENED)
TOP_ID_MIN = 9.70
TOP_ID_MAX = 10.30  

SIDE_HEIGHT_MIN = 43.70 
SIDE_HEIGHT_MAX = 44.30 
SIDE_WIDTH_MIN = 26.70  
SIDE_WIDTH_MAX = 27.30

# =====================================================================
# 3. LOAD AI MODEL (RELATIVE PATH FOR SBC)
# =====================================================================
model = YOLO("surface_models/Adaptor_best.pt")

# Initialize the central camera manager
cam_mgr = CameraManager.instance()

# =====================================================================
# 4. ROCK-SOLID MEASUREMENT LOGIC
# =====================================================================
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
# 5. MAIN LOOP
# =====================================================================
print("\n[INFO] ADAPTOR MEASUREMENT (VIA CAMERA MANAGER) RUNNING. Press 'q' to quit.")

while True:
    # --- GRAB FRAMES FROM MANAGER (Handles reconnects & demo mode) ---
    frame_top, frame_side = cam_mgr.grab_pair()
    
    ai_frames = [None, None] 
    feeds = [
        (0, "CAM (TOP VIEW)", frame_top),
        (1, "CAM (SIDE VIEW)", frame_side)
    ]
    
    for idx, name, frame_bgr in feeds:
        if frame_bgr is None:
            continue
            
        # --- YOLO AI RUNS IN BACKGROUND (PLOTTING DISABLED) ---
        results = model(frame_bgr, stream=True, verbose=False, conf=0.6) 
        annotated_frame = frame_bgr.copy()
        
        hud_status, hud_line1, hud_line2, hud_line3 = "", "", "", ""
        hud_color = (0, 255, 0)
        
        # --- ROUTE TO CORRECT MEASUREMENT LOGIC ---
        if idx == 0: # TOP VIEW
            id_mm, status, circle_id = measure_top_view(frame_bgr, PMM_CAM_TOP)
            
            hud_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
            
            if circle_id is not None:
                cx_in, cy_in, r_in = circle_id
                cv2.circle(annotated_frame, (cx_in, cy_in), r_in, (255, 0, 255), 4)
                
            hud_status = f"STATUS: {status}"
            hud_line1 = f"ID (10mm Bore): {id_mm:.2f}mm"

            display_frame = cv2.resize(annotated_frame, (640, 480))
            cv2.putText(display_frame, f"ACTIVE: {name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            if hud_status != "":
                cv2.putText(display_frame, hud_status, (10, 420), cv2.FONT_HERSHEY_SIMPLEX, 1.0, hud_color, 2)
                cv2.putText(display_frame, hud_line1, (10, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
            
            ai_frames[0] = display_frame

        elif idx == 1: # SIDE VIEW
            height, width, thread_count, status, box_data = measure_side_view(frame_bgr, PMM_CAM_SIDE_X, PMM_CAM_SIDE_Y)
            
            if box_data is not None:
                bx, by, bw, bh = box_data
                hud_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
                
                cv2.rectangle(annotated_frame, (bx, by), (bx + bw, by + bh), hud_color, 4)
                
                hud_status = f"STATUS: {status}"
                hud_line1 = f"Total Height: {height:.2f}mm"
                hud_line2 = f"Width: {width:.2f}mm"
                hud_line3 = f"Threads Count: {thread_count}"

            display_frame = cv2.resize(annotated_frame, (640, 480))
            cv2.putText(display_frame, f"ACTIVE: {name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            if hud_status != "":
                cv2.putText(display_frame, hud_status, (10, 370), cv2.FONT_HERSHEY_SIMPLEX, 1.0, hud_color, 2)
                cv2.putText(display_frame, hud_line1, (10, 405), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                cv2.putText(display_frame, hud_line2, (10, 440), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                cv2.putText(display_frame, hud_line3, (10, 475), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2) 
            
            ai_frames[1] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow("SYSMAC - ADAPTOR MEASUREMENT", stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Safely release the RTSP streams
cam_mgr.shutdown()
cv2.destroyAllWindows()