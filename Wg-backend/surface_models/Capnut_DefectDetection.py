import sys
import cv2
import numpy as np
from ultralytics import YOLO

# 1. IMPORT DEEPAK'S CAMERA MANAGER
from camera_manager import CameraManager

# =====================================================================
# 2. LOAD MODEL WITH RELATIVE PATH FOR SBC
# =====================================================================
model = YOLO("surface_models/Capnut_best.pt")

# Initialize the central camera manager
cam_mgr = CameraManager.instance()

print("\n[INFO] CAPNUT INFERENCE RUNNING ON RTSP (VIA CAMERA_MANAGER)...")

while True:
    # 3. GRAB FRAMES (Handles reconnects and demo mode automatically!)
    frame_top, frame_side = cam_mgr.grab_pair()
    
    ai_frames = [None, None]
    feeds = [(0, "CAM (TOP VIEW)", frame_top), (1, "CAM (SIDE VIEW)", frame_side)]

    for idx, name, frame in feeds:
        if frame is None:
            continue
            
        results = model(frame, stream=True, verbose=False, conf=0.6)
        annotated_frame = frame.copy()
        defect_count = 0

        # --- OKAY CLASS FILTER ---
        for r in results:
            for box in r.boxes:
                class_id = int(box.cls[0])
                class_name = model.names[class_id].lower()
                conf = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                if class_name in ["okay", "okay_pin"]:
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                else:
                    defect_count += 1
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(annotated_frame, f"{class_name} {conf:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        display_frame = cv2.resize(annotated_frame, (640, 480))
        cv2.putText(display_frame, f"ACTIVE: {name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        status_color = (0, 0, 255) if defect_count > 0 else (0, 255, 0)
        cv2.putText(display_frame, f"INSPECT: {defect_count} DEFECT(S)", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
        
        ai_frames[idx] = display_frame

    if ai_frames[0] is not None and ai_frames[1] is not None:
        stacked_feed = np.hstack([ai_frames[0], ai_frames[1]])
        cv2.imshow("SYSMAC - CAPNUT AI MODEL", stacked_feed)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Safely release the RTSP streams
cam_mgr.shutdown()
cv2.destroyAllWindows()