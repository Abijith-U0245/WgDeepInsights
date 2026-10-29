from __future__ import annotations

import threading
import time
from typing import Dict, List, Optional, Tuple


REQUIRED_COMPONENTS = [
    "GP",
    "Hook(L)",
    "Uat",
    "LR1",
    "Cyclone",
    "LR2",
    "Fang(L)",
    "Fang_Island",
    "Chin shim",
    "Fang(R)",
    "Outer_Trigger",
    "RR2",
    "Cyclone PF",
    "RR1",
    "strobe",
    "Hook(R)",
    "R_cam_PF",
    "Nut",
    "Strobe_bracket",
    "ASF",
]

PANEL_LABEL = "Panel"
TRIGGER_LABEL = "Chin shim"
ALERT_COOLDOWN_SECONDS = 20
LINE_TOUCH_TOLERANCE_PX = 14
PANEL_LOST_GRACE_SECONDS = 1.0
HARDCODED_PANEL_IDS = [
    "HYMHS9004VR0000WHF+9+0300210861912305110156333J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156334J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156335J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156336J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156337J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156338J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156339J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156340J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156341J",
    "HYMHS9004VR0000WHF+9+0300210861912305110156342J",
]

CLASS_NAME_BY_ID = {
    0: "GP",
    1: "Hook(L)",
    2: "Uat",
    3: "LR1",
    4: "Cyclone",
    5: "LR2",
    6: "Fang(L)",
    7: "Fang_Island",
    8: "Chin shim",
    9: "Fang(R)",
    10: "Outer_Trigger",
    11: "RR2",
    12: "Cyclone PF",
    13: "RR1",
    14: "strobe",
    15: "Hook(R)",
    16: "R_cam_PF",
    17: "Nut",
    18: "Strobe_bracket",
    19: "Panel",
    20: "ASF",
    21: "QR Code",
    22: "R_Cam_Missing",
    23: "LR_2_Missing",
    24: "Ink_mark",
    25: "Dent",
    26: "scratch",
    27: "fang_scratch",
    28: "RR1_missing",
}

DIRECT_MISSING_BY_KEY = {
    "r_cam_missing": "R_Cam_Missing",
    "lr_2_missing": "LR_2_Missing",
    "ink_mark": "Ink_mark",
    "dent": "Dent",
    "scratch": "scratch",
    "fang_scratch": "fang_scratch",
    "rr1_missing": "RR1_missing",
}

DIRECT_MISSING_COMPONENT_KEY_BY_KEY = {
    "r_cam_missing": "r_cam_pf",
    "lr_2_missing": "lr2",
    "rr1_missing": "rr1",
}
DIRECT_MISSING_LABEL_TO_COMPONENT_KEY = {
    DIRECT_MISSING_BY_KEY[missing_key]: component_key
    for missing_key, component_key in DIRECT_MISSING_COMPONENT_KEY_BY_KEY.items()
}
DIRECT_MISSING_CONFIRMATION_FRAMES = {
    "Dent": 3,
    "scratch": 3,
    "fang_scratch": 3,
}
DEFAULT_DIRECT_MISSING_CONFIRMATION_FRAMES = 1


def default_fqc_rois() -> List[Dict]:
    return [
        {"name": "zone1 left", "type": "rectangle", "coordinates": {"x1": 0.02, "y1": 0.04, "x2": 0.49, "y2": 0.96}},
        {"name": "line1 left", "type": "rectangle", "coordinates": {"x1": 0.47, "y1": 0.04, "x2": 0.50, "y2": 0.96}},
        {"name": "zone2 right", "type": "rectangle", "coordinates": {"x1": 0.51, "y1": 0.04, "x2": 0.98, "y2": 0.96}},
        {"name": "line2 right", "type": "rectangle", "coordinates": {"x1": 0.50, "y1": 0.04, "x2": 0.53, "y2": 0.96}},
    ]


def _normalize_label(value: str) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


REQUIRED_BY_KEY = {_normalize_label(label): label for label in REQUIRED_COMPONENTS}
PANEL_KEY = _normalize_label(PANEL_LABEL)
TRIGGER_KEY = _normalize_label(TRIGGER_LABEL)


def _bbox(det: Dict) -> Optional[Tuple[float, float, float, float]]:
    bbox = det.get("bbox") or det.get("box") or det.get("xyxy") or {}
    try:
        if isinstance(bbox, dict):
            return float(bbox["x1"]), float(bbox["y1"]), float(bbox["x2"]), float(bbox["y2"])
        if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            return tuple(float(value) for value in bbox[:4])
    except (KeyError, TypeError, ValueError):
        return None
    return None


def _center(box: Tuple[float, float, float, float]) -> Tuple[float, float]:
    return (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0


def _point_in_zone_norm(x: float, y: float, zone: Dict) -> bool:
    coords = zone.get("coordinates") or {}
    return (
        float(coords.get("x1", 0.0)) <= x <= float(coords.get("x2", 1.0))
        and float(coords.get("y1", 0.0)) <= y <= float(coords.get("y2", 1.0))
    )


def zone_box(zone: Dict, frame_w: int, frame_h: int) -> Optional[Tuple[float, float, float, float]]:
    coords = zone.get("coordinates") or {}
    try:
        x1, y1, x2, y2 = float(coords["x1"]), float(coords["y1"]), float(coords["x2"]), float(coords["y2"])
    except (KeyError, TypeError, ValueError):
        return None

    if max(abs(x1), abs(y1), abs(x2), abs(y2)) <= 1:
        x1 *= frame_w
        x2 *= frame_w
        y1 *= frame_h
        y2 *= frame_h
    return (
        max(0.0, min(float(frame_w - 1), min(x1, x2))),
        max(0.0, min(float(frame_h - 1), min(y1, y2))),
        max(1.0, min(float(frame_w), max(x1, x2))),
        max(1.0, min(float(frame_h), max(y1, y2))),
    )


def _overlap_ratio(box: Tuple[float, float, float, float], target: Tuple[float, float, float, float]) -> float:
    x1 = max(box[0], target[0])
    y1 = max(box[1], target[1])
    x2 = min(box[2], target[2])
    y2 = min(box[3], target[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area = max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])
    return inter / area if area > 0 else 0.0


def _boxes_touch(box: Tuple[float, float, float, float], target: Tuple[float, float, float, float]) -> bool:
    return not (
        box[2] < target[0] - LINE_TOUCH_TOLERANCE_PX
        or box[0] > target[2] + LINE_TOUCH_TOLERANCE_PX
        or box[3] < target[1] - LINE_TOUCH_TOLERANCE_PX
        or box[1] > target[3] + LINE_TOUCH_TOLERANCE_PX
    )


def _zone_name(zone: Dict, index: int) -> str:
    return str(zone.get("name") or f"zone{index + 1}").strip() or f"zone{index + 1}"


def _zone_number(zone_name: str, fallback_index: int) -> int:
    key = _normalize_label(zone_name)
    if "2" in key or "right" in key:
        return 2
    if "1" in key or "left" in key:
        return 1
    return fallback_index + 1


def _side_for_zone(zone_name: str, index: int) -> str:
    key = _normalize_label(zone_name)
    if "right" in key or "zone2" in key or key == "2":
        return "right"
    return "left" if index == 0 else "right"


def normalize_panel_detections(detections: List[Dict]) -> List[Dict]:
    normalized = []
    for det in detections or []:
        box = _bbox(det)
        if box is None:
            continue
        label = str(det.get("class_name") or "").strip()
        key = _normalize_label(label)
        if not label or (key not in REQUIRED_BY_KEY and key != PANEL_KEY):
            try:
                label = CLASS_NAME_BY_ID.get(int(det.get("class_id")), label)
            except (TypeError, ValueError):
                pass
            key = _normalize_label(label)
        if key == PANEL_KEY:
            normalized.append({"label": PANEL_LABEL, "key": PANEL_KEY, "box": box, "confidence": float(det.get("confidence") or 0.0)})
        elif key in DIRECT_MISSING_BY_KEY:
            normalized.append({
                "label": DIRECT_MISSING_BY_KEY[key],
                "key": key,
                "box": box,
                "confidence": float(det.get("confidence") or 0.0),
                "direct_missing": True,
            })
        elif key in REQUIRED_BY_KEY:
            normalized.append({"label": REQUIRED_BY_KEY[key], "key": key, "box": box, "confidence": float(det.get("confidence") or 0.0)})
    return normalized


class FQCPanelCheckingEngine:
    def __init__(self, camera_id: str):
        self.camera_id = camera_id or "unknown"
        self.next_panel_index = 1
        self.zone_tracks: Dict[str, Dict] = {}
        self.last_alert_time: Dict[str, float] = {}

    def _new_panel_id(self) -> str:
        if HARDCODED_PANEL_IDS:
            panel_id = HARDCODED_PANEL_IDS[(self.next_panel_index - 1) % len(HARDCODED_PANEL_IDS)]
        else:
            panel_id = f"{self.camera_id}-panel-{self.next_panel_index:04d}"
        self.next_panel_index += 1
        return panel_id

    def _prune_tracks(self, now: float) -> None:
        stale = [key for key, track in self.zone_tracks.items() if now - float(track.get("last_seen") or 0.0) > 10.0]
        for key in stale:
            self.zone_tracks.pop(key, None)

    def _start_or_update_track(self, zone_key: str, now: float, active: bool) -> Optional[Dict]:
        track = self.zone_tracks.get(zone_key)
        if active:
            if not track or not track.get("active"):
                track = {
                    "panel_id": self._new_panel_id(),
                    "first_seen": now,
                    "record_sent": False,
                    "alert_sent": False,
                    "line_reached": False,
                    "status": "INSPECTING",
                    "collected_keys": set(),
                    "collected_components": set(),
                    "confidences": {},
                    "direct_missing_hits": {},
                }
                self.zone_tracks[zone_key] = track
            track["active"] = True
            track["last_seen"] = now
            return track
        if track:
            track["active"] = False
            track["last_seen"] = now
        return None

    def _detections_in_zone(self, components: List[Dict], zone: Dict, box: Tuple[float, float, float, float], w: int, h: int) -> List[Dict]:
        items = []
        for component in components:
            cx, cy = _center(component["box"])
            if _point_in_zone_norm(cx / max(float(w), 1.0), cy / max(float(h), 1.0), zone) or _overlap_ratio(component["box"], box) >= 0.35:
                items.append(component)
        return items

    def _component_details(
        self,
        detected_keys: set,
        confidences: Dict[str, float],
        direct_missing_components: List[str],
        direct_missing_confidences: Dict[str, float],
    ) -> List[Dict]:
        details = [
            {
                "component": label,
                "detected": key in detected_keys,
                "confidence": round(float(confidences.get(key) or 0.0), 4),
                "result": "PASS" if key in detected_keys else "FAIL",
            }
            for key, label in REQUIRED_BY_KEY.items()
        ]
        existing = {item["component"] for item in details}
        for label in direct_missing_components:
            if label in existing:
                continue
            expected_key = DIRECT_MISSING_LABEL_TO_COMPONENT_KEY.get(label)
            if expected_key and expected_key in detected_keys:
                continue
            details.append({
                "component": label,
                "detected": False,
                "confidence": round(float(direct_missing_confidences.get(label) or 0.0), 4),
                "result": "FAIL",
                "defect_detected": True,
            })
        return details

    def process_frame(self, detections: List[Dict], roi_zones=None, frame_size: Optional[Dict] = None) -> Dict:
        now = time.time()
        self._prune_tracks(now)
        normalized = normalize_panel_detections(detections)
        panels = [det for det in normalized if det["key"] == PANEL_KEY]
        components = [det for det in normalized if det["key"] in REQUIRED_BY_KEY]
        direct_missing = [det for det in normalized if det.get("direct_missing")]
        frame_w = int((frame_size or {}).get("w") or 1920)
        frame_h = int((frame_size or {}).get("h") or 1080)
        zones = default_fqc_rois() if roi_zones is None else roi_zones
        inspection_zones = []
        line_zones: Dict[int, Dict] = {}

        for index, zone in enumerate(zones):
            name = _zone_name(zone, index)
            key = _normalize_label(name)
            number = _zone_number(name, index)
            if key.startswith("line"):
                line_zones[number] = zone
            elif key.startswith("zone"):
                inspection_zones.append((index, zone))

        panel_results = []
        events = []
        completed_events = []
        for fallback_index, (zone_index, zone) in enumerate(inspection_zones):
            zone_name = _zone_name(zone, fallback_index)
            zone_key = _normalize_label(zone_name) or f"zone{fallback_index + 1}"
            zone_number = _zone_number(zone_name, fallback_index)
            line_zone = line_zones.get(zone_number)
            inspection_box = zone_box(zone, frame_w, frame_h)
            line_box = zone_box(line_zone, frame_w, frame_h) if line_zone else None
            if inspection_box is None or line_box is None:
                continue

            zone_panels = self._detections_in_zone(panels, zone, inspection_box, frame_w, frame_h)
            zone_components = self._detections_in_zone(components, zone, inspection_box, frame_w, frame_h)
            zone_direct_missing = self._detections_in_zone(direct_missing, zone, inspection_box, frame_w, frame_h)
            existing = self.zone_tracks.get(zone_key) or {}
            recently_active = (
                bool(existing.get("active"))
                and not bool(existing.get("line_reached"))
                and now - float(existing.get("last_seen") or 0.0) <= PANEL_LOST_GRACE_SECONDS
            )
            track = self._start_or_update_track(
                zone_key,
                now,
                bool(zone_panels) or bool(zone_direct_missing) or (recently_active and bool(zone_components)),
            )
            if not track:
                continue

            for component in zone_components:
                track.setdefault("collected_keys", set()).add(component["key"])
                track.setdefault("collected_components", set()).add(component["label"])
                confidences = track.setdefault("confidences", {})
                confidences[component["key"]] = max(float(confidences.get(component["key"], 0.0)), float(component.get("confidence") or 0.0))
            for missing_det in zone_direct_missing:
                label = missing_det["label"]
                direct_missing_hits = track.setdefault("direct_missing_hits", {})
                direct_missing_hits[label] = int(direct_missing_hits.get(label, 0)) + 1
                required_hits = DIRECT_MISSING_CONFIRMATION_FRAMES.get(label, DEFAULT_DIRECT_MISSING_CONFIRMATION_FRAMES)
                if direct_missing_hits[label] < required_hits:
                    continue
                track.setdefault("direct_missing_components", set()).add(label)
                missing_confidences = track.setdefault("direct_missing_confidences", {})
                missing_confidences[label] = max(
                    float(missing_confidences.get(label, 0.0)),
                    float(missing_det.get("confidence") or 0.0),
                )

            finalized = bool(track.get("line_reached")) or any(
                _boxes_touch(item["box"], line_box)
                for item in zone_panels + zone_components + zone_direct_missing
                if item["key"] in {PANEL_KEY, TRIGGER_KEY} or item.get("direct_missing")
            )
            if finalized:
                track["line_reached"] = True

            if track.get("line_reached"):
                touching_line = any(
                    _boxes_touch(item["box"], line_box)
                    for item in zone_panels + zone_components + zone_direct_missing
                    if item["key"] in {PANEL_KEY, TRIGGER_KEY} or item.get("direct_missing")
                )
                if not touching_line:
                    self._start_or_update_track(zone_key, now, False)
                    continue

            detected_keys = set(track.get("collected_keys") or set())
            detected_components = set(track.get("collected_components") or set())
            confidences = dict(track.get("confidences") or {})
            direct_missing_components = [
                label
                for label in sorted(track.get("direct_missing_components") or set())
                if DIRECT_MISSING_LABEL_TO_COMPONENT_KEY.get(label) not in detected_keys
            ]
            direct_missing_confidences = dict(track.get("direct_missing_confidences") or {})
            missing = [label for key, label in REQUIRED_BY_KEY.items() if key not in detected_keys] if finalized else []
            if finalized:
                missing = list(dict.fromkeys(missing + direct_missing_components))
            status = ("PASS" if not missing else "FAIL") if finalized else "INSPECTING"
            result = {
                "panel_id": track["panel_id"],
                "status": status,
                "result": "GOOD" if status == "PASS" else ("NG" if status == "FAIL" else "INSPECTING"),
                "zone_name": zone_name,
                "side": _side_for_zone(zone_name, fallback_index),
                "detected_components": sorted(detected_components),
                "missing_components": missing,
                "component_details": self._component_details(
                    detected_keys,
                    confidences,
                    direct_missing_components,
                    direct_missing_confidences,
                ) if finalized else [],
                "detected_count": len(detected_keys),
                "required_count": len(REQUIRED_COMPONENTS),
                "missing_count": len(missing),
                "inspection_finalized": finalized,
            }
            panel_results.append(result)
            if finalized and not track.get("record_sent"):
                completed_events.append(result)
                track["record_sent"] = True
            if finalized and missing and not track.get("alert_sent"):
                events.append(result)
                track["alert_sent"] = True

        return {
            "panels": panel_results,
            "events": events,
            "completed_events": completed_events,
            "total_panels": len(panel_results),
            "passed_panels": sum(1 for item in panel_results if item["status"] == "PASS"),
            "failed_panels": sum(1 for item in panel_results if item["status"] == "FAIL"),
        }


_ENGINES: Dict[str, FQCPanelCheckingEngine] = {}
_LOCK = threading.Lock()


def get_fqc_panel_engine(camera_id: str) -> FQCPanelCheckingEngine:
    key = str(camera_id or "unknown").strip() or "unknown"
    with _LOCK:
        engine = _ENGINES.get(key)
        if engine is None:
            engine = FQCPanelCheckingEngine(camera_id=key)
            _ENGINES[key] = engine
        return engine


def reset_fqc_panel_engine(camera_id: str) -> None:
    key = str(camera_id or "unknown").strip() or "unknown"
    with _LOCK:
        _ENGINES.pop(key, None)
