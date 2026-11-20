"""
pin1510_engine.py — Integration wrapper for Pin 1510 dual-model inspection.

Wraps DualModelInspectionEngine from models/Pin_1510/camera_lag.py for use
by part_runners.py without any camera I/O.  Receives plain numpy BGR frames.

Camera / slot settings (strictly from camera_lag.py SLOT_PROFILES):
  Camera_1 (TOP)  : exposure=5245.0,  gain=3.5,   rotations=2, VISUAL ONLY (best.pt)
  Camera_2 (LEFT) : exposure=20000.0, gain=9.65,  rotations=2, BOTH models, offsets={0,0,0}
  Camera_3 (RIGHT): exposure=78000.0, gain=9.5,   rotations=2, BOTH models, offsets={-20,-1,-20}
"""

import os
import math
import cv2
import numpy as np
from ultralytics import YOLO

# ── Model & calibration paths ─────────────────────────────────────────────────
_PIN_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "Pin_1510")

VISUAL_WEIGHTS    = os.path.join(_PIN_MODEL_DIR, "best.pt")
DIM_WEIGHTS       = os.path.join(_PIN_MODEL_DIR, "Dimension_best.pt")
CAMERA_MATRIX_NPY = os.path.join(_PIN_MODEL_DIR, "camera_matrix.npy")
DIST_COEFFS_NPY   = os.path.join(_PIN_MODEL_DIR, "dist_coeffs.npy")
HOMOGRAPHY_NPY    = os.path.join(_PIN_MODEL_DIR, "homography_matrix.npy")

# From camera_lag.py __main__
CALIB_WIDTH  = 1291
CALIB_HEIGHT = 1080

# Camera offsets from SLOT_PROFILES
_LEFT_OFFSETS  = {"length_mm": 0.0,   "width_mm": 0.0,  "dist_mm": 0.0}
_RIGHT_OFFSETS = {"length_mm": -20.0, "width_mm": -1.0, "dist_mm": -20.0}

# Tolerances (from original Pin_Measurement references)
_PIN_BODY_LENGTH_NOM  = 87.6
_PIN_BODY_LENGTH_TOL  = 0.2        # ±0.2 mm
_PIN_BODY_WIDTH_NOM   = 11.979
_PIN_BODY_WIDTH_TOL   = 0.021      # ±0.021 mm
_PIN_HOLE_DIA_NOM     = 3.2
_PIN_HOLE_DIA_TOL     = 0.1        # ±0.1 mm
_PIN_HOLE_DIST_NOM    = 81.2
_PIN_HOLE_DIST_TOL    = 0.2        # ±0.2 mm


def _is_ok_class(name: str) -> bool:
    """Returns True if the detected class represents an acceptable / non-defect part."""
    c = name.lower().replace("_", "").replace("-", "").replace(" ", "")
    # 'pin1510_okay', 'ok_part', 'okay', 'pass', 'good', 'nodefect'
    if any(ok_word in c for ok_word in ("okay", "ok", "pass", "good", "nodefect", "normal")):
        return True
    # If generic part name without defect tags
    if c in ("pin", "stud", "capnut", "adaptor", "adapter"):
        return True
    return False


# ── Singleton engine holder ───────────────────────────────────────────────────

class _EngineHolder:
    _instance = None

    @classmethod
    def get(cls) -> "DualModelEngine":
        if cls._instance is None:
            cls._instance = DualModelEngine()
        return cls._instance


class DualModelEngine:
    """
    Loads and caches both YOLO models + calibration matrices once at first use.
    Thread-safe reads (models are stateless per-inference after load).
    """

    def __init__(self):
        if not os.path.exists(VISUAL_WEIGHTS):
            raise FileNotFoundError(f"Pin 1510 visual weights not found: {VISUAL_WEIGHTS}")
        if not os.path.exists(DIM_WEIGHTS):
            raise FileNotFoundError(f"Pin 1510 dimension weights not found: {DIM_WEIGHTS}")

        print("[Pin1510] Loading visual model (best.pt)…")
        self.visual_model = YOLO(VISUAL_WEIGHTS)
        self.visual_names = self.visual_model.names

        print("[Pin1510] Loading dimension model (Dimension_best.pt)…")
        self.dim_model = YOLO(DIM_WEIGHTS)
        self.dim_names = self.dim_model.names

        # Load calibration (optional — mm scaling disabled if missing)
        self.mtx = self.dist = self.homography = self._newcameramtx = None
        try:
            self.mtx = np.load(CAMERA_MATRIX_NPY)
            self.dist = np.load(DIST_COEFFS_NPY)
            self.homography = np.load(HOMOGRAPHY_NPY)
            self._newcameramtx, _ = cv2.getOptimalNewCameraMatrix(
                self.mtx, self.dist,
                (CALIB_WIDTH, CALIB_HEIGHT), 1,
                (CALIB_WIDTH, CALIB_HEIGHT),
            )
            print("[Pin1510] Calibration matrices loaded (mm mode active).")
        except FileNotFoundError:
            print("[Pin1510][WARN] Calibration .npy files missing — mm homography scaling disabled.")

    # ── helpers ──────────────────────────────────────────────────────────────

    def _px_to_mm(self, px):
        """Convert a pixel point [x,y] to mm via homography."""
        if self.homography is None:
            return None
        pt = np.array([[[float(px[0]), float(px[1])]]], dtype=np.float32)
        return cv2.perspectiveTransform(pt, self.homography)[0][0]

    @staticmethod
    def _draw_text(img, text, org, font_scale=0.60, color=(0, 255, 140), thickness=2):
        font = cv2.FONT_HERSHEY_SIMPLEX
        (tw, th), bl = cv2.getTextSize(text, font, font_scale, thickness)
        x, y = int(org[0]), int(org[1])
        x1 = max(0, x - 8);  y1 = max(0, y - th - 6)
        x2 = min(img.shape[1], x + tw + 8); y2 = min(img.shape[0], y + bl + 6)
        if x2 > x1 and y2 > y1:
            roi = img[y1:y2, x1:x2]
            overlay = np.full_like(roi, (15, 15, 15), dtype=np.uint8)
            img[y1:y2, x1:x2] = cv2.addWeighted(overlay, 0.80, roi, 0.20, 0.0)
        cv2.putText(img, text, (x, y), font, font_scale, color, thickness, cv2.LINE_AA)

    # ── TOP camera: visual defect only (best.pt) ──────────────────────────────

    def run_visual_only(self, frame_bgr):
        """
        Camera_1 / TOP: runs ONLY best.pt visual detection.
        Returns (annotated_bgr, defect_list, status).
        """
        view = frame_bgr.copy()
        defects = []

        results = self.visual_model.predict(
            frame_bgr, conf=0.50, iou=0.45, imgsz=1280, verbose=False
        )

        if results and results[0].boxes is not None and len(results[0].boxes) > 0:
            res = results[0]
            names = res.names or self.visual_names
            src_h, src_w = frame_bgr.shape[:2]
            dst_h, dst_w = view.shape[:2]
            sx = dst_w / float(src_w); sy = dst_h / float(src_h)

            for (x1, y1, x2, y2), conf, cid in zip(
                res.boxes.xyxy.cpu().numpy(),
                res.boxes.conf.cpu().numpy(),
                res.boxes.cls.cpu().numpy().astype(int),
            ):
                cls_name = names.get(cid, str(cid)) if isinstance(names, dict) else names[cid]
                ix1, iy1 = int(x1 * sx), int(y1 * sy)
                ix2, iy2 = int(x2 * sx), int(y2 * sy)
                cv2.rectangle(view, (ix1, iy1), (ix2, iy2), (0, 220, 255), 3)
                self._draw_text(
                    view, f"VIS {cls_name} {conf*100:.1f}%",
                    (ix1, max(28, iy1 - 8)), color=(0, 255, 255)
                )
                if not _is_ok_class(cls_name):
                    defects.append({
                        "name": cls_name,
                        "confidence": round(float(conf), 3),
                        "bbox": [int(x1), int(y1), int(x2), int(y2)],
                        "cam": "TOP VIEW",
                    })

        status = "pass" if not defects else "reject"
        return view, defects, status

    # ── SIDE cameras: BOTH models (best.pt visual + Dimension_best.pt) ────────

    def run_both_models(self, frame_bgr, offsets=None, cam_label="SIDE VIEW"):
        """
        Camera_2 (LEFT) / Camera_3 (RIGHT): runs best.pt visual + Dimension_best.pt segmentation.
        Applies undistortion + homography mm measurement (if calibration available).
        Returns (annotated_bgr, defect_list, measurement_rows, status_measure).
        """
        offsets = offsets or {}
        length_offset = float(offsets.get("length_mm", 0.0))
        width_offset  = float(offsets.get("width_mm",  0.0))
        dist_offset   = float(offsets.get("dist_mm",   0.0))

        # Resize to calibration resolution + undistort
        resized = cv2.resize(frame_bgr, (CALIB_WIDTH, CALIB_HEIGHT))
        if self._newcameramtx is not None and self.dist is not None:
            view = cv2.undistort(resized, self.mtx, self.dist, None, self._newcameramtx)
        else:
            view = resized.copy()

        defects      = []
        measure_rows = []
        body_found   = False

        # 1) Visual defect model (best.pt)
        vis_results = self.visual_model.predict(
            view, conf=0.50, iou=0.45, imgsz=1280, verbose=False
        )
        if vis_results and vis_results[0].boxes is not None and len(vis_results[0].boxes) > 0:
            res = vis_results[0]
            names = res.names or self.visual_names
            for (x1, y1, x2, y2), conf, cid in zip(
                res.boxes.xyxy.cpu().numpy(),
                res.boxes.conf.cpu().numpy(),
                res.boxes.cls.cpu().numpy().astype(int),
            ):
                cls_name = names.get(cid, str(cid)) if isinstance(names, dict) else names[cid]
                cv2.rectangle(view, (int(x1), int(y1)), (int(x2), int(y2)), (0, 220, 255), 3)
                self._draw_text(
                    view, f"VIS {cls_name} {conf*100:.1f}%",
                    (int(x1), max(28, int(y1) - 8)), color=(0, 255, 255)
                )
                if not _is_ok_class(cls_name):
                    defects.append({
                        "name": cls_name,
                        "confidence": round(float(conf), 3),
                        "bbox": [int(x1), int(y1), int(x2), int(y2)],
                        "cam": cam_label,
                    })

        # 2) Dimensional model (Dimension_best.pt — segmentation masks)
        cx_img, cy_img = CALIB_WIDTH // 2, CALIB_HEIGHT // 2
        cv2.line(view, (cx_img, 0), (cx_img, CALIB_HEIGHT), (0, 0, 255), 1)
        cv2.line(view, (0, cy_img), (CALIB_WIDTH, cy_img), (0, 0, 255), 1)

        dim_results = self.dim_model.predict(
            view, conf=0.50, iou=0.45, imgsz=1280,
            retina_masks=True, verbose=False
        )

        sum_hole_dia_mm  = 0.0
        hole_dist_mm     = None
        hole_centers_px  = []
        hole_centers_mm  = []
        hole_count       = 0
        dim_pass_flags   = []

        if dim_results and dim_results[0].masks is not None:
            masks_xy = dim_results[0].masks.xy
            classes  = dim_results[0].boxes.cls

            for i in range(len(masks_xy)):
                if len(masks_xy[i]) < 3:
                    continue
                cls_idx    = int(classes[i])
                class_name = (
                    self.dim_names.get(cls_idx, str(cls_idx))
                    if isinstance(self.dim_names, dict) else self.dim_names[cls_idx]
                )
                contour = np.array(masks_xy[i], dtype=np.float32).reshape((-1, 1, 2))
                cv2.polylines(view, [np.int32(contour)], True, (255, 0, 0), 2)

                if "body" in class_name.lower():
                    body_found = True
                    x, y, w, h = cv2.boundingRect(np.int32(contour))
                    cv2.rectangle(view, (x, y), (x + w, y + h), (0, 255, 0), 2)

                    if self.homography is not None:
                        tl_mm = self._px_to_mm([x, y])
                        tr_mm = self._px_to_mm([x + w, y])
                        bl_mm = self._px_to_mm([x, y + h])
                        length_mm = math.hypot(bl_mm[0]-tl_mm[0], bl_mm[1]-tl_mm[1]) + length_offset
                        width_mm  = math.hypot(tr_mm[0]-tl_mm[0], tr_mm[1]-tl_mm[1]) + width_offset

                        len_pass = (
                            _PIN_BODY_LENGTH_NOM - _PIN_BODY_LENGTH_TOL <= length_mm <=
                            _PIN_BODY_LENGTH_NOM + _PIN_BODY_LENGTH_TOL
                        )
                        wid_pass = (
                            _PIN_BODY_WIDTH_NOM - _PIN_BODY_WIDTH_TOL <= width_mm <=
                            _PIN_BODY_WIDTH_NOM + _PIN_BODY_WIDTH_TOL
                        )
                        dim_pass_flags += [len_pass, wid_pass]

                        measure_rows.append({
                            "parameter": f"Body Length ({_PIN_BODY_LENGTH_NOM}mm)",
                            "measured":  round(length_mm, 3),
                            "expected":  _PIN_BODY_LENGTH_NOM,
                            "tolerance": _PIN_BODY_LENGTH_TOL,
                            "unit":      "mm",
                            "pass":      len_pass,
                        })
                        measure_rows.append({
                            "parameter": f"Body Width ({_PIN_BODY_WIDTH_NOM}mm)",
                            "measured":  round(width_mm, 3),
                            "expected":  _PIN_BODY_WIDTH_NOM,
                            "tolerance": _PIN_BODY_WIDTH_TOL,
                            "unit":      "mm",
                            "pass":      wid_pass,
                        })
                        label = f"Body L:{length_mm:.2f} W:{width_mm:.2f}"
                    else:
                        label = f"Body W:{w}px H:{h}px"
                        measure_rows.append({
                            "parameter": "Body (pixels, no calibration)",
                            "measured":  round(float(h), 1),
                            "expected":  _PIN_BODY_LENGTH_NOM,
                            "tolerance": _PIN_BODY_LENGTH_TOL,
                            "unit":      "px",
                            "pass":      False,
                        })
                    self._draw_text(view, label, (x + 20, max(28, y - 10)), color=(0, 255, 0))

                else:
                    # Hole
                    rect = cv2.minAreaRect(contour)
                    box_pixels = cv2.boxPoints(rect)
                    hole_count += 1

                    cpx, cpy = int(rect[0][0]), int(rect[0][1])
                    hole_centers_px.append((cpx, cpy))

                    cv2.drawContours(view, [np.int32(box_pixels)], 0, (0, 255, 0), 2)
                    cv2.circle(view, (cpx, cpy), 3, (0, 255, 255), -1)

                    if self.homography is not None:
                        pts_mm = cv2.perspectiveTransform(
                            np.array([box_pixels], dtype=np.float32), self.homography
                        )[0]
                        d1 = math.hypot(pts_mm[1][0]-pts_mm[0][0], pts_mm[1][1]-pts_mm[0][1])
                        d2 = math.hypot(pts_mm[2][0]-pts_mm[1][0], pts_mm[2][1]-pts_mm[1][1])
                        hole_dia = (d1 + d2) / 2.0
                        sum_hole_dia_mm += hole_dia
                        center_mm = self._px_to_mm([cpx, cpy])
                        hole_centers_mm.append(center_mm)

                        hd_pass = (
                            _PIN_HOLE_DIA_NOM - _PIN_HOLE_DIA_TOL <= hole_dia <=
                            _PIN_HOLE_DIA_NOM + _PIN_HOLE_DIA_TOL
                        )
                        dim_pass_flags.append(hd_pass)
                        measure_rows.append({
                            "parameter": f"Hole {hole_count} Dia ({_PIN_HOLE_DIA_NOM}mm)",
                            "measured":  round(hole_dia, 3),
                            "expected":  _PIN_HOLE_DIA_NOM,
                            "tolerance": _PIN_HOLE_DIA_TOL,
                            "unit":      "mm",
                            "pass":      hd_pass,
                        })
                        label = f"Hole {hole_count} Dia:{hole_dia:.2f}"
                    else:
                        px_dia = (rect[1][0] + rect[1][1]) / 2.0
                        label = f"Hole {hole_count} Dia:{px_dia:.1f}px"
                    self._draw_text(
                        view, label,
                        (int(box_pixels[0][0]) + 25, max(28, int(box_pixels[0][1]) + 5)),
                        color=(0, 255, 0)
                    )

            # Hole-to-hole distance
            if len(hole_centers_mm) == 2:
                if hole_centers_px[0][1] < hole_centers_px[1][1]:
                    top_px, bot_px = hole_centers_px[0], hole_centers_px[1]
                    top_mm_c, bot_mm_c = hole_centers_mm[0], hole_centers_mm[1]
                else:
                    top_px, bot_px = hole_centers_px[1], hole_centers_px[0]
                    top_mm_c, bot_mm_c = hole_centers_mm[1], hole_centers_mm[0]

                hole_dist_mm = (
                    math.hypot(bot_mm_c[0]-top_mm_c[0], bot_mm_c[1]-top_mm_c[1])
                    + dist_offset
                )
                dist_pass = (
                    _PIN_HOLE_DIST_NOM - _PIN_HOLE_DIST_TOL <= hole_dist_mm <=
                    _PIN_HOLE_DIST_NOM + _PIN_HOLE_DIST_TOL
                )
                dim_pass_flags.append(dist_pass)
                measure_rows.append({
                    "parameter": f"Hole-to-Hole Dist ({_PIN_HOLE_DIST_NOM}mm)",
                    "measured":  round(hole_dist_mm, 3),
                    "expected":  _PIN_HOLE_DIST_NOM,
                    "tolerance": _PIN_HOLE_DIST_TOL,
                    "unit":      "mm",
                    "pass":      dist_pass,
                })

                cv2.line(view, top_px, bot_px, (0, 255, 255), 2)
                mid = ((top_px[0]+bot_px[0])//2, (top_px[1]+bot_px[1])//2)
                self._draw_text(view, f"Dist: {hole_dist_mm:.2f} mm",
                                (mid[0]+15, max(28, mid[1])), color=(0, 255, 255))

            if hole_count > 0 and self.homography is not None:
                self._draw_text(
                    view, f"Sum Hole Dia: {sum_hole_dia_mm:.2f} mm",
                    (20, CALIB_HEIGHT - 24), color=(0, 255, 140)
                )

        measure_status = "PASS" if (bool(dim_pass_flags) and all(dim_pass_flags)) else "FAIL"

        # Overlay PASS/FAIL banner
        col = (0, 255, 0) if measure_status == "PASS" else (0, 0, 255)
        cv2.putText(view, f"MEASUREMENT: {measure_status}", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)

        defect_status = "pass" if not defects else "reject"
        return view, defects, measure_rows, measure_status, defect_status


# ── Public API (called by part_runners.py) ────────────────────────────────────

def pin1510_run_measurement(
    top: "np.ndarray | None",
    side: "np.ndarray | None",
    right: "np.ndarray | None" = None,
) -> dict:
    """
    Replacement for the generic run_measurement for 'pin' part.
    - TOP   camera → visual only (best.pt); no dimensional overlay.
    - LEFT  (side) camera → both models; left offsets {0,0,0}.
    - RIGHT camera  → both models; right offsets {-20,-1,-20}.

    Returns the standard dict expected by main.py run_test_batch:
      {status, measurements, top_annotated_b64, side_annotated_b64, right_annotated_b64 (optional)}
    """
    engine = _EngineHolder.get()
    rows   = []
    overall_pass_flags = []

    # TOP camera — visual only
    top_view = None
    if top is not None:
        top_ann, _, _ = engine.run_visual_only(top)
        top_view = cv2.resize(top_ann, (640, 480))
        cv2.putText(top_view, "TOP VIEW (Visual Defect)", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 230, 100), 2)
    else:
        top_view = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(top_view, "TOP VIEW (No Frame)", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (100, 100, 100), 2)

    # LEFT side camera — both models
    side_view = None
    if side is not None:
        s_ann, _, s_rows, s_mstatus, _ = engine.run_both_models(
            side, offsets=_LEFT_OFFSETS, cam_label="LEFT SIDE VIEW"
        )
        side_view = cv2.resize(s_ann, (640, 480))
        rows += [dict(r, **{"source": "LEFT"}) for r in s_rows]
        overall_pass_flags.append(s_mstatus == "PASS")
    else:
        side_view = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(side_view, "LEFT SIDE (No Frame)", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (100, 100, 100), 2)

    # RIGHT camera — both models
    right_view = None
    if right is not None:
        r_ann, _, r_rows, r_mstatus, _ = engine.run_both_models(
            right, offsets=_RIGHT_OFFSETS, cam_label="RIGHT SIDE VIEW"
        )
        right_view = cv2.resize(r_ann, (640, 480))
        rows += [dict(r, **{"source": "RIGHT"}) for r in r_rows]
        overall_pass_flags.append(r_mstatus == "PASS")

    overall = "PASS" if (bool(overall_pass_flags) and all(overall_pass_flags)) else "FAIL"

    # De-duplicate parameter names when both sides report same measurement
    seen = {}
    deduped = []
    for row in rows:
        key = row["parameter"] + "_" + row.get("source", "")
        if key not in seen:
            seen[key] = True
            deduped.append(row)

    result = {
        "status":           overall,
        "measurements":     deduped,
        "top_annotated_b64":  _frame_to_b64(top_view),
        "side_annotated_b64": _frame_to_b64(side_view),
    }
    if right_view is not None:
        result["right_annotated_b64"] = _frame_to_b64(right_view)
    return result


def pin1510_run_inspection(
    top: "np.ndarray | None",
    side: "np.ndarray | None",
    right: "np.ndarray | None" = None,
) -> dict:
    """
    Replacement for the generic run_inspection for 'pin' part.
    - TOP   → visual defect (best.pt only)
    - LEFT  → visual defect (best.pt from run_both_models)
    - RIGHT → visual defect (best.pt from run_both_models)
    """
    engine = _EngineHolder.get()

    all_defects   = []
    top_b64 = side_b64 = right_b64 = ""
    top_conf = side_conf = right_conf = 0.0

    # TOP
    if top is not None:
        t_ann, t_defects, _ = engine.run_visual_only(top)
        t_disp = cv2.resize(t_ann, (640, 480))
        t_label = f"INSPECT: {'NO DEFECTS' if not t_defects else str(len(t_defects))+' DEFECT(S)'}"
        t_col   = (0, 255, 0) if not t_defects else (0, 0, 255)
        cv2.putText(t_disp, t_label, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, t_col, 2)
        top_b64 = _frame_to_b64(t_disp)
        all_defects += t_defects
        top_conf = max((d["confidence"] for d in t_defects), default=0.0)
    else:
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank, "TOP VIEW (No Frame)", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (100, 100, 100), 2)
        top_b64 = _frame_to_b64(blank)

    # LEFT side
    if side is not None:
        s_ann, s_defects, _, _, _ = engine.run_both_models(
            side, offsets=_LEFT_OFFSETS, cam_label="LEFT SIDE VIEW"
        )
        s_disp = cv2.resize(s_ann, (640, 480))
        s_label = f"INSPECT: {'NO DEFECTS' if not s_defects else str(len(s_defects))+' DEFECT(S)'}"
        s_col   = (0, 255, 0) if not s_defects else (0, 0, 255)
        cv2.putText(s_disp, s_label, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, s_col, 2)
        side_b64 = _frame_to_b64(s_disp)
        all_defects += s_defects
        side_conf = max((d["confidence"] for d in s_defects), default=0.0)
    else:
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank, "LEFT SIDE (No Frame)", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (100, 100, 100), 2)
        side_b64 = _frame_to_b64(blank)

    # RIGHT side
    if right is not None:
        r_ann, r_defects, _, _, _ = engine.run_both_models(
            right, offsets=_RIGHT_OFFSETS, cam_label="RIGHT SIDE VIEW"
        )
        r_disp = cv2.resize(r_ann, (640, 480))
        r_label = f"INSPECT: {'NO DEFECTS' if not r_defects else str(len(r_defects))+' DEFECT(S)'}"
        r_col   = (0, 255, 0) if not r_defects else (0, 0, 255)
        cv2.putText(r_disp, r_label, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, r_col, 2)
        right_b64 = _frame_to_b64(r_disp)
        all_defects += r_defects
        right_conf = max((d["confidence"] for d in r_defects), default=0.0)
    else:
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank, "RIGHT SIDE (No Frame)", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (100, 100, 100), 2)
        right_b64 = _frame_to_b64(blank)

    avg_conf = round((top_conf + side_conf + right_conf) / 3.0, 3)
    status   = "pass" if not all_defects else "reject"

    return {
        "status":            status,
        "part_detected":     True,
        "defects":           all_defects,
        "model_accuracy":    {"top_conf": top_conf, "side_conf": side_conf, "avg_conf": avg_conf},
        "top_annotated_b64":   top_b64,
        "side_annotated_b64":  side_b64,
        "right_annotated_b64": right_b64,
    }


def _frame_to_b64(frame: np.ndarray) -> str:
    import base64
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode()

