import sys
import cv2
import numpy as np
from ultralytics import YOLO

# 1. IMPORT DEEPAK'S CAMERA MANAGER
from camera_manager import CameraManager

# =====================================================================
# 2. CALIBRATION & CAMERA SETTINGS
# =====================================================================
# 📏 PIXEL-TO-MM (PMM) FINAL LOCKS 
PMM_CAM_TOP_OD = 49.33  
PMM_CAM_SIDE_X = 30.98  
PMM_CAM_SIDE_Y = 30.16  
PMM_CAM_SIDE_HOLE = 8.16 

# 🎯 PIN (M631510) BLUEPRINT TOLERANCES
TOP_OD_MIN = 11.88 
TOP_OD_MAX = 12.08 

SIDE_HEIGHT_MIN = 87.40 
SIDE_HEIGHT_MAX = 87.80 

SIDE_WIDTH_MIN = 11.88 
SIDE_WIDTH_MAX = 12.08 

SIDE_HOLE_MIN = 3.10 
SIDE_HOLE_MAX = 3.30 

# =====================================================================
# 3. LOAD AI MODEL (RELATIVE PATH FOR SBC)
# =====================================================================
model = YOLO("surface_models/Pin_best.pt")

# Initialize the central camera manager
cam_mgr = CameraManager.instance()

# =====================================================================
# HELPER: DRAW TEXT WITH BLACK OUTLINE FOR READABILITY
# =====================================================================
def draw_text_outline(img, text, position, font_scale, color):
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, position, cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 2, cv2.LINE_AA)

# =====================================================================
# 4. PIN MEASUREMENT LOGIC (100% INDEPENDENT OF YOLO BOXES)
# =====================================================================
def measure_top_view(full_img, pmm_od):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    thresh_clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(thresh_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    valid_contours = [c for c in contours if cv2.contourArea(c) > 500]
    if len(valid_contours) < 1:
        return 0.0, "FAIL", False, None
        
    outer_contour = max(valid_contours, key=cv2.contourArea)
    
    # OD (OUTER DIAMETER)
    (cx, cy), radius_in_px = cv2.minEnclosingCircle(outer_contour)
    od_mm = (radius_in_px * 2) / pmm_od
    
    circle_od_data = (int(cx), int(cy), int(radius_in_px))
        
    od_pass = (TOP_OD_MIN <= od_mm <= TOP_OD_MAX)
    overall_status = "PASS" if od_pass else "FAIL"
    
    return od_mm, overall_status, od_pass, circle_od_data

def measure_side_view(full_img, pmm_x, pmm_y, pmm_hole):
    gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    
    _, thresh = cv2.threshold(blurred, 35, 255, cv2.THRESH_BINARY)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 60)) 
    fused_mask = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(fused_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid_contours = [c for c in contours if cv2.contourArea(c) > 5000]
    
    if not valid_contours:
        return 0.0, 0.0, [], "FAIL", False, False, None
        
    main_contour = max(valid_contours, key=cv2.contourArea)
    x, y, w_px, h_px = cv2.boundingRect(main_contour)
    
    box_data = (x, y, w_px, h_px)
    height_mm = h_px / pmm_y
    width_mm = w_px / pmm_x
    
    # 🕵️ THE HOLE HUNTER ALGORITHM
    hole_measurements = []
    
    crop_x = int(w_px * 0.15) 
    crop_y = int(h_px * 0.02)
    
    if w_px > crop_x*2 and h_px > crop_y*2:
        hole_roi = gray[y + crop_y : y + h_px - crop_y, x + crop_x : x + w_px - crop_x]
        
        roi_blur = cv2.GaussianBlur(hole_roi, (5, 5), 0)
        _, hole_thresh = cv2.threshold(roi_blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        contours, _ = cv2.findContours(hole_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        potential_holes = []
        for c in contours:
            area = cv2.contourArea(c)
            if 50 < area < 5000: 
                xh, yh, wh, hh = cv2.boundingRect(c)
                aspect_ratio = float(wh) / max(hh, 1) 
                if 0.5 < aspect_ratio < 2.0: 
                    potential_holes.append((xh, yh, wh, hh, c))
                    
        potential_holes = sorted(potential_holes, key=lambda p: cv2.contourArea(p[4]), reverse=True)[:2]
        
        for h_data in potential_holes:
            xh, yh, wh, hh, c = h_data
            
            global_cx = x + crop_x + xh + (wh // 2)
            global_cy = y + crop_y + yh + (hh // 2)
            dia_px = max(wh, hh) 
            global_r = dia_px // 2
            
            dia_mm = dia_px / pmm_hole
            hole_pass = (SIDE_HOLE_MIN <= dia_mm <= SIDE_HOLE_MAX)
            
            hole_measurements.append({
                "cx": global_cx, "cy": global_cy, "r": global_r, 
                "mm": dia_mm, "pass": hole_pass
            })
    
    h_pass = (SIDE_HEIGHT_MIN <= height_mm <= SIDE_HEIGHT_MAX)
    w_pass = (SIDE_WIDTH_MIN <= width_mm <= SIDE_WIDTH_MAX)
    
    all_holes_pass = len(hole_measurements) == 2 and all(h["pass"] for h in hole_measurements)
    
    overall_status = "PASS" if (h_pass and w_pass and all_holes_pass) else "FAIL"
    
    return height_mm, width_mm, hole_measurements, overall_status, h_pass, w_pass, box_data

# =====================================================================
# 5. MAIN LOOP
# =====================================================================
print("\n[INFO] PIN MEASUREMENT (VIA CAMERA MANAGER) RUNNING. Press 'q' to quit.")

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
        
        has_defect = False
        
        # 🧠 YOLO'S ONLY JOB: Screen for defects!
        for r in results:
            for box, cls in zip(r.boxes.xyxy, r.boxes.cls):
                class_name = r.names[int(cls)]
                if class_name != "okay_pin": 
                    has_defect = True
        
        if idx == 0: # TOP VIEW
            od_mm, status, od_pass, circle_od = measure_top_view(frame_bgr, PMM_CAM_TOP_OD)
            
            if has_defect:
                status = "FAIL (DEFECT)"
                status_color = (0, 0, 255)
            else:
                status_color = (0, 255, 0) if status == "PASS" else (0, 0, 255)
                
            c_od = (0, 255, 0) if od_pass else (0, 0, 255)
            
            if circle_od is not None and not has_defect:
                cx, cy, r_px = circle_od
                cv2.circle(annotated_frame, (cx, cy), r_px, status_color, 3)

            display_frame = cv2.resize(annotated_frame, (640, 480))
            draw_text_outline(display_frame, f"ACTIVE: {name}", (10, 30), 0.8, (0, 255, 0))
            
            if status != "":
                draw_text_outline(display_frame, f"STATUS: {status}", (10, 370), 1.0, status_color)
                draw_text_outline(display_frame, f"OD: {od_mm:.2f}mm", (10, 410), 0.8, c_od)
            
            ai_frames[0] = display_frame

        elif idx == 1: # SIDE VIEW
            height, width, holes, status, h_pass, w_pass, box_data = measure_side_view(frame_bgr, PMM_CAM_SIDE_X, PMM_CAM_SIDE_Y, PMM_CAM_SIDE_HOLE)
            
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
                
                for h_data in holes:
                    hc_color = (0, 255, 0) if h_data["pass"] else (0, 0, 255)
                    cv2.circle(annotated_frame, (h_data["cx"], h_data["cy"]), h_data["r"], hc_color, 2)

            display_frame = cv2.resize(annotated_frame, (640, 480))
            draw_text_outline(display_frame, f"ACTIVE: {name}", (10, 30), 0.8, (0, 255, 0))
            
            if status != "":
                draw_text_outline(display_frame, f"STATUS: {status}", (10, 310), 1.0, status_color)
                draw_text_outline(display_frame, f"Height: {height:.2f}mm", (10, 350), 0.8, c_h)
                draw_text_outline(display_frame, f"Width: {width:.2f}mm", (10, 390), 0.8, c_w)
                
                draw_text_outline(display_frame, f"Holes Found: {len(holes)}", (10, 430), 0.8, (255, 255, 0))
                if len(holes) > 0:
                    y_offset = 460
                    for i, h_data in enumerate(holes):
                        c_hole = (0, 255, 0) if h_data["pass"] else (0, 0, 255)
                        draw_text_outline(display_frame, f" H{i+1} Dia: {h_data['mm']:.2f}mm", (10, y_offset), 0.6, c_hole)
                        y_offset += 25
            
            ai_frames[1] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow("SYSMAC - PIN MEASUREMENT", stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Safely release the RTSP streams
cam_mgr.shutdown()
cv2.destroyAllWindows()