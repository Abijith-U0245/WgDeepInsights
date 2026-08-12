import sys
import cv2
import numpy as np
from ultralytics import YOLO

# 1. IMPORT DEEPAK'S CAMERA MANAGER
from camera_manager import CameraManager

# =====================================================================
# 2. CALIBRATION & CAMERA SETTINGS (PERFECT CALIBRATION - LOCKED)
# =====================================================================
# 📏 PIXEL-TO-MM (PMM) FINAL PERFECT CALIBRATION
PMM_CAM_TOP_OD = 45.13  
PMM_CAM_TOP_ID = 47.28  
PMM_CAM_SIDE_X = 31.09  
PMM_CAM_SIDE_Y = 56.74  

# 🎯 CAPNUT BLUEPRINT TOLERANCES
TOP_OD_FLATS_MIN = 35.38 
TOP_OD_FLATS_MAX = 36.10  

TOP_ID_MIN = 16.95 
TOP_ID_MAX = 17.35

SIDE_HEIGHT_MIN = 17.40 
SIDE_HEIGHT_MAX = 17.60 

SIDE_WIDTH_MIN = 35.38 
SIDE_WIDTH_MAX = 36.10  

# =====================================================================
# 3. LOAD AI MODEL (RELATIVE PATH FOR SBC)
# =====================================================================
model = YOLO("surface_models/Capnut_best.pt")

# Initialize the central camera manager
cam_mgr = CameraManager.instance()

# =====================================================================
# HELPER: DRAW TEXT WITH BLACK OUTLINE FOR READABILITY
# =====================================================================
def draw_text_outline(img, text, position, font_scale, color):
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 2, cv2.LINE_AA)

# =====================================================================
# 4. CAPNUT MEASUREMENT LOGIC
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
    
    rect = cv2.minAreaRect(outer_contour)
    (cx, cy), (w_px, h_px), angle = rect
    
    od_flats_px = min(w_px, h_px)
    od_flats_mm = od_flats_px / pmm_od
    
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
        
    od_pass = (TOP_OD_FLATS_MIN <= od_flats_mm <= TOP_OD_FLATS_MAX)
    id_pass = (TOP_ID_MIN <= id_mm <= TOP_ID_MAX)
    overall_status = "PASS" if (od_pass and id_pass) else "FAIL"
    
    return od_flats_mm, id_mm, overall_status, od_pass, id_pass, rect, circle_id_data

def measure_side_view(full_img, pmm_x, pmm_y, ai_box):
    if ai_box is None:
        return 0.0, 0.0, "FAIL", False, False, None

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
        return 0.0, 0.0, "FAIL", False, False, None
        
    main_contour = max(valid_contours, key=cv2.contourArea)
    bx, by, bw, bh = cv2.boundingRect(main_contour)
    
    final_x = bx
    final_y = by
    final_w = bw
    final_h = ay2 - by 
    
    box_data = (final_x, final_y, final_w, final_h) 
    
    height_mm = final_h / pmm_y
    width_mm = final_w / pmm_x
    
    h_pass = (SIDE_HEIGHT_MIN <= height_mm <= SIDE_HEIGHT_MAX)
    w_pass = (SIDE_WIDTH_MIN <= width_mm <= SIDE_WIDTH_MAX)
    overall_status = "PASS" if (h_pass and w_pass) else "FAIL"
    
    return height_mm, width_mm, overall_status, h_pass, w_pass, box_data

# =====================================================================
# 5. MAIN LOOP
# =====================================================================
print("\n[INFO] CAPNUT MEASUREMENT (VIA CAMERA MANAGER) RUNNING. Press 'q' to quit.")

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
        results = model(frame_bgr, stream=True, verbose=False, conf=0.25) 
        annotated_frame = frame_bgr.copy()
        
        ai_box = None
        has_defect = False
        
        for r in results:
            for box, cls in zip(r.boxes.xyxy, r.boxes.cls):
                class_name = r.names[int(cls)]
                
                if class_name == "OK_Part":
                    ai_box = box.cpu().numpy()
                else:
                    has_defect = True
        
        if idx == 0: # TOP VIEW
            od_flats, id_mm, status, od_pass, id_pass, rect_box, circle_id = measure_top_view(frame_bgr, PMM_CAM_TOP_OD, PMM_CAM_TOP_ID, ai_box)
            
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

        elif idx == 1: # SIDE VIEW
            height, width, status, h_pass, w_pass, box_data = measure_side_view(frame_bgr, PMM_CAM_SIDE_X, PMM_CAM_SIDE_Y, ai_box)
            
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

# Safely release the RTSP streams
cam_mgr.shutdown()
cv2.destroyAllWindows()