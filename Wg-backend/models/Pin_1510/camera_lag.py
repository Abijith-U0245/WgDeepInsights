import os
import sys
import time
import math
import ctypes
import numpy as np
import cv2
from ultralytics import YOLO

# Ensure Hikrobot MVS Python SDK (MvImport) is on sys.path
MVS_PYTHON_PATH = r"C:\Program Files (x86)\MVS\Development\Samples\Python\MvImport"
if os.path.exists(MVS_PYTHON_PATH) and MVS_PYTHON_PATH not in sys.path:
    sys.path.append(MVS_PYTHON_PATH)

from MvCameraControl_class import *


def decode_c_str(byte_array):
    return "".join(chr(b) for b in byte_array if b != 0).strip()


def format_ipv4(ip_int):
    return (
        f"{(ip_int >> 24) & 0xFF}."
        f"{(ip_int >> 16) & 0xFF}."
        f"{(ip_int >> 8) & 0xFF}."
        f"{ip_int & 0xFF}"
    )


def rotate_frame_n_times(frame, rot_count=2, clockwise=True):
    """
    Rotates a frame `rot_count` times by 90 degrees (default rot_count=2 -> 180 deg).
    """
    if frame is None:
        return None
    steps = int(rot_count) % 4
    if steps == 0:
        return frame
    rot_code = cv2.ROTATE_90_CLOCKWISE if clockwise else cv2.ROTATE_90_COUNTERCLOCKWISE
    out = frame
    for _ in range(steps):
        out = cv2.rotate(out, rot_code)
    return out


def draw_text_with_bg_opacity(img, text, org=(10, 22), font_scale=0.52,
                              text_color=(0, 255, 140), bg_color=(15, 15, 15),
                              bg_opacity=0.80, pad_x=8, pad_y=6, thickness=2):
    """
    Draws text over a semi-transparent background box where bg_opacity=0.80 means
    80% solid dark background and 20% underlying frame visibility.
    """
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)

    x, y = int(org[0]), int(org[1])
    x1 = max(0, x - pad_x)
    y1 = max(0, y - th - pad_y)
    x2 = min(img.shape[1], x + tw + pad_x)
    y2 = min(img.shape[0], y + baseline + pad_y)

    if x2 > x1 and y2 > y1:
        roi = img[y1:y2, x1:x2]
        overlay = np.full_like(roi, bg_color, dtype=np.uint8)
        blended = cv2.addWeighted(overlay, bg_opacity, roi, 1.0 - bg_opacity, 0.0)
        img[y1:y2, x1:x2] = blended

    cv2.putText(img, text, (x, y), font, font_scale, text_color, thickness, cv2.LINE_AA)
    return img


class DualModelInspectionEngine:
    """
    - `use_both_models=False` (Camera_1): runs ONLY `best.pt` visual detection.
    - `use_both_models=True` (Camera_2, Camera_3): runs BOTH `best.pt` (visual boxes)
      and `dimension_best.pt` (dimensional segmentation + undistortion + homography mm).
    """
    def __init__(self, visual_weights_path, dim_weights_path,
                 mtx=None, dist=None, homography=None,
                 calib_width=1291, calib_height=1080,
                 conf_thresh=0.50, iou_thresh=0.45, imgsz=1280, device=None):
        if not os.path.exists(visual_weights_path):
            raise FileNotFoundError(f"Visual YOLO weights not found: {visual_weights_path}")
        if not os.path.exists(dim_weights_path):
            raise FileNotFoundError(f"Dimension YOLO weights not found: {dim_weights_path}")

        self.visual_model = YOLO(visual_weights_path)
        self.visual_names = self.visual_model.names

        self.dim_model = YOLO(dim_weights_path)
        self.dim_names = self.dim_model.names

        self.mtx = mtx
        self.dist = dist
        self.homography = homography
        self.calib_width = int(calib_width)
        self.calib_height = int(calib_height)
        self.conf_thresh = float(conf_thresh)
        self.iou_thresh = float(iou_thresh)
        self.imgsz = int(imgsz)
        self.device = device

        self._newcameramtx = None
        if self.mtx is not None and self.dist is not None:
            self._newcameramtx, _ = cv2.getOptimalNewCameraMatrix(
                self.mtx,
                self.dist,
                (self.calib_width, self.calib_height),
                1,
                (self.calib_width, self.calib_height),
            )

    def convert_pixels_to_mm(self, pixels):
        if self.homography is None:
            return None
        pt = np.array([[[float(pixels[0]), float(pixels[1])]]], dtype=np.float32)
        mm_pt = cv2.perspectiveTransform(pt, self.homography)[0][0]
        return mm_pt

    def _predict_model(self, model, image_bgr, use_retina_masks=False):
        infer_kwargs = {
            "conf": self.conf_thresh,
            "iou": self.iou_thresh,
            "imgsz": self.imgsz,
            "retina_masks": use_retina_masks,
            "verbose": False,
        }
        if self.device is not None:
            infer_kwargs["device"] = self.device
        return model.predict(image_bgr, **infer_kwargs)

    def _draw_visual_boxes(self, view, image_bgr, bg_opacity=0.80):
        """
        Runs visual defect detection using `best.pt` and draws boxes onto `view`.
        """
        results = self._predict_model(self.visual_model, image_bgr, use_retina_masks=False)
        vis_items = []

        if results and len(results) > 0:
            res = results[0]
            names = res.names or self.visual_names
            if res.boxes is not None and len(res.boxes) > 0:
                boxes_xyxy = res.boxes.xyxy.cpu().numpy()
                confs = res.boxes.conf.cpu().numpy()
                cls_ids = res.boxes.cls.cpu().numpy().astype(int)

                src_h, src_w = image_bgr.shape[:2]
                dst_h, dst_w = view.shape[:2]
                sx = dst_w / float(src_w)
                sy = dst_h / float(src_h)

                for (x1, y1, x2, y2), conf, cid in zip(boxes_xyxy, confs, cls_ids):
                    cls_name = names.get(cid, str(cid)) if isinstance(names, dict) else names[cid]
                    det_text = f"VIS {cls_name} {conf * 100:.1f}%"
                    vis_items.append({"type": "visual", "class": cls_name, "conf": float(conf)})

                    ix1 = int(round(x1 * sx))
                    iy1 = int(round(y1 * sy))
                    ix2 = int(round(x2 * sx))
                    iy2 = int(round(y2 * sy))

                    cv2.rectangle(view, (ix1, iy1), (ix2, iy2), (0, 220, 255), 3)
                    draw_text_with_bg_opacity(
                        view,
                        det_text,
                        org=(ix1, max(28, iy1 - 8)),
                        font_scale=0.60,
                        text_color=(0, 255, 255),
                        bg_color=(15, 15, 15),
                        bg_opacity=bg_opacity,
                    )

        return vis_items

    def _infer_visual_only(self, frame_bgr, bg_opacity=0.80):
        """
        Runs ONLY `best.pt` visual detection (Camera_1).
        """
        view = frame_bgr.copy()
        vis_items = self._draw_visual_boxes(view, frame_bgr, bg_opacity=bg_opacity)
        summary = {
            "count": len(vis_items),
            "visual_count": len(vis_items),
            "dim_count": 0,
            "sum_hole_dia_mm": 0.0,
            "hole_dist_mm": None,
        }
        return view, vis_items, summary

    def _infer_both_models_mm(self, frame_bgr, offsets=None, bg_opacity=0.80):
        """
        Runs BOTH `best.pt` (visual boxes) AND `dimension_best.pt` (dimensional
        segmentation + undistortion + homography mm measurements) on Camera_2 and Camera_3.
        """
        offsets = offsets or {}
        length_offset = float(offsets.get("length_mm", 0.0))
        width_offset = float(offsets.get("width_mm", 0.0))
        dist_offset = float(offsets.get("dist_mm", 0.0))

        resized = cv2.resize(frame_bgr, (self.calib_width, self.calib_height))
        if self._newcameramtx is not None and self.dist is not None:
            view = cv2.undistort(resized, self.mtx, self.dist, None, self._newcameramtx)
        else:
            view = resized

        # 1) Run visual model (`best.pt`) on the calibrated view
        vis_items = self._draw_visual_boxes(view, view, bg_opacity=bg_opacity)

        # 2) Run dimensional model (`dimension_best.pt`) with masks + mm measurement
        results = self._predict_model(self.dim_model, view, use_retina_masks=True)

        center_x, center_y = self.calib_width // 2, self.calib_height // 2
        cv2.line(view, (center_x, 0), (center_x, self.calib_height), (0, 0, 255), 1)
        cv2.line(view, (0, center_y), (self.calib_width, center_y), (0, 0, 255), 1)

        dim_items = []
        sum_hole_dia_mm = 0.0
        hole_dist_mm = None

        if results and len(results) > 0 and results[0].masks is not None:
            masks_xy = results[0].masks.xy
            classes = results[0].boxes.cls

            hole_centers_pixels = []
            hole_centers_mm = []
            hole_count = 0

            for i in range(len(masks_xy)):
                if len(masks_xy[i]) < 3:
                    continue

                cls_idx = int(classes[i])
                class_name = (
                    self.dim_names.get(cls_idx, str(cls_idx))
                    if isinstance(self.dim_names, dict)
                    else self.dim_names[cls_idx]
                )
                contour = np.array(masks_xy[i], dtype=np.float32).reshape((-1, 1, 2))

                cv2.polylines(view, [np.int32(contour)], True, (255, 0, 0), 2)

                if "body" in class_name.lower():
                    x, y, w, h = cv2.boundingRect(np.int32(contour))
                    cv2.rectangle(view, (x, y), (x + w, y + h), (0, 255, 0), 2)

                    if self.homography is not None:
                        tl_mm = self.convert_pixels_to_mm([x, y])
                        tr_mm = self.convert_pixels_to_mm([x + w, y])
                        bl_mm = self.convert_pixels_to_mm([x, y + h])

                        length_mm = math.hypot(bl_mm[0] - tl_mm[0], bl_mm[1] - tl_mm[1]) + length_offset
                        width_mm = math.hypot(tr_mm[0] - tl_mm[0], tr_mm[1] - tl_mm[1]) + width_offset

                        dim_items.append({
                            "type": "body",
                            "length_mm": length_mm,
                            "width_mm": width_mm,
                        })
                        label = f"Body L:{length_mm:.2f} W:{width_mm:.2f}"
                    else:
                        dim_items.append({"type": "body", "w_px": w, "h_px": h})
                        label = f"Body W:{w}px H:{h}px"

                    draw_text_with_bg_opacity(
                        view,
                        label,
                        org=(x + 20, max(28, y - 10)),
                        font_scale=0.65,
                        text_color=(0, 255, 0),
                        bg_color=(15, 15, 15),
                        bg_opacity=bg_opacity,
                    )
                else:
                    rect = cv2.minAreaRect(contour)
                    box_pixels = cv2.boxPoints(rect)
                    hole_count += 1

                    center_pix_x, center_pix_y = int(rect[0][0]), int(rect[0][1])
                    hole_centers_pixels.append((center_pix_x, center_pix_y))

                    cv2.drawContours(view, [np.int32(box_pixels)], 0, (0, 255, 0), 2)
                    cv2.circle(view, (center_pix_x, center_pix_y), 3, (0, 255, 255), -1)

                    if self.homography is not None:
                        points_to_transform = np.array([box_pixels], dtype=np.float32)
                        box_mm = cv2.perspectiveTransform(points_to_transform, self.homography)[0]

                        dist1 = math.hypot(box_mm[1][0] - box_mm[0][0], box_mm[1][1] - box_mm[0][1])
                        dist2 = math.hypot(box_mm[2][0] - box_mm[1][0], box_mm[2][1] - box_mm[1][1])
                        hole_dia = (dist1 + dist2) / 2.0
                        sum_hole_dia_mm += hole_dia

                        center_mm = self.convert_pixels_to_mm([center_pix_x, center_pix_y])
                        hole_centers_mm.append(center_mm)

                        dim_items.append({
                            "type": "hole",
                            "hole_index": hole_count,
                            "dia_mm": hole_dia,
                        })
                        label = f"Hole {hole_count} Dia:{hole_dia:.2f}"
                    else:
                        px_dia = (rect[1][0] + rect[1][1]) / 2.0
                        dim_items.append({"type": "hole", "hole_index": hole_count, "dia_px": px_dia})
                        label = f"Hole {hole_count} Dia:{px_dia:.1f}px"

                    draw_text_with_bg_opacity(
                        view,
                        label,
                        org=(int(box_pixels[0][0]) + 25, max(28, int(box_pixels[0][1]) + 5)),
                        font_scale=0.65,
                        text_color=(0, 255, 0),
                        bg_color=(15, 15, 15),
                        bg_opacity=bg_opacity,
                    )

            if len(hole_centers_mm) == 2:
                if hole_centers_pixels[0][1] < hole_centers_pixels[1][1]:
                    top_hole_pix, bot_hole_pix = hole_centers_pixels[0], hole_centers_pixels[1]
                    top_hole_mm, bot_hole_mm = hole_centers_mm[0], hole_centers_mm[1]
                else:
                    top_hole_pix, bot_hole_pix = hole_centers_pixels[1], hole_centers_pixels[0]
                    top_hole_mm, bot_hole_mm = hole_centers_mm[1], hole_centers_mm[0]

                hole_dist_mm = (
                    math.hypot(
                        bot_hole_mm[0] - top_hole_mm[0],
                        bot_hole_mm[1] - top_hole_mm[1],
                    )
                    + dist_offset
                )
                dim_items.append({
                    "type": "hole_distance",
                    "distance_mm": hole_dist_mm,
                })

                cv2.line(view, top_hole_pix, bot_hole_pix, (0, 255, 255), 2)
                mid_x = (top_hole_pix[0] + bot_hole_pix[0]) // 2
                mid_y = (top_hole_pix[1] + bot_hole_pix[1]) // 2
                draw_text_with_bg_opacity(
                    view,
                    f"Dist: {hole_dist_mm:.2f} mm",
                    org=(mid_x + 15, max(28, mid_y)),
                    font_scale=0.65,
                    text_color=(0, 255, 255),
                    bg_color=(15, 15, 15),
                    bg_opacity=bg_opacity,
                )

            if hole_count > 0 and self.homography is not None:
                draw_text_with_bg_opacity(
                    view,
                    f"Sum Hole Dia: {sum_hole_dia_mm:.2f} mm",
                    org=(20, self.calib_height - 24),
                    font_scale=0.65,
                    text_color=(0, 255, 140),
                    bg_color=(15, 15, 15),
                    bg_opacity=bg_opacity,
                )

        all_items = vis_items + dim_items
        summary = {
            "count": len(all_items),
            "visual_count": len(vis_items),
            "dim_count": len(dim_items),
            "sum_hole_dia_mm": sum_hole_dia_mm,
            "hole_dist_mm": hole_dist_mm,
        }
        return view, all_items, summary

    def process_frame(self, frame_bgr, use_both_models=False, offsets=None, bg_opacity=0.80):
        t0 = time.perf_counter()
        if use_both_models:
            view, items, summary = self._infer_both_models_mm(
                frame_bgr, offsets=offsets, bg_opacity=bg_opacity
            )
        else:
            view, items, summary = self._infer_visual_only(frame_bgr, bg_opacity=bg_opacity)
        infer_ms = (time.perf_counter() - t0) * 1000.0
        return view, items, summary, infer_ms


class AutoAllocatedHikrobotGrabber:
    def __init__(self, slot_profiles, preferred_serials=None, target_fps=2.0):
        self.slot_profiles = slot_profiles
        self.preferred_serials = preferred_serials or {}
        self.target_fps = float(target_fps)
        self.frame_interval = 1.0 / self.target_fps if self.target_fps > 0 else 0.5
        self.allocated = []

    def discover_devices(self, retries=3, retry_delay_s=0.5):
        for attempt in range(1, retries + 1):
            device_list = MV_CC_DEVICE_INFO_LIST()
            tlayer_type = MV_GIGE_DEVICE | MV_USB_DEVICE

            ret = MvCamera.MV_CC_EnumDevices(tlayer_type, device_list)
            if ret != 0:
                raise RuntimeError(f"Device enumeration SDK error. Code: 0x{ret:x}")

            if device_list.nDeviceNum > 0:
                discovered = []
                for idx in range(device_list.nDeviceNum):
                    dev_info = ctypes.cast(
                        device_list.pDeviceInfo[idx], ctypes.POINTER(MV_CC_DEVICE_INFO)
                    ).contents

                    if dev_info.nTLayerType == MV_GIGE_DEVICE:
                        gige = dev_info.SpecialInfo.stGigEInfo
                        sn = decode_c_str(gige.chSerialNumber)
                        model = decode_c_str(gige.chModelName)
                        ip = format_ipv4(gige.nCurrentIp)
                    elif dev_info.nTLayerType == MV_USB_DEVICE:
                        usb = dev_info.SpecialInfo.stUsb3VInfo
                        sn = decode_c_str(usb.chSerialNumber)
                        model = decode_c_str(usb.chModelName)
                        ip = "USB3"
                    else:
                        continue

                    discovered.append({
                        "index": idx,
                        "serial": sn,
                        "model": model,
                        "ip": ip,
                        "dev_info": dev_info,
                    })

                discovered.sort(key=lambda d: (d["ip"], d["serial"]))
                return discovered

            if attempt < retries:
                print(
                    f"[WARN] EnumDevices returned Code: 0x0 with 0 cameras "
                    f"(attempt {attempt}/{retries}); retrying in {retry_delay_s}s..."
                )
                time.sleep(retry_delay_s)

        raise RuntimeError(
            "No Hikrobot cameras found (EnumDevices returned Code: 0x0, nDeviceNum=0). "
            "Close Hikrobot MVS Client or any lingering Python processes, and check "
            "GigE switch power/cables and network adapter IP/subnet."
        )

    def auto_allocate_and_open(self):
        discovered = self.discover_devices()
        by_serial = {d["serial"]: d for d in discovered if d["serial"]}
        used_serials = set()

        print(f"[DISCOVERED] {len(discovered)} Hikrobot camera(s):")
        for d in discovered:
            print(f"  - SN: {d['serial']} | Model: {d['model']} | IP: {d['ip']}")

        assigned_map = {}
        for profile in self.slot_profiles:
            slot_name = profile["name"]
            pref_sn = self.preferred_serials.get(slot_name)
            if pref_sn and pref_sn in by_serial and pref_sn not in used_serials:
                assigned_map[slot_name] = by_serial[pref_sn]
                used_serials.add(pref_sn)

        remaining_devices = [d for d in discovered if d["serial"] not in used_serials]
        rem_idx = 0
        for profile in self.slot_profiles:
            slot_name = profile["name"]
            if slot_name not in assigned_map and rem_idx < len(remaining_devices):
                chosen = remaining_devices[rem_idx]
                assigned_map[slot_name] = chosen
                used_serials.add(chosen["serial"])
                rem_idx += 1

        if not assigned_map:
            raise RuntimeError("No cameras could be allocated to any slot.")

        for profile in self.slot_profiles:
            slot_name = profile["name"]
            if slot_name not in assigned_map:
                print(f"[WARN] No camera available for '{slot_name}' — skipping slot.")
                continue

            dev = assigned_map[slot_name]
            cam = MvCamera()

            ret = cam.MV_CC_CreateHandle(dev["dev_info"])
            if ret != 0:
                raise RuntimeError(f"[{slot_name}] CreateHandle failed: 0x{ret:x}")

            ret = cam.MV_CC_OpenDevice(MV_ACCESS_Exclusive, 0)
            if ret != 0:
                raise RuntimeError(f"[{slot_name}] OpenDevice failed: 0x{ret:x}")

            if dev["dev_info"].nTLayerType == MV_GIGE_DEVICE:
                pkt_size = cam.MV_CC_GetOptimalPacketSize()
                if int(pkt_size) > 0:
                    cam.MV_CC_SetIntValue("GevSCPSPacketSize", int(pkt_size))

            cam.MV_CC_SetImageNodeNum(1)

            cam.MV_CC_SetEnumValue("ExposureAuto", 0)
            cam.MV_CC_SetEnumValue("GainAuto", 0)
            cam.MV_CC_SetEnumValue("AcquisitionMode", MV_ACQ_MODE_CONTINUOUS)
            cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_ON)
            cam.MV_CC_SetEnumValue("TriggerSource", MV_TRIGGER_SOURCE_SOFTWARE)

            cam.MV_CC_SetFloatValue("ExposureTime", float(profile["exposure"]))
            cam.MV_CC_SetFloatValue("Gain", float(profile["gain"]))

            ret = cam.MV_CC_StartGrabbing()
            if ret != 0:
                raise RuntimeError(f"[{slot_name}] StartGrabbing failed: 0x{ret:x}")

            rotations = int(profile.get("rotations", 2))
            both_models = bool(profile.get("both_models", False))
            offsets = dict(profile.get("offsets", {}))
            entry = {
                "name": slot_name,
                "serial": dev["serial"],
                "model": dev["model"],
                "ip": dev["ip"],
                "cam": cam,
                "exposure": profile["exposure"],
                "gain": profile["gain"],
                "rotations": rotations,
                "both_models": both_models,
                "offsets": offsets,
            }
            self.allocated.append(entry)
            model_tag = "BOTH(best.pt + dimension_best.pt)" if both_models else "VIS_ONLY(best.pt)"
            print(
                f"[ALLOCATED] {slot_name} -> SN: {dev['serial']} "
                f"({dev['model']} @ {dev['ip']}) | Rot:{rotations}x | {model_tag} | Offsets:{offsets}"
            )

    def _drain_stale_buffer(self, cam):
        if hasattr(cam, "MV_CC_ClearImageBuffer"):
            cam.MV_CC_ClearImageBuffer()
            return

        while True:
            st_stale = MV_FRAME_OUT()
            ctypes.memset(ctypes.byref(st_stale), 0, ctypes.sizeof(st_stale))
            ret = cam.MV_CC_GetImageBuffer(st_stale, 0)
            if ret == 0:
                cam.MV_CC_FreeImageBuffer(st_stale)
            else:
                break

    def capture_single_frame(self, entry, timeout_ms=1500):
        cam = entry["cam"]
        name = entry["name"]

        self._drain_stale_buffer(cam)

        ret = cam.MV_CC_SetCommandValue("TriggerSoftware")
        if ret != 0:
            print(f"[ERROR] [{name}] TriggerSoftware failed: 0x{ret:x}")
            return None

        st_out_frame = MV_FRAME_OUT()
        ctypes.memset(ctypes.byref(st_out_frame), 0, ctypes.sizeof(st_out_frame))

        ret = cam.MV_CC_GetImageBuffer(st_out_frame, timeout_ms)
        if ret != 0:
            print(f"[ERROR] [{name}] GetImageBuffer failed: 0x{ret:x}")
            return None

        width = st_out_frame.stFrameInfo.nWidth
        height = st_out_frame.stFrameInfo.nHeight
        pixel_type = st_out_frame.stFrameInfo.enPixelType

        bgr_buf_size = width * height * 3
        bgr_buffer = (ctypes.c_ubyte * bgr_buf_size)()

        st_convert = MV_CC_PIXEL_CONVERT_PARAM()
        ctypes.memset(ctypes.byref(st_convert), 0, ctypes.sizeof(st_convert))
        st_convert.nWidth = width
        st_convert.nHeight = height
        st_convert.pSrcData = st_out_frame.pBufAddr
        st_convert.nSrcDataLen = st_out_frame.stFrameInfo.nFrameLen
        st_convert.enSrcPixelType = pixel_type
        st_convert.enDstPixelType = PixelType_Gvsp_BGR8_Packed
        st_convert.pDstBuffer = bgr_buffer
        st_convert.nDstBufferSize = bgr_buf_size

        ret = cam.MV_CC_ConvertPixelType(st_convert)
        if ret != 0:
            cam.MV_CC_FreeImageBuffer(st_out_frame)
            print(f"[ERROR] [{name}] ConvertPixelType failed: 0x{ret:x}")
            return None

        full_frame_bgr = (
            np.frombuffer(bgr_buffer, dtype=np.uint8)
            .reshape((height, width, 3))
            .copy()
        )
        cam.MV_CC_FreeImageBuffer(st_out_frame)

        rot_count = int(entry.get("rotations", 2))
        return rotate_frame_n_times(full_frame_bgr, rot_count=rot_count, clockwise=True)

    def capture_all_sequentially(self, engine=None, bg_opacity=0.80):
        results = {}
        total_items_across_cams = 0

        for entry in self.allocated:
            name = entry["name"]
            t0 = time.perf_counter()
            frame = self.capture_single_frame(entry)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            if frame is not None:
                annotated_frame = frame
                items = []
                summary = {
                    "count": 0,
                    "visual_count": 0,
                    "dim_count": 0,
                    "sum_hole_dia_mm": 0.0,
                    "hole_dist_mm": None,
                }
                infer_ms = 0.0

                if engine is not None:
                    annotated_frame, items, summary, infer_ms = engine.process_frame(
                        frame,
                        use_both_models=entry.get("both_models", False),
                        offsets=entry.get("offsets", {}),
                        bg_opacity=bg_opacity,
                    )

                total_items_across_cams += summary["count"]
                model_tag = "BOTH(best+dim)" if entry.get("both_models", False) else "VIS_ONLY(best.pt)"
                h, w, _ = annotated_frame.shape
                print(
                    f"[2FPS {model_tag}] {name} [SN:{entry['serial']}]: "
                    f"{w}x{h} | cap={elapsed_ms:.1f}ms | proc={infer_ms:.1f}ms | "
                    f"vis={summary['visual_count']} dim={summary['dim_count']}"
                )
                results[name] = {
                    "frame": frame,
                    "annotated": annotated_frame,
                    "items": items,
                    "summary": summary,
                    "elapsed_ms": elapsed_ms,
                    "infer_ms": infer_ms,
                    "meta": entry,
                }
            else:
                print(f"[FAILED] {name} [SN:{entry['serial']}]")

        print(f"[CYCLE ADD-UP] Total items across cameras: {total_items_across_cams}")
        return results

    def show_combined_single_window(self, results, tile_w=640, tile_h=480,
                                    cols=2, bg_opacity=0.80,
                                    window_name="Hikrobot 3-Cam 2FPS View"):
        items = list(results.items())
        n_cams = max(1, len(items))
        actual_cols = min(cols, n_cams)
        rows = math.ceil(n_cams / actual_cols)

        canvas_h = rows * tile_h
        canvas_w = actual_cols * tile_w
        canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

        total_add_up = 0

        for idx, (slot_name, res_item) in enumerate(items):
            r = idx // actual_cols
            c = idx % actual_cols
            y0 = r * tile_h
            x0 = c * tile_w

            vis_src = res_item.get("annotated", res_item["frame"])
            meta = res_item["meta"]
            summary = res_item.get("summary", {})
            item_count = int(summary.get("count", 0))
            total_add_up += item_count

            h, w, _ = vis_src.shape
            scale = min(tile_w / float(w), tile_h / float(h))
            fit_w = max(1, int(w * scale))
            fit_h = max(1, int(h * scale))
            resized = cv2.resize(vis_src, (fit_w, fit_h), interpolation=cv2.INTER_AREA)

            tile = np.zeros((tile_h, tile_w, 3), dtype=np.uint8)
            ox = (tile_w - fit_w) // 2
            oy = (tile_h - fit_h) // 2
            tile[oy:oy + fit_h, ox:ox + fit_w] = resized

            model_label = "BOTH(best+dim)" if meta.get("both_models", False) else "VIS(best.pt)"
            label = (
                f"{slot_name} | {model_label} | SN:{meta['serial']} | "
                f"Cnt:{item_count} | {res_item.get('infer_ms', 0.0):.1f}ms"
            )
            draw_text_with_bg_opacity(
                tile,
                label,
                org=(12, 26),
                font_scale=0.48,
                text_color=(0, 255, 140),
                bg_color=(12, 12, 12),
                bg_opacity=bg_opacity,
            )

            canvas[y0:y0 + tile_h, x0:x0 + tile_w] = tile

        draw_text_with_bg_opacity(
            canvas,
            f"2 FPS NO-QUEUE | TOTAL ADD-UP ITEMS: {total_add_up}",
            org=(16, canvas_h - 16),
            font_scale=0.62,
            text_color=(0, 255, 255),
            bg_color=(12, 12, 12),
            bg_opacity=bg_opacity,
        )

        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window_name, canvas_w, canvas_h)
        cv2.imshow(window_name, canvas)

    def close_all(self):
        for entry in self.allocated:
            cam = entry["cam"]
            cam.MV_CC_StopGrabbing()
            cam.MV_CC_CloseDevice()
            cam.MV_CC_DestroyHandle()
            print(f"[CLOSED] {entry['name']} (SN: {entry['serial']})")
        cv2.destroyAllWindows()


if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    VISUAL_WEIGHTS = os.path.join(BASE_DIR, "best.pt")
    DIM_WEIGHTS = os.path.join(BASE_DIR, "dimension_best.pt")

    CALIB_WIDTH = 1291
    CALIB_HEIGHT = 1080

    mtx = dist = homography = None
    try:
        mtx = np.load(os.path.join(BASE_DIR, "camera_matrix.npy"))
        dist = np.load(os.path.join(BASE_DIR, "dist_coeffs.npy"))
        homography = np.load(os.path.join(BASE_DIR, "homography_matrix.npy"))
        print("[CALIBRATION] Loaded camera_matrix.npy, dist_coeffs.npy, homography_matrix.npy")
    except FileNotFoundError:
        print("[WARN] Calibration .npy files not found — mm homography scaling disabled.")

    # Camera_1: ONLY best.pt (visual)
    # Camera_2 & Camera_3: BOTH best.pt (visual) AND dimension_best.pt (dimensional + mm measurement)
    SLOT_PROFILES = [
        {
            "name": "Camera_1",
            "exposure": 5245.0,
            "gain": 3.5,
            "rotations": 2,
            "both_models": False,
            "offsets": {},
        },
        {
            "name": "Camera_2",
            "exposure": 20000.0,
            "gain": 9.65,
            "rotations": 2,
            "both_models": True,
            "offsets": {"length_mm": 0.0, "width_mm": 0.0, "dist_mm": 0.0},
        },
        {
            "name": "Camera_3",
            "exposure": 78000.0,
            "gain": 9.50,
            "rotations": 2,
            "both_models": True,
            "offsets": {"length_mm": -20.0, "width_mm": -1.0, "dist_mm": -20.0},
        },
    ]

    PREFERRED_SERIALS = {
        # "Camera_1": "DB0763438",
        # "Camera_2": "DB0763412",
        # "Camera_3": "DB1473979",
    }

    output_dir = os.path.join(BASE_DIR, "video_2fps_dual_model_captures")
    os.makedirs(output_dir, exist_ok=True)

    engine = DualModelInspectionEngine(
        visual_weights_path=VISUAL_WEIGHTS,
        dim_weights_path=DIM_WEIGHTS,
        mtx=mtx,
        dist=dist,
        homography=homography,
        calib_width=CALIB_WIDTH,
        calib_height=CALIB_HEIGHT,
        conf_thresh=0.50,
        iou_thresh=0.45,
        imgsz=1280,
        device=0,
    )

    grabber = AutoAllocatedHikrobotGrabber(
        slot_profiles=SLOT_PROFILES,
        preferred_serials=PREFERRED_SERIALS,
        target_fps=2.0,
    )

    try:
        grabber.auto_allocate_and_open()
        print("\n[RUNNING 2 FPS NO-QUEUE | CAM1=VIS_ONLY | CAM2&CAM3=BOTH MODELS] 's' = Save | 'q' or ESC = Quit")

        latest_results = {}

        while True:
            cycle_start = time.perf_counter()

            latest_results = grabber.capture_all_sequentially(
                engine=engine,
                bg_opacity=0.80,
            )
            grabber.show_combined_single_window(
                latest_results,
                tile_w=640,
                tile_h=480,
                cols=2,
                bg_opacity=0.80,
            )

            elapsed = time.perf_counter() - cycle_start
            sleep_remaining = max(0.0, grabber.frame_interval - elapsed)
            sleep_deadline = time.perf_counter() + sleep_remaining

            should_exit = False
            while True:
                key = cv2.waitKey(5) & 0xFF
                if key in (ord("q"), 27):
                    should_exit = True
                    break
                elif key == ord("s") and latest_results:
                    ts = int(time.time() * 1000)
                    for slot_name, item in latest_results.items():
                        sn = item["meta"]["serial"]
                        img = item.get("annotated", item["frame"])
                        path = os.path.join(output_dir, f"{slot_name}_{sn}_{ts}.png")
                        cv2.imwrite(path, img)
                        print(f"[SAVED] {path} ({img.shape[1]}x{img.shape[0]})")

                if time.perf_counter() >= sleep_deadline:
                    break

            if should_exit:
                break

    finally:
        grabber.close_all()