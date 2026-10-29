from __future__ import annotations

import datetime
import logging
import os
import queue
import re
import threading
import time
from pathlib import Path
from typing import Optional
from uuid import uuid4

import numpy as np
import requests
from PIL import Image

from fqc_panel_logic import REQUIRED_COMPONENTS


LOG = logging.getLogger("gateway.fqc.alert_saver")
DEFAULT_FQC_ALERT_ENDPOINT = "http://127.0.0.1:8000/api/alerts/fqc/"
DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/cctvsoft"
DEFAULT_RECORDINGS_ROOT = "/home/wgtech/recordings"
DEFAULT_ALERT_IMAGE_URL_PREFIX = "/api/alerts/image"


class FQCAlertSaver:
    def __init__(self) -> None:
        self.endpoint = os.getenv("FQC_ALERT_ENDPOINT", DEFAULT_FQC_ALERT_ENDPOINT)
        self.enabled = os.getenv("FQC_ALERT_SAVE_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
        self.timeout_seconds = float(os.getenv("FQC_ALERT_SAVE_TIMEOUT", "2.0"))
        self.mongo_uri = os.getenv("FQC_MONGO_URI", DEFAULT_MONGO_URI)
        self.mongo_enabled = os.getenv("FQC_MONGO_FALLBACK_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
        self.recordings_root = Path(os.getenv("RECORDINGS_ROOT", DEFAULT_RECORDINGS_ROOT)).expanduser()
        self.image_url_prefix = os.getenv("FQC_ALERT_IMAGE_URL_PREFIX", DEFAULT_ALERT_IMAGE_URL_PREFIX).rstrip("/")
        self._queue: queue.Queue[dict] = queue.Queue(maxsize=100)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if not self.enabled or self._thread is not None:
            return
        LOG.info("FQC alert saver enabled endpoint=%s", self.endpoint)
        self._thread = threading.Thread(target=self._worker, name="fqc-alert-saver", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def submit_completed_event(
        self,
        *,
        event: dict,
        camera_id: str,
        model_name: str,
        model_id: str = "",
        yaml_path: str = "",
        frame_size: Optional[dict] = None,
        qr_id: str = "",
        snapshot_frame: Optional[np.ndarray] = None,
    ) -> None:
        if not self.enabled:
            return
        payload = self._build_payload(
            event=event,
            camera_id=camera_id,
            model_name=model_name,
            model_id=model_id,
            yaml_path=yaml_path,
            frame_size=frame_size or {},
            qr_id=qr_id,
        )
        self._attach_snapshot(
            payload,
            snapshot_frame=snapshot_frame,
            camera_id=camera_id,
            model_name=model_name,
            class_name=payload.get("class_name") or "PANEL_EVENT",
        )
        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            LOG.warning("FQC alert save queue full; dropping panel_id=%s", event.get("panel_id"))

    def _build_payload(
        self,
        *,
        event: dict,
        camera_id: str,
        model_name: str,
        model_id: str,
        yaml_path: str,
        frame_size: dict,
        qr_id: str,
    ) -> dict:
        missing = list(event.get("missing_components") or [])
        panel_id = str(event.get("panel_id") or f"{camera_id}-panel")
        is_ng = bool(missing)
        result_label = "NG" if is_ng else "GOOD"
        event_key = "PANEL_NG" if is_ng else "PANEL_GOOD"
        message = (
            f"Missing components in {panel_id}: {', '.join(missing)}"
            if is_ng
            else f"Panel {panel_id} GOOD"
        )
        ts_epoch = int(time.time() * 1000)
        ts_local = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        metadata = {
            "run_id": camera_id,
            "camera_id": camera_id,
            "class_id": None,
            "bbox": event.get("bbox") or {},
            "yaml_path": yaml_path,
            "model_id": model_id,
            "event_key": event_key,
            "voice_message": message if is_ng else "",
            "panel_id": panel_id,
            "qr_id": qr_id,
            "panel_status": event.get("status") or ("FAIL" if is_ng else "PASS"),
            "panel_result": result_label,
            "missing_components": missing,
            "detected_components": event.get("detected_components") or [],
            "expected_components": event.get("expected_components") or REQUIRED_COMPONENTS,
            "component_details": event.get("component_details") or [],
            "detected_count": event.get("detected_count") or 0,
            "missing_count": event.get("missing_count") if event.get("missing_count") is not None else len(missing),
            "required_count": event.get("required_count") or len(REQUIRED_COMPONENTS),
            "required_components": event.get("expected_components") or REQUIRED_COMPONENTS,
            "panel_bbox": event.get("bbox") or {},
            "panel_zone": event.get("zone_name") or event.get("zone_key") or "",
            "frame_size": frame_size,
            "full_panel_inside_roi": bool(event.get("full_panel_inside_roi", False)),
            "panel_side": event.get("side") or "",
            "location": camera_id,
        }
        return {
            "title": message,
            "model": model_name or "fqc_panel",
            "class_name": event_key,
            "message": message,
            "severity": "High",
            "status": "Active",
            "ts_epoch": ts_epoch,
            "ts_local": ts_local,
            "confidence": float(event.get("confidence") or 1.0),
            "camera": camera_id,
            "location": camera_id,
            "metadata": metadata,
        }

    @staticmethod
    def _safe_path_part(value: object) -> str:
        text = str(value or "unknown").strip()
        text = re.sub(r"[^A-Za-z0-9_.-]+", "_", text)
        return text.strip("._") or "unknown"

    def _attach_snapshot(
        self,
        payload: dict,
        *,
        snapshot_frame: Optional[np.ndarray],
        camera_id: str,
        model_name: str,
        class_name: str,
    ) -> None:
        if snapshot_frame is None:
            return
        try:
            safe_camera = self._safe_path_part(camera_id)
            safe_model = self._safe_path_part(model_name or "fqc_panel")
            safe_class = self._safe_path_part(class_name)
            alerts_dir = self.recordings_root / "alerts" / safe_camera / safe_model
            alerts_dir.mkdir(parents=True, exist_ok=True)
            filename = f"alert_{safe_class.lower()}_{uuid4().hex[:12]}.webp"
            file_path = alerts_dir / filename

            image = Image.fromarray(snapshot_frame[:, :, ::-1])
            image.save(file_path, "WEBP", quality=85)

            snapshot_url = f"{self.image_url_prefix}/{safe_camera}/{safe_model}/{filename}"
            metadata = payload.setdefault("metadata", {})
            metadata["snapshot_path"] = str(file_path)
            metadata["snapshot_url"] = snapshot_url
            payload["thumbnail_url"] = snapshot_url
        except Exception as exc:
            LOG.warning("FQC snapshot save failed: %s", exc)

    def _insert_payload_to_mongo(self, payload: dict) -> bool:
        if not self.mongo_enabled:
            return False
        try:
            from pymongo import MongoClient
            from pymongo.errors import ConfigurationError
        except Exception as exc:
            LOG.warning("FQC Mongo fallback unavailable; install pymongo: %s", exc)
            return False
        try:
            client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=1500)
            try:
                db = client.get_default_database()
            except ConfigurationError:
                db = client["cctvsoft"]
            document = dict(payload)
            document.setdefault("acknowledged", "False")
            document.setdefault("created_at", datetime.datetime.utcnow())
            result = db["fqc_alerts"].insert_one(document)
            LOG.info(
                "FQC alert inserted directly to Mongo id=%s panel_id=%s",
                result.inserted_id,
                payload.get("metadata", {}).get("panel_id"),
            )
            client.close()
            return True
        except Exception as exc:
            LOG.warning("FQC Mongo fallback insert failed: %s", exc)
            return False

    def _worker(self) -> None:
        while not self._stop.is_set():
            try:
                payload = self._queue.get(timeout=0.25)
            except queue.Empty:
                continue
            try:
                response = requests.post(self.endpoint, json=payload, timeout=self.timeout_seconds)
                if response.status_code >= 300:
                    LOG.warning(
                        "FQC alert save failed status=%s body=%s",
                        response.status_code,
                        response.text[:300],
                    )
                    self._insert_payload_to_mongo(payload)
                else:
                    LOG.info("FQC alert saved panel_id=%s", payload.get("metadata", {}).get("panel_id"))
            except Exception as exc:
                LOG.warning("FQC alert save failed: %s", exc)
                self._insert_payload_to_mongo(payload)
            finally:
                self._queue.task_done()
