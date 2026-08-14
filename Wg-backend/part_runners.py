"""
part_runners.py — Pure-function wrappers around each part's measurement and
defect-detection logic.  The heavy YOLO models are loaded once and cached.

Each runner receives numpy frames (top, side) and returns a structured dict.
No camera I/O here — that's done by CameraManager.
"""

import os
import sys
import time
import base64
import cv2
import numpy as np
from ultralytics import YOLO

# ── Absolute paths to model weights ──────────────────────────────────────────
_BASE = os.path.dirname(os.path.abspath(__file__))
_SURFACE_DIR = os.path.join(_BASE, "surface_models")

MODEL_PATHS: dict[str, str] = {
    "capnut":  os.path.join(_SURFACE_DIR, "Capnut_best.pt"),
    "stud":    os.path.join(_SURFACE_DIR, "Stud_best.pt"),
    "adapter": os.path.join(_SURFACE_DIR, "Adaptor_best.pt"),
    "adaptor": os.path.join(_SURFACE_DIR, "Adaptor_best.pt"),
    "pin":     os.path.join(_SURFACE_DIR, "Pin_best.pt"),
}

_YOLO_CACHE: dict[str, YOLO] = {}


def _get_model(part_key: str) -> YOLO:
    key = part_key.lower()
    if key not in _YOLO_CACHE:
        path = MODEL_PATHS.get(key)
        if not path or not os.path.exists(path):
            raise FileNotFoundError(f"Model not found for part '{key}': {path}")
        _YOLO_CACHE[key] = YOLO(path)
    return _YOLO_CACHE[key]


def _frame_to_b64(frame: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode()


# ══════════════════════════════════════════════════════════════════════════════
# CAPNUT
# ══════════════════════════════════════════════════════════════════════════════

# Blueprint tolerances (from Capnut_Measurement.py)
_CAPNUT = dict(
    PMM_TOP_OD=45.13, PMM_TOP_ID=47.28, PMM_SIDE_X=31.09, PMM_SIDE_Y=56.74,
    TOP_OD_MIN=35.38, TOP_OD_MAX=36.10,
    TOP_ID_MIN=16.95, TOP_ID_MAX=17.35,
    SIDE_H_MIN=17.40, SIDE_H_MAX=17.60,
    SIDE_W_MIN=35.38, SIDE_W_MAX=36.10,
)


def _capnut_top(img, pmm_od, pmm_id, ai_box):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if ai_box is not None:
        ax1, ay1, ax2, ay2 = map(int, ai_box)
        mask = np.zeros_like(thresh)
        pad = 30
        cv2.rectangle(mask, (max(0,ax1-pad), max(0,ay1-pad)),
                      (min(w_img,ax2+pad), min(h_img,ay2+pad)), 255, -1)
        thresh = cv2.bitwise_and(thresh, mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c) > 1000]
    if not valid:
        return 0.0, 0.0, "FAIL", False, False, None, None
    outer = max(valid, key=cv2.contourArea)
    rect = cv2.minAreaRect(outer)
    (cx, cy), (w_px, h_px), _ = rect
    od_flats_mm = min(w_px, h_px) / pmm_od
    id_mm, circle_id = 0.0, None
    box_size = int(min(w_px, h_px) * 0.7)
    x1 = max(0, int(cx - box_size//2)); y1 = max(0, int(cy - box_size//2))
    x2 = min(w_img, int(cx + box_size//2)); y2 = min(h_img, int(cy + box_size//2))
    if x2 > x1 and y2 > y1:
        roi = gray[y1:y2, x1:x2]
        _, rt = cv2.threshold(cv2.GaussianBlur(roi,(5,5),0), 0, 255,
                               cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        rc, _ = cv2.findContours(rt, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if rc:
            bc = max(rc, key=cv2.contourArea)
            (lcx, lcy), r_px = cv2.minEnclosingCircle(bc)
            id_mm = (r_px * 2) / pmm_id
            circle_id = (int(x1+lcx), int(y1+lcy), int(r_px))
    od_pass = _CAPNUT["TOP_OD_MIN"] <= od_flats_mm <= _CAPNUT["TOP_OD_MAX"]
    id_pass = _CAPNUT["TOP_ID_MIN"] <= id_mm      <= _CAPNUT["TOP_ID_MAX"]
    status  = "PASS" if (od_pass and id_pass) else "FAIL"
    return od_flats_mm, id_mm, status, od_pass, id_pass, rect, circle_id


def _capnut_side(img, pmm_x, pmm_y, ai_box):
    if ai_box is None:
        return 0.0, 0.0, "FAIL", False, False, None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7,7), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ax1, ay1, ax2, ay2 = map(int, ai_box)
    mask = np.zeros_like(thresh); pad = 20
    cv2.rectangle(mask, (max(0,ax1-pad), max(0,ay1-pad)),
                  (min(gray.shape[1],ax2+pad), min(gray.shape[0],ay2+pad)), 255, -1)
    thresh = cv2.bitwise_and(thresh, mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5,15))
    fused  = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    cnts, _ = cv2.findContours(fused, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c) > 2000]
    if not valid:
        return 0.0, 0.0, "FAIL", False, False, None
    main = max(valid, key=cv2.contourArea)
    bx, by, bw, bh = cv2.boundingRect(main)
    final_h = ay2 - by
    h_mm = final_h / pmm_y; w_mm = bw / pmm_x
    h_pass = _CAPNUT["SIDE_H_MIN"] <= h_mm <= _CAPNUT["SIDE_H_MAX"]
    w_pass = _CAPNUT["SIDE_W_MIN"] <= w_mm <= _CAPNUT["SIDE_W_MAX"]
    status = "PASS" if (h_pass and w_pass) else "FAIL"
    return h_mm, w_mm, status, h_pass, w_pass, (bx, by, bw, final_h)


# ══════════════════════════════════════════════════════════════════════════════
# STUD
# ══════════════════════════════════════════════════════════════════════════════

_STUD = dict(
    PMM_TOP=33.24, PMM_SIDE_Y=31.57,
    TOP_OD_MIN=7.70, TOP_OD_MAX=8.10,
    SIDE_H_MIN=37.30, SIDE_H_MAX=38.90,
)


def _stud_top(img, pmm, ai_box):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    blurred = cv2.GaussianBlur(gray,(7,7),0)
    _, thresh = cv2.threshold(blurred,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    if ai_box is not None:
        ax1,ay1,ax2,ay2 = map(int,ai_box)
        mask = np.zeros_like(thresh); pad=20
        cv2.rectangle(mask,(max(0,ax1-pad),max(0,ay1-pad)),
                      (min(w_img,ax2+pad),min(h_img,ay2+pad)),255,-1)
        thresh = cv2.bitwise_and(thresh, mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
    thresh = cv2.morphologyEx(thresh,cv2.MORPH_CLOSE,kernel)
    cnts,_ = cv2.findContours(thresh,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c)>500]
    if not valid: return 0.0,"ERROR",None
    outer = max(valid, key=cv2.contourArea)
    (cx,cy),r = cv2.minEnclosingCircle(outer)
    od_mm = (r*2)/pmm
    status = "PASS" if _STUD["TOP_OD_MIN"]<=od_mm<=_STUD["TOP_OD_MAX"] else "FAIL"
    return od_mm, status, (int(cx),int(cy),int(r))


def _stud_side(img, pmm_y, ai_box):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    blurred = cv2.GaussianBlur(gray,(7,7),0)
    _, thresh = cv2.threshold(blurred,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    if ai_box is not None:
        ax1,ay1,ax2,ay2 = map(int,ai_box)
        mask = np.zeros_like(thresh); pad=15
        cv2.rectangle(mask,(max(0,ax1-pad),max(0,ay1-pad)),
                      (min(w_img,ax2+pad),min(h_img,ay2+pad)),255,-1)
        thresh = cv2.bitwise_and(thresh, mask)
    thresh[-40:,:]=0
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT,(5,60))
    fused = cv2.morphologyEx(thresh,cv2.MORPH_CLOSE,kernel,iterations=2)
    cnts,_ = cv2.findContours(fused,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c)>2000]
    if not valid: return 0.0,0,"ERROR",None,[]
    main = max(valid,key=cv2.contourArea)
    x,y,w_px,h_px = cv2.boundingRect(main)
    height_mm = h_px/pmm_y
    status = "PASS" if _STUD["SIDE_H_MIN"]<=height_mm<=_STUD["SIDE_H_MAX"] else "FAIL"
    return height_mm, 0, status, (x,y,w_px,h_px), []


# ══════════════════════════════════════════════════════════════════════════════
# ADAPTER
# ══════════════════════════════════════════════════════════════════════════════

_ADAPTER = dict(
    PMM_TOP=57.89, PMM_SIDE_X=31.12, PMM_SIDE_Y=31.58,
    TOP_ID_MIN=9.70, TOP_ID_MAX=10.30,
    SIDE_H_MIN=43.70, SIDE_H_MAX=44.30,
    SIDE_W_MIN=26.70, SIDE_W_MAX=27.30,
)


def _adapter_top(img, pmm):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray,(7,7),0)
    _, thresh = cv2.threshold(blurred,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    cnts,_ = cv2.findContours(thresh,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c)>1000]
    if not valid: return 0.0,"ERROR",None
    outer = max(valid,key=cv2.contourArea)
    rect = cv2.minAreaRect(outer)
    (cx_o,cy_o),(w_px,h_px),_ = rect
    id_mm, circle_id = 0.0, None
    box_size = int(min(w_px,h_px)*0.6)
    x1=max(0,int(cx_o-box_size//2)); y1=max(0,int(cy_o-box_size//2))
    x2=min(gray.shape[1],int(cx_o+box_size//2)); y2=min(gray.shape[0],int(cy_o+box_size//2))
    if x2>x1 and y2>y1:
        roi = gray[y1:y2,x1:x2]
        _,rt = cv2.threshold(cv2.GaussianBlur(roi,(5,5),0),0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
        rc,_ = cv2.findContours(rt,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        if rc:
            bc = max(rc,key=cv2.contourArea)
            (lcx,lcy),r_px = cv2.minEnclosingCircle(bc)
            id_mm = (r_px*2)/pmm
            circle_id = (int(x1+lcx),int(y1+lcy),int(r_px))
    status = "PASS" if _ADAPTER["TOP_ID_MIN"]<=id_mm<=_ADAPTER["TOP_ID_MAX"] else "FAIL"
    return id_mm, status, circle_id


def _adapter_side(img, pmm_x, pmm_y):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray,(7,7),0)
    _, thresh = cv2.threshold(blurred,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    thresh[-40:,:]=0
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT,(5,60))
    fused = cv2.morphologyEx(thresh,cv2.MORPH_CLOSE,kernel,iterations=2)
    cnts,_ = cv2.findContours(fused,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c)>5000]
    if not valid: return 0.0,0.0,0,"ERROR",None
    main = max(valid,key=cv2.contourArea)
    x,y,w_px,h_px = cv2.boundingRect(main)
    h_mm = h_px/pmm_y; w_mm = w_px/pmm_x
    status = "PASS"
    if not (_ADAPTER["SIDE_H_MIN"]<=h_mm<=_ADAPTER["SIDE_H_MAX"] and
            _ADAPTER["SIDE_W_MIN"]<=w_mm<=_ADAPTER["SIDE_W_MAX"]):
        status = "FAIL"
    return h_mm, w_mm, 0, status, (x,y,w_px,h_px)


# ══════════════════════════════════════════════════════════════════════════════
# PIN  (updated per blueprint: ØA=11.979±0.021, L=87.6±0.2, hole=Ø3.2, C=81.2±0.2)
# ══════════════════════════════════════════════════════════════════════════════

_PIN = dict(
    PMM_TOP_OD=49.33, PMM_SIDE_X=30.98, PMM_SIDE_Y=30.16, PMM_SIDE_HOLE=8.16,
    TOP_OD_MIN=11.958, TOP_OD_MAX=12.000,      # Ø11.979 ± 0.021
    SIDE_H_MIN=87.40,  SIDE_H_MAX=87.80,        # 87.6 ± 0.2
    SIDE_W_MIN=11.958, SIDE_W_MAX=12.000,
    SIDE_HOLE_MIN=3.10, SIDE_HOLE_MAX=3.30,     # Ø3.2 nominal
)


def _pin_top(img, pmm_od):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray,(7,7),0)
    _, thresh = cv2.threshold(blurred,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
    thresh = cv2.morphologyEx(thresh,cv2.MORPH_CLOSE,kernel)
    cnts,_ = cv2.findContours(thresh,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c)>500]
    if not valid: return 0.0,"FAIL",False,None
    outer = max(valid,key=cv2.contourArea)
    (cx,cy),r = cv2.minEnclosingCircle(outer)
    od_mm = (r*2)/pmm_od
    od_pass = _PIN["TOP_OD_MIN"]<=od_mm<=_PIN["TOP_OD_MAX"]
    return od_mm, ("PASS" if od_pass else "FAIL"), od_pass, (int(cx),int(cy),int(r))


def _pin_side(img, pmm_x, pmm_y, pmm_hole):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray,(7,7),0)
    _, thresh = cv2.threshold(blurred,35,255,cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT,(15,60))
    fused = cv2.morphologyEx(thresh,cv2.MORPH_CLOSE,kernel)
    cnts,_ = cv2.findContours(fused,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    valid = [c for c in cnts if cv2.contourArea(c)>5000]
    if not valid: return 0.0,0.0,[],"FAIL",False,False,None
    main = max(valid,key=cv2.contourArea)
    x,y,w_px,h_px = cv2.boundingRect(main)
    h_mm = h_px/pmm_y; w_mm = w_px/pmm_x
    holes = []
    cx_off = int(w_px*0.15); cy_off = int(h_px*0.02)
    if w_px>cx_off*2 and h_px>cy_off*2:
        hroi = gray[y+cy_off:y+h_px-cy_off, x+cx_off:x+w_px-cx_off]
        _,ht = cv2.threshold(cv2.GaussianBlur(hroi,(5,5),0),0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
        hc,_ = cv2.findContours(ht,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        candidates = [(xh,yh,wh,hh,c) for c in hc
                      for xh,yh,wh,hh in [cv2.boundingRect(c)]
                      if 50<cv2.contourArea(c)<5000 and 0.5<wh/max(hh,1)<2.0]
        candidates.sort(key=lambda p: cv2.contourArea(p[4]), reverse=True)
        for xh,yh,wh,hh,_ in candidates[:2]:
            dia_px = max(wh,hh)
            dia_mm = dia_px/pmm_hole
            holes.append({
                "cx": x+cx_off+xh+wh//2, "cy": y+cy_off+yh+hh//2,
                "r": dia_px//2, "mm": round(dia_mm,3),
                "pass": _PIN["SIDE_HOLE_MIN"]<=dia_mm<=_PIN["SIDE_HOLE_MAX"]
            })
    h_pass = _PIN["SIDE_H_MIN"]<=h_mm<=_PIN["SIDE_H_MAX"]
    w_pass = _PIN["SIDE_W_MIN"]<=w_mm<=_PIN["SIDE_W_MAX"]
    all_holes_pass = len(holes)==2 and all(h["pass"] for h in holes)
    status = "PASS" if (h_pass and w_pass and all_holes_pass) else "FAIL"
    return h_mm, w_mm, holes, status, h_pass, w_pass, (x,y,w_px,h_px)


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def run_measurement(part: str, top: np.ndarray, side: np.ndarray) -> dict:
    """
    Runs dimensional measurement for the specified part.
    Returns:
        {
          "status": "PASS"|"FAIL",
          "measurements": [{"parameter":..,"measured":..,"tolerance":..,"unit":..,"pass":bool}],
          "top_annotated_b64": "<jpeg>",
          "side_annotated_b64": "<jpeg>",
        }
    """
    key = part.lower().replace("-", "").replace(" ", "")
    top_ann  = top.copy()
    side_ann = side.copy()
    rows: list[dict] = []

    model = _get_model(key)

    # Run YOLO to get object bounding box (for masking)
    def _get_ai_box(frame: np.ndarray) -> np.ndarray | None:
        results = list(model(frame, stream=True, verbose=False, conf=0.25))
        for r in results:
            for box, cls in zip(r.boxes.xyxy, r.boxes.cls):
                if r.names[int(cls)] in ("OK_Part", "okay_part", "Adaptor", "Stud", "Capnut", "Pin"):
                    return box.cpu().numpy()
            if len(r.boxes) > 0:
                return r.boxes.xyxy[0].cpu().numpy()
        return None

    top_box  = _get_ai_box(top)
    side_box = _get_ai_box(side)

    if key == "capnut":
        od, id_bore, status_top, od_p, id_p, rect, cid = _capnut_top(top, _CAPNUT["PMM_TOP_OD"], _CAPNUT["PMM_TOP_ID"], top_box)
        ht, wd, status_side, h_p, w_p, box_data = _capnut_side(side, _CAPNUT["PMM_SIDE_X"], _CAPNUT["PMM_SIDE_Y"], side_box)
        rows = [
            {"parameter":"OD Flats (36mm)",  "measured":round(od,3), "expected":35.74, "tolerance":0.36, "unit":"mm","pass":od_p},
            {"parameter":"ID Bore (17.15mm)", "measured":round(id_bore,3),"expected":17.15,"tolerance":0.20,"unit":"mm","pass":id_p},
            {"parameter":"Side Height",       "measured":round(ht,3), "expected":17.50, "tolerance":0.10,"unit":"mm","pass":h_p},
            {"parameter":"Side Width",        "measured":round(wd,3), "expected":35.74, "tolerance":0.36,"unit":"mm","pass":w_p},
        ]
        if rect:
            box = np.int32(cv2.boxPoints(rect))
            col = (0,255,0) if status_top=="PASS" else (0,0,255)
            cv2.drawContours(top_ann,[box],0,col,2)
        if cid:
            cv2.circle(top_ann,(cid[0],cid[1]),cid[2],(255,0,255),2)
        if box_data:
            bx,by,bw,bh = box_data; col=(0,255,0) if status_side=="PASS" else (0,0,255)
            cv2.rectangle(side_ann,(bx,by),(bx+bw,by+bh),col,2)
        overall = "PASS" if all(r["pass"] for r in rows) else "FAIL"

    elif key == "stud":
        od, status_top, circ = _stud_top(top, _STUD["PMM_TOP"], top_box)
        ht, _, status_side, box_data, _ = _stud_side(side, _STUD["PMM_SIDE_Y"], side_box)
        rows = [
            {"parameter":"Shank OD (7.9mm)",   "measured":round(od,3),"expected":7.90,"tolerance":0.20,"unit":"mm","pass":status_top=="PASS"},
            {"parameter":"Total Height (38.1mm)","measured":round(ht,3),"expected":38.10,"tolerance":0.80,"unit":"mm","pass":status_side=="PASS"},
        ]
        if circ: cv2.circle(top_ann,(circ[0],circ[1]),circ[2],(0,255,255),3)
        if box_data:
            bx,by,bw,bh=box_data; col=(0,255,0) if status_side=="PASS" else (0,0,255)
            cv2.rectangle(side_ann,(bx,by),(bx+bw,by+bh),col,3)
        overall = "PASS" if all(r["pass"] for r in rows) else "FAIL"

    elif key in ("adapter", "adaptor"):
        id_bore, status_top, circ = _adapter_top(top, _ADAPTER["PMM_TOP"])
        ht, wd, _, status_side, box_data = _adapter_side(side, _ADAPTER["PMM_SIDE_X"], _ADAPTER["PMM_SIDE_Y"])
        rows = [
            {"parameter":"ID Bore (10mm)",    "measured":round(id_bore,3),"expected":10.0,"tolerance":0.30,"unit":"mm","pass":status_top=="PASS"},
            {"parameter":"Side Height (44mm)","measured":round(ht,3),     "expected":44.0,"tolerance":0.30,"unit":"mm","pass":status_side=="PASS"},
            {"parameter":"Side Width (27mm)", "measured":round(wd,3),     "expected":27.0,"tolerance":0.30,"unit":"mm","pass":status_side=="PASS"},
        ]
        if circ: cv2.circle(top_ann,(circ[0],circ[1]),circ[2],(255,0,255),3)
        if box_data:
            bx,by,bw,bh=box_data; col=(0,255,0) if status_side=="PASS" else (0,0,255)
            cv2.rectangle(side_ann,(bx,by),(bx+bw,by+bh),col,3)
        overall = "PASS" if all(r["pass"] for r in rows) else "FAIL"

    elif key == "pin":
        od, status_top, od_p, circ = _pin_top(top, _PIN["PMM_TOP_OD"])
        ht, wd, holes, status_side, h_p, w_p, box_data = _pin_side(side, _PIN["PMM_SIDE_X"], _PIN["PMM_SIDE_Y"], _PIN["PMM_SIDE_HOLE"])
        rows = [
            {"parameter":"OD (Ø11.979mm)",  "measured":round(od,3),"expected":11.979,"tolerance":0.021,"unit":"mm","pass":od_p},
            {"parameter":"Length (87.6mm)",  "measured":round(ht,3),"expected":87.6,  "tolerance":0.20, "unit":"mm","pass":h_p},
            {"parameter":"Width (Ø11.979mm)","measured":round(wd,3),"expected":11.979,"tolerance":0.021,"unit":"mm","pass":w_p},
        ]
        for i, h in enumerate(holes):
            rows.append({"parameter":f"Hole {i+1} Dia (Ø3.2mm)","measured":round(h["mm"],3),"expected":3.2,"tolerance":0.10,"unit":"mm","pass":h["pass"]})
        if circ: cv2.circle(top_ann,(circ[0],circ[1]),circ[2],(0,255,255),3)
        if box_data:
            bx,by,bw,bh=box_data; col=(0,255,0) if status_side=="PASS" else (0,0,255)
            cv2.rectangle(side_ann,(bx,by),(bx+bw,by+bh),col,2)
            for h in holes:
                hc=(0,255,0) if h["pass"] else (0,0,255)
                cv2.circle(side_ann,(h["cx"],h["cy"]),h["r"],hc,2)
        overall = "PASS" if all(r["pass"] for r in rows) else "FAIL"

    else:
        raise ValueError(f"Unknown part key: {key}")

    # Resize annotated frames to display size
    top_disp  = cv2.resize(top_ann,  (640, 480))
    side_disp = cv2.resize(side_ann, (640, 480))
    col = (0,255,0) if overall=="PASS" else (0,0,255)
    cv2.putText(top_disp,  f"MEASUREMENT: {overall}", (10,40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)
    cv2.putText(side_disp, f"MEASUREMENT: {overall}", (10,40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)

    return {
        "status": overall,
        "measurements": rows,
        "top_annotated_b64":  _frame_to_b64(top_disp),
        "side_annotated_b64": _frame_to_b64(side_disp),
    }


def run_inspection(part: str, top: np.ndarray, side: np.ndarray) -> dict:
    """
    Runs YOLO surface defect detection for the specified part.
    Returns:
        {
          "status":        "pass" | "reject",
          "part_detected": bool,
          "defects":       [{"name":..,"confidence":..,"bbox":[x1,y1,x2,y2],"cam":..}],
          "model_accuracy": { "top_conf": float, "side_conf": float, "avg_conf": float },
          "top_annotated_b64":  "<jpeg>",
          "side_annotated_b64": "<jpeg>",
        }

    Untrained-parameter guard: if YOLO detects NO boxes at all on a frame,
    the part is treated as unrecognised and the inspection is forced to
    'reject' with a synthetic 'part_not_recognized' defect entry.
    """
    key = part.lower().replace("-","").replace(" ","")
    model = _get_model(key)

    OK_CLASSES = {"OK_Part", "okay_part", "okay_pin", "Adaptor", "Stud", "Capnut", "Pin"}
    defects: list[dict] = []

    # Per-camera confidence tracking
    top_max_conf  = 0.0
    side_max_conf = 0.0
    top_has_boxes  = False
    side_has_boxes = False

    def _process(frame: np.ndarray, cam_label: str):
        nonlocal top_max_conf, side_max_conf, top_has_boxes, side_has_boxes
        results = list(model(frame, stream=True, verbose=False, conf=0.25))
        ann = frame.copy()
        cam_boxes = 0
        cam_max_conf = 0.0
        for r in results:
            if len(r.boxes) > 0:
                ann = r.plot()
                cam_boxes += len(r.boxes)
            for box, cls, conf in zip(r.boxes.xyxy, r.boxes.cls, r.boxes.conf):
                c = float(conf)
                if c > cam_max_conf:
                    cam_max_conf = c
                cls_name = r.names[int(cls)]
                if cls_name not in OK_CLASSES:
                    x1,y1,x2,y2 = map(int, box.cpu().numpy())
                    defects.append({
                        "name": cls_name,
                        "confidence": round(c, 3),
                        "bbox": [x1, y1, x2, y2],
                        "cam": cam_label,
                    })
        if cam_label == "TOP VIEW":
            top_max_conf  = round(cam_max_conf, 3)
            top_has_boxes = cam_boxes > 0
        else:
            side_max_conf  = round(cam_max_conf, 3)
            side_has_boxes = cam_boxes > 0
        return ann

    top_ann  = _process(top,  "TOP VIEW")
    side_ann = _process(side, "SIDE VIEW")

    # ── Untrained parameter / unrecognised part guard ─────────────────────
    part_detected = top_has_boxes or side_has_boxes
    if not part_detected:
        # No boxes found on either camera → cannot evaluate; force reject
        defects.append({
            "name": "part_not_recognized",
            "confidence": 0.0,
            "bbox": [0, 0, 0, 0],
            "cam": "TOP VIEW",
        })

    status = "pass" if (len(defects) == 0 and part_detected) else "reject"
    avg_conf = round((top_max_conf + side_max_conf) / 2, 3)

    col   = (0,255,0) if status == "pass" else (0,0,255)
    label = "NO DEFECTS" if status == "pass" else (
        "NOT RECOGNIZED" if not part_detected else f"{len(defects)} DEFECT(S)"
    )
    top_disp  = cv2.resize(top_ann,  (640,480))
    side_disp = cv2.resize(side_ann, (640,480))
    cv2.putText(top_disp,  f"INSPECT: {label}", (10,40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)
    cv2.putText(side_disp, f"INSPECT: {label}", (10,40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)

    return {
        "status":         status,
        "part_detected":  part_detected,
        "defects":        defects,
        "model_accuracy": {
            "top_conf":  top_max_conf,
            "side_conf": side_max_conf,
            "avg_conf":  avg_conf,
        },
        "top_annotated_b64":  _frame_to_b64(top_disp),
        "side_annotated_b64": _frame_to_b64(side_disp),
    }
