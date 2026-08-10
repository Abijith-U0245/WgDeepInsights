import cv2
import numpy as np

class QRResult:
    def __init__(self, value, xyxy, crop):
        self.value = value
        self.xyxy = xyxy
        self.crop = crop

class QRScanner:
    def __init__(self):
        self.detector = cv2.QRCodeDetector()

    def scan(self, frame):
        results = []
        try:
            retval, decoded_info, points, _ = self.detector.detectAndDecodeMulti(frame)
            if retval and decoded_info:
                for val, pts in zip(decoded_info, points):
                    if not val or pts is None or len(pts) < 4:
                        continue
                    
                    pts = pts.astype(int)
                    x1 = int(np.min(pts[:, 0]))
                    y1 = int(np.min(pts[:, 1]))
                    x2 = int(np.max(pts[:, 0]))
                    y2 = int(np.max(pts[:, 1]))
                    
                    h, w = frame.shape[:2]
                    x1 = max(0, x1)
                    y1 = max(0, y1)
                    x2 = min(w, x2)
                    y2 = min(h, y2)
                    
                    crop = frame[y1:y2, x1:x2]
                    results.append(QRResult(val, (x1, y1, x2, y2), crop))
        except Exception as e:
            print(f"[QRScanner] Scan failed: {e}")
            
        return results
