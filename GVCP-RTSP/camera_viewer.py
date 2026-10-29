from __future__ import annotations

import json
import logging
import os
import time
import threading
import tkinter as tk
from tkinter import ttk
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageTk

from fqc_alert_saver import FQCAlertSaver
from fqc_panel_logic import (
    CLASS_NAME_BY_ID,
    DIRECT_MISSING_COMPONENT_KEY_BY_KEY,
    get_fqc_panel_engine,
    reset_fqc_panel_engine,
    zone_box,
)


LOG = logging.getLogger("gateway.camera.viewer")
APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent if APP_DIR.name == "app" else APP_DIR
LOCAL_MODEL_DIRS = (
    APP_DIR / "model",
    APP_DIR / "models",
    PROJECT_DIR / "model",
    PROJECT_DIR / "models",
    APP_DIR,
    PROJECT_DIR,
)
LOCAL_VIDEO_DIRS = (
    APP_DIR / "videos",
    PROJECT_DIR / "videos",
)
VIDEO_EXTENSIONS = {".avi", ".mp4", ".mov", ".mkv", ".webm", ".m4v"}
ULTRALYTICS_CONFIG_DIR = Path(
    os.getenv("YOLO_CONFIG_DIR", str(PROJECT_DIR / ".ultralytics"))
)
DASHBOARD_SETTINGS_PATH = Path(
    os.getenv("CAMERA_DASHBOARD_SETTINGS", str(PROJECT_DIR / "config" / "dashboard_settings.json"))
)
MISSING_DETECTION_KEYS = {
    "r_cam_missing",
    "lr_2_missing",
    "ink_mark",
    "dent",
    "scratch",
    "fang_scratch",
    "rr1_missing",
}
QR_DETECTION_KEY = "qr_code"
DEFAULT_CLASS_CONFIDENCE = 0.02
MIN_CLASS_CONFIDENCE = 0.001
MAX_CLASS_CONFIDENCE = 1.0


class TkinterCameraViewer:
    """
    Low-latency Hikrobot camera viewer.

    Architecture:
        MVS capture thread
             |
             v
        latest_frame
             |
             v
        Tkinter render loop

    Only the newest frame is retained.
    No frame queue is used, preventing display backlog.
    """

    def __init__(
        self,
        camera,
        title: str = "DeepInsight Live View",
        render_interval_ms: int = 15,
    ):
        self.camera = camera
        self.render_interval_ms = render_interval_ms

        self.root = tk.Tk()
        self.root.title(title)
        self.root.geometry("1360x820")
        self.root.minsize(1040, 680)
        self.root.configure(bg="#f8fafc")

        self.saved_settings = self._load_saved_settings()
        self.camera.config.update(self.saved_settings.get("camera_config", {}))

        self.status_var = tk.StringVar(value="Starting")
        self.camera_var = tk.StringVar(value="Camera: -")
        self.resolution_var = tk.StringVar(value="Resolution: -")
        self.exposure_var = tk.DoubleVar(value=float(self.camera.config.get("exposure", 10000)))
        self.exposure_text = tk.StringVar(value=str(int(self.exposure_var.get())))
        self.settings_message = tk.StringVar(value="")
        self.model_status_var = tk.StringVar(value="Models not loaded")
        self.assigned_model_var = tk.StringVar(value="Assigned model: -")
        self.source_status_var = tk.StringVar(value="Source: Hikrobot camera")
        self.selected_source_var = tk.StringVar(value="Hikrobot camera")
        self.class_confidence_thresholds = self._load_class_confidence_thresholds()
        self.selected_threshold_var = tk.StringVar(value=f"{DEFAULT_CLASS_CONFIDENCE:.3f}")
        self.threshold_status_var = tk.StringVar(value="")
        self.left_zone_status_var = tk.StringVar(value="WAITING FOR PANEL")
        self.left_zone_qr_var = tk.StringVar(value="--")
        self.left_zone_panel_var = tk.StringVar(value="--")
        self.left_zone_result_var = tk.StringVar(value="--")
        self.left_zone_missing_var = tk.StringVar(value="--")
        self.right_zone_status_var = tk.StringVar(value="WAITING FOR PANEL")
        self.right_zone_qr_var = tk.StringVar(value="--")
        self.right_zone_panel_var = tk.StringVar(value="--")
        self.right_zone_result_var = tk.StringVar(value="--")
        self.right_zone_missing_var = tk.StringVar(value="--")
        self.roi_mode_var = tk.StringVar(value="zone1 left")
        self.roi_draw_enabled = tk.BooleanVar(value=False)
        self.roi_message_var = tk.StringVar(value="")
        self.inference_run_id: Optional[str] = None
        self._current_source_key = "local-camera"
        self.models: list[dict] = []
        self.sources: list[dict] = []
        self.assigned_model: Optional[dict] = None
        self.assigned_source: dict = {"source_name": "Hikrobot camera", "source_type": "hikrobot", "source_path": ""}
        self._saved_model_name = self.saved_settings.get("assigned_model_name") or ""
        self._saved_source_name = self.saved_settings.get("assigned_source_name") or "Hikrobot camera"
        self.fqc_rois = self._load_fqc_rois()
        self._last_error = ""
        self._frame_count = 0
        self._inference_frame_count = 0
        self._annotated_stop = threading.Event()
        self._annotated_thread: Optional[threading.Thread] = None
        self._annotated_frame_lock = threading.Lock()
        self._latest_annotated_frame: Optional[np.ndarray] = None
        self._annotated_display_rect = (0, 0, 0, 0)
        self._annotated_frame_size = (0, 0)
        self._roi_drag_start: Optional[tuple[float, float]] = None
        self._roi_draft_norm: Optional[tuple[float, float, float, float]] = None
        self._roi_lock = threading.RLock()
        self._last_qr_by_side = {"left": "", "right": ""}
        self._last_qr_seen_at = {"left": 0.0, "right": 0.0}
        self._zone_qr_labels: dict[str, tk.Label] = {}
        self._zone_qr_images: dict[str, ImageTk.PhotoImage] = {}
        self._zone_qr_signature: dict[str, Optional[tuple]] = {"left": None, "right": None}
        self._zone_component_filter = {"left": "NG", "right": "NG"}
        self._zone_component_details = {"left": [], "right": []}
        self._zone_component_frames: dict[str, tk.Frame] = {}
        self._zone_component_canvases: dict[str, tk.Canvas] = {}
        self._zone_filter_buttons: dict[str, dict[str, tk.Label]] = {"left": {}, "right": {}}
        self._zone_render_signature = {"left": None, "right": None}
        self._zone_alert_state: dict[str, Optional[bool]] = {"left": None, "right": None}
        self._fqc_alert_saver = FQCAlertSaver()
        self.left_zone_card: Optional[tk.Frame] = None
        self.right_zone_card: Optional[tk.Frame] = None
        self._logo_tk_image: Optional[ImageTk.PhotoImage] = None

        self._build_styles()
        self._build_dashboard()
        self._fqc_alert_saver.start()

        self.running = threading.Event()

        self._frame_lock = threading.Lock()
        self._latest_frame: Optional[np.ndarray] = None

        self._capture_thread: Optional[threading.Thread] = None
        self._tk_image: Optional[ImageTk.PhotoImage] = None
        self._annotated_tk_image: Optional[ImageTk.PhotoImage] = None
        self._preview_active = False

        self.root.protocol(
            "WM_DELETE_WINDOW",
            self.close,
        )

    def _set_latest_frame(self, frame: np.ndarray) -> None:
        """
        Replace the previous frame.

        There is intentionally no queue here.
        Old frames are discarded automatically.
        """
        with self._frame_lock:
            self._latest_frame = frame

    def _get_latest_frame(self) -> Optional[np.ndarray]:
        with self._frame_lock:
            frame = self._latest_frame
            self._latest_frame = None

        return frame

    def _capture_loop(self) -> None:
        while self.running.is_set():
            try:
                frame = self.camera.read()

                if frame is None:
                    continue

                self._set_latest_frame(frame)

            except Exception as exc:
                self._last_error = str(exc)
                if self.running.is_set():
                    LOG.exception("Camera capture failed")
                break

    def _build_styles(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure(
            "Dashboard.TNotebook",
            background="#f8fafc",
            borderwidth=0,
        )
        style.configure(
            "Dashboard.TNotebook.Tab",
            background="#e5e7eb",
            foreground="#334155",
            padding=(18, 10),
            borderwidth=0,
        )
        style.map(
            "Dashboard.TNotebook.Tab",
            background=[("selected", "#ffffff")],
            foreground=[("selected", "#0f172a")],
        )

    def _build_dashboard(self) -> None:
        shell = tk.Frame(self.root, bg="#f8fafc")
        shell.pack(fill=tk.BOTH, expand=True)

        sidebar = tk.Frame(shell, width=210, bg="#ffffff", highlightbackground="#e2e8f0", highlightthickness=1)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)
        sidebar.pack_propagate(False)

        self._build_sidebar_brand(sidebar)

        self._status_card(sidebar, "Status", self.status_var)
        self._status_card(sidebar, "Camera", self.camera_var)
        self._status_card(sidebar, "Frame", self.resolution_var)


        content = tk.Frame(shell, bg="#f8fafc")
        content.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        header = tk.Frame(content, bg="#f8fafc")
        header.pack(fill=tk.X, padx=24, pady=(22, 14))
        tk.Label(
            header,
            text="Operator Dashboard",
            bg="#f8fafc",
            fg="#0f172a",
            font=("TkDefaultFont", 18, "bold"),
            anchor="w",
        ).pack(side=tk.LEFT)

        notebook = ttk.Notebook(content, style="Dashboard.TNotebook")
        notebook.pack(fill=tk.BOTH, expand=True, padx=24, pady=(0, 24))

        self.notebook = notebook
        live_tab = tk.Frame(notebook, bg="#05070a")
        annotated_tab = tk.Frame(notebook, bg="#f8fafc")
        settings_tab = tk.Frame(notebook, bg="#f8fafc")
        models_tab = tk.Frame(notebook, bg="#f8fafc")
        notebook.add(live_tab, text="Live View")
        notebook.add(annotated_tab, text="Annotated")
        notebook.add(settings_tab, text="Settings")
        notebook.add(models_tab, text="Models")

        live_tab.rowconfigure(0, weight=1)
        live_tab.columnconfigure(0, weight=1)
        self.image_label = tk.Label(
            live_tab,
            bg="black",
            fg="white",
            font=("TkDefaultFont", 15),
            borderwidth=0,
            highlightthickness=0,
        )
        self.image_label.grid(row=0, column=0, sticky="nsew")

        self._build_annotated_tab(annotated_tab)

        self._build_settings_tab(settings_tab)
        self._build_models_tab(models_tab)
        self.load_models()

    def _build_sidebar_brand(self, sidebar: tk.Frame) -> None:
        logo_path = PROJECT_DIR / "images" / "image.png"
        try:
            logo = Image.open(logo_path).convert("RGBA")
            max_width = 178
            if logo.width > max_width:
                height = int(logo.height * (max_width / float(logo.width)))
                logo = logo.resize((max_width, height), Image.Resampling.LANCZOS)
            self._logo_tk_image = ImageTk.PhotoImage(logo)
            tk.Label(
                sidebar,
                image=self._logo_tk_image,
                bg="#ffffff",
                anchor="w",
            ).pack(fill=tk.X, padx=12, pady=(22, 18))
        except Exception:
            LOG.exception("Failed to load sidebar logo: %s", logo_path)
            tk.Label(
                sidebar,
                text="DeepInsight",
                bg="#ffffff",
                fg="#0f172a",
                font=("TkDefaultFont", 20, "bold"),
                anchor="w",
            ).pack(fill=tk.X, padx=16, pady=(28, 2))
            tk.Label(
                sidebar,
                text="FQC Live Camera",
                bg="#ffffff",
                fg="#0284c7",
                font=("TkDefaultFont", 11),
                anchor="w",
            ).pack(fill=tk.X, padx=16, pady=(0, 30))

    def _build_annotated_tab(self, parent: tk.Frame) -> None:
        parent.rowconfigure(1, weight=1)
        parent.columnconfigure(1, weight=1)

        hero = tk.Frame(parent, bg="#ffffff", highlightbackground="#dbeafe", highlightthickness=1)
        hero.grid(row=0, column=0, columnspan=3, sticky="ew", padx=24, pady=(22, 20))
        hero.columnconfigure(0, weight=1)
        tk.Label(
            hero,
            text="FQC Operators",
            bg="#ffffff",
            fg="#0f172a",
            font=("TkDefaultFont", 18, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", padx=20, pady=(18, 4))
        tk.Label(
            hero,
            text=f"Live operator view for {self.camera.serial or 'current camera'} panel checks by left and right zone.",
            bg="#ffffff",
            fg="#46618f",
            font=("TkDefaultFont", 10),
            anchor="w",
        ).grid(row=1, column=0, sticky="ew", padx=20, pady=(0, 18))

        self._build_zone_panel(
            parent,
            row=1,
            column=0,
            title="Zone 1 Left",
            status_var=self.left_zone_status_var,
            qr_var=self.left_zone_qr_var,
            panel_var=self.left_zone_panel_var,
            result_var=self.left_zone_result_var,
            missing_var=self.left_zone_missing_var,
        )

        stream_card = tk.Frame(parent, bg="#ffffff", highlightbackground="#dbeafe", highlightthickness=1)
        stream_card.grid(row=1, column=1, sticky="nsew", padx=14, pady=(0, 24))
        stream_card.rowconfigure(3, weight=1)
        stream_card.columnconfigure(0, weight=1)
        tk.Label(
            stream_card,
            text="Live Stream",
            bg="#ffffff",
            fg="#0f172a",
            font=("TkDefaultFont", 13, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", padx=18, pady=(18, 2))
        tk.Label(
            stream_card,
            text=f"{self.camera.serial or 'camera'} annotated feed",
            bg="#ffffff",
            fg="#46618f",
            font=("TkDefaultFont", 9),
            anchor="w",
        ).grid(row=1, column=0, sticky="ew", padx=18, pady=(0, 14))

        roi_toolbar = tk.Frame(stream_card, bg="#ffffff")
        roi_toolbar.grid(row=2, column=0, sticky="ew", padx=18, pady=(0, 12))
        roi_toolbar.columnconfigure(5, weight=1)
        ttk.Combobox(
            roi_toolbar,
            textvariable=self.roi_mode_var,
            values=("zone1 left", "line1 left", "zone2 right", "line2 right"),
            state="readonly",
            width=14,
        ).grid(row=0, column=0, sticky="w")
        tk.Checkbutton(
            roi_toolbar,
            text="Draw ROI",
            variable=self.roi_draw_enabled,
            bg="#ffffff",
            fg="#0f172a",
            activebackground="#ffffff",
            selectcolor="#ffffff",
        ).grid(row=0, column=1, padx=(10, 0))
        tk.Button(
            roi_toolbar,
            text="Save ROI",
            command=self.save_fqc_rois,
            bg="#0284c7",
            fg="white",
            relief=tk.FLAT,
            padx=12,
            pady=5,
        ).grid(row=0, column=2, padx=(10, 0))
        tk.Button(
            roi_toolbar,
            text="Reset ROI",
            command=self.reset_fqc_rois,
            bg="#e2e8f0",
            fg="#0f172a",
            relief=tk.FLAT,
            padx=12,
            pady=5,
        ).grid(row=0, column=3, padx=(10, 0))
        tk.Label(
            roi_toolbar,
            textvariable=self.roi_message_var,
            bg="#ffffff",
            fg="#46618f",
            font=("TkDefaultFont", 9),
            anchor="w",
        ).grid(row=0, column=4, columnspan=2, sticky="ew", padx=(12, 0))

        stream_frame = tk.Frame(stream_card, bg="#000000")
        stream_frame.grid(row=3, column=0, sticky="nsew", padx=18, pady=(0, 18))
        stream_frame.rowconfigure(0, weight=1)
        stream_frame.columnconfigure(0, weight=1)
        self.annotated_label = tk.Label(
            stream_frame,
            bg="black",
            fg="white",
            text="Run a model to show annotated inference here",
            font=("TkDefaultFont", 13),
            borderwidth=0,
            highlightthickness=0,
            justify=tk.CENTER,
        )
        self.annotated_label.grid(row=0, column=0, sticky="nsew")
        self.annotated_label.bind("<ButtonPress-1>", self._on_roi_mouse_down)
        self.annotated_label.bind("<B1-Motion>", self._on_roi_mouse_drag)
        self.annotated_label.bind("<ButtonRelease-1>", self._on_roi_mouse_up)

        self._build_zone_panel(
            parent,
            row=1,
            column=2,
            title="Zone 2 Right",
            status_var=self.right_zone_status_var,
            qr_var=self.right_zone_qr_var,
            panel_var=self.right_zone_panel_var,
            result_var=self.right_zone_result_var,
            missing_var=self.right_zone_missing_var,
        )

    def _build_zone_panel(
        self,
        parent: tk.Frame,
        row: int,
        column: int,
        title: str,
        status_var: tk.StringVar,
        qr_var: tk.StringVar,
        panel_var: tk.StringVar,
        result_var: tk.StringVar,
        missing_var: tk.StringVar,
    ) -> None:
        side = "left" if "left" in title.lower() else "right"
        card = tk.Frame(parent, width=300, bg="#ffffff", highlightbackground="#dbeafe", highlightthickness=1)
        card.grid(row=row, column=column, sticky="nsew", padx=24 if column == 0 else 0, pady=(0, 24))
        card.grid_propagate(False)
        card.columnconfigure(1, weight=1)
        if side == "left":
            self.left_zone_card = card
        else:
            self.right_zone_card = card

        tk.Label(card, text=title, bg="#ffffff", fg="#0f172a", font=("TkDefaultFont", 13, "bold"), anchor="w").grid(
            row=0, column=0, columnspan=2, sticky="ew", padx=18, pady=(20, 10)
        )
        tk.Label(card, textvariable=status_var, bg="#ffffff", fg="#46618f", font=("TkDefaultFont", 9, "bold"), anchor="w").grid(
            row=1, column=0, columnspan=2, sticky="ew", padx=18, pady=(0, 16)
        )
        self._zone_row(card, 2, "QR", qr_var)
        qr_label = tk.Label(
            card,
            text="QR crop",
            bg="#f8fafc",
            fg="#94a3b8",
            font=("TkDefaultFont", 9),
            width=16,
            height=5,
            anchor="center",
        )
        qr_label.grid(row=3, column=0, columnspan=2, sticky="ew", padx=18, pady=(0, 8))
        self._zone_qr_labels[side] = qr_label
        self._zone_row(card, 4, "Panel ID", panel_var)
        self._zone_row(card, 5, "Status", result_var)

        segmented = tk.Frame(card, bg="#eaf0f7")
        segmented.grid(row=6, column=0, columnspan=2, sticky="ew", padx=18, pady=(12, 0))
        for index, label in enumerate(("NG", "GOOD", "ALL")):
            button = tk.Label(
                segmented,
                text=label,
                bg="#ffffff" if index == 0 else "#eaf0f7",
                fg="#0f172a" if index == 0 else "#46618f",
                font=("TkDefaultFont", 9),
                width=9,
                pady=8,
                cursor="hand2",
            )
            button.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(4 if index == 0 else 0, 4), pady=5)
            button.bind("<Button-1>", lambda _event, zone_side=side, mode=label: self._set_zone_component_filter(zone_side, mode))
            self._zone_filter_buttons[side][label] = button

        component_shell = tk.Frame(card, bg="#ffffff")
        component_shell.grid(row=7, column=0, columnspan=2, sticky="nsew", padx=18, pady=(12, 12))
        component_shell.rowconfigure(0, weight=1)
        component_shell.columnconfigure(0, weight=1)
        component_canvas = tk.Canvas(component_shell, bg="#ffffff", highlightthickness=0, borderwidth=0)
        component_canvas.grid(row=0, column=0, sticky="nsew")
        component_scrollbar = ttk.Scrollbar(component_shell, orient=tk.VERTICAL, command=component_canvas.yview)
        component_scrollbar.grid(row=0, column=1, sticky="ns")
        component_canvas.configure(yscrollcommand=component_scrollbar.set)
        component_frame = tk.Frame(component_canvas, bg="#ffffff")
        window_id = component_canvas.create_window((0, 0), window=component_frame, anchor="nw")
        component_frame.bind(
            "<Configure>",
            lambda _event, canvas=component_canvas: canvas.configure(scrollregion=canvas.bbox("all")),
        )
        component_canvas.bind(
            "<Configure>",
            lambda event, canvas=component_canvas, item_id=window_id: canvas.itemconfigure(item_id, width=event.width),
        )
        card.rowconfigure(7, weight=1)
        self._zone_component_canvases[side] = component_canvas
        self._zone_component_frames[side] = component_frame
        self._render_zone_component_list(side)

    @staticmethod
    def _zone_row(parent: tk.Frame, row: int, label: str, variable: tk.StringVar) -> None:
        tk.Label(parent, text=label, bg="#ffffff", fg="#46618f", font=("TkDefaultFont", 9), anchor="w").grid(
            row=row, column=0, sticky="w", padx=(18, 12), pady=7
        )
        tk.Label(parent, textvariable=variable, bg="#ffffff", fg="#0f172a", font=("TkDefaultFont", 9), anchor="w", wraplength=165).grid(
            row=row, column=1, sticky="ew", padx=(0, 18), pady=7
        )

    def _set_zone_component_filter(self, side: str, mode: str) -> None:
        self._zone_component_filter[side] = mode
        self._render_zone_component_list(side)
        card = self.left_zone_card if side == "left" else self.right_zone_card
        self._set_zone_alert_background(side, card, bool(self._zone_alert_state.get(side)), force=True)

    def _render_zone_component_list(self, side: str) -> None:
        frame = self._zone_component_frames.get(side)
        if frame is None:
            return

        for child in frame.winfo_children():
            child.destroy()

        mode = self._zone_component_filter.get(side, "NG")
        for label, button in self._zone_filter_buttons.get(side, {}).items():
            selected = label == mode
            button.configure(
                bg="#ffffff" if selected else "#eaf0f7",
                fg="#0f172a" if selected else "#46618f",
                font=("TkDefaultFont", 9, "bold" if selected else "normal"),
            )

        details = list(self._zone_component_details.get(side) or [])
        if mode == "NG":
            rows = [item for item in details if not item.get("detected")]
        elif mode == "GOOD":
            rows = [item for item in details if item.get("detected")]
        else:
            rows = details

        if not rows:
            text = "No data yet" if not details else f"No {mode} components"
            tk.Label(
                frame,
                text=text,
                bg="#ffffff",
                fg="#64748b",
                font=("TkDefaultFont", 9),
                anchor="w",
            ).pack(fill=tk.X, pady=(2, 0))
            canvas = self._zone_component_canvases.get(side)
            if canvas is not None:
                canvas.configure(scrollregion=canvas.bbox("all"))
            return

        for item in rows[:20]:
            detected = bool(item.get("detected"))
            name = str(item.get("component") or "-")
            row = tk.Frame(frame, bg="#ffffff")
            row.pack(fill=tk.X, pady=2)
            tk.Label(
                row,
                text="GOOD" if detected else "NG",
                bg="#dcfce7" if detected else "#fee2e2",
                fg="#166534" if detected else "#991b1b",
                font=("TkDefaultFont", 8, "bold"),
                width=6,
                pady=3,
            ).pack(side=tk.LEFT)
            tk.Label(
                row,
                text=name,
                bg="#ffffff",
                fg="#0f172a",
                font=("TkDefaultFont", 9),
                anchor="w",
                wraplength=185,
            ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(8, 0))

        canvas = self._zone_component_canvases.get(side)
        if canvas is not None:
            canvas.configure(scrollregion=canvas.bbox("all"))

    @staticmethod
    def _component_details_signature(details: list[dict]) -> tuple:
        return tuple(
            (str(item.get("component") or ""), bool(item.get("detected")))
            for item in details
        )

    def _status_card(self, parent: tk.Widget, title: str, variable: tk.StringVar) -> None:
        card = tk.Frame(parent, bg="#f8fafc", highlightbackground="#e2e8f0", highlightthickness=1)
        card.pack(fill=tk.X, padx=12, pady=8)
        tk.Label(
            card,
            text=title,
            bg="#f8fafc",
            fg="#64748b",
            font=("TkDefaultFont", 9, "bold"),
            anchor="w",
        ).pack(fill=tk.X, padx=12, pady=(12, 2))
        tk.Label(
            card,
            textvariable=variable,
            bg="#f8fafc",
            fg="#0f172a",
            font=("TkDefaultFont", 11),
            anchor="w",
            wraplength=160,
        ).pack(fill=tk.X, padx=12, pady=(0, 12))

    def _build_settings_tab(self, parent: tk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        panel = tk.Frame(parent, bg="#ffffff", highlightbackground="#e2e8f0", highlightthickness=1)
        panel.grid(row=0, column=0, sticky="new", padx=28, pady=28)

        tk.Label(
            panel,
            text="Camera Settings",
            bg="#ffffff",
            fg="#0f172a",
            font=("TkDefaultFont", 17, "bold"),
            anchor="w",
        ).grid(row=0, column=0, columnspan=3, sticky="ew", padx=24, pady=(22, 4))
        tk.Label(
            panel,
            text="Exposure Time",
            bg="#ffffff",
            fg="#334155",
            font=("TkDefaultFont", 12, "bold"),
            anchor="w",
        ).grid(row=1, column=0, sticky="ew", padx=24, pady=(22, 6))

        scale = tk.Scale(
            panel,
            from_=100,
            to=100000,
            orient=tk.HORIZONTAL,
            variable=self.exposure_var,
            command=self._on_exposure_slide,
            resolution=100,
            bg="#ffffff",
            fg="#334155",
            troughcolor="#e2e8f0",
            activebackground="#38bdf8",
            highlightthickness=0,
            length=620,
        )
        scale.grid(row=2, column=0, sticky="ew", padx=24, pady=(0, 12))

        entry = tk.Entry(
            panel,
            textvariable=self.exposure_text,
            bg="#f8fafc",
            fg="#0f172a",
            insertbackground="#0f172a",
            relief=tk.FLAT,
            font=("TkDefaultFont", 12),
            width=14,
        )
        entry.grid(row=2, column=1, sticky="ew", padx=(0, 10), pady=(0, 12), ipady=8)
        entry.bind("<Return>", lambda _event: self.apply_exposure())

        tk.Button(
            panel,
            text="Apply",
            command=self.apply_exposure,
            bg="#0284c7",
            fg="white",
            activebackground="#0369a1",
            activeforeground="white",
            relief=tk.FLAT,
            font=("TkDefaultFont", 11, "bold"),
            padx=18,
            pady=8,
        ).grid(row=2, column=2, sticky="ew", padx=(0, 24), pady=(0, 12))

        tk.Button(
            panel,
            text="Save Default",
            command=self.save_defaults,
            bg="#e2e8f0",
            fg="#0f172a",
            activebackground="#cbd5e1",
            activeforeground="#0f172a",
            relief=tk.FLAT,
            font=("TkDefaultFont", 11, "bold"),
            padx=18,
            pady=8,
        ).grid(row=3, column=2, sticky="ew", padx=(0, 24), pady=(0, 12))

        tk.Label(
            panel,
            textvariable=self.settings_message,
            bg="#ffffff",
            fg="#0284c7",
            font=("TkDefaultFont", 10),
            anchor="w",
        ).grid(row=4, column=0, columnspan=3, sticky="ew", padx=24, pady=(0, 22))

    def _build_models_tab(self, parent: tk.Frame) -> None:
        parent.rowconfigure(2, weight=1)
        parent.columnconfigure(0, weight=1)

        toolbar = tk.Frame(parent, bg="#f8fafc")
        toolbar.grid(row=0, column=0, sticky="ew", padx=24, pady=(22, 12))
        toolbar.columnconfigure(1, weight=1)

        tk.Label(
            toolbar,
            text="Models",
            bg="#f8fafc",
            fg="#475569",
            font=("TkDefaultFont", 10, "bold"),
            anchor="w",
        ).grid(row=0, column=0, columnspan=2, sticky="ew", padx=(0, 8))
        tk.Button(
            toolbar,
            text="Refresh",
            command=self.load_models,
            bg="#e2e8f0",
            fg="#0f172a",
            relief=tk.FLAT,
            padx=14,
            pady=8,
        ).grid(row=0, column=2, padx=(10, 0))

        source_panel = tk.Frame(parent, bg="#f8fafc")
        source_panel.grid(row=1, column=0, sticky="ew", padx=24, pady=(0, 12))
        source_panel.columnconfigure(1, weight=1)
        tk.Label(
            source_panel,
            text="Source",
            bg="#f8fafc",
            fg="#0f172a",
            font=("TkDefaultFont", 10, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=(0, 10))
        self.source_combo = ttk.Combobox(
            source_panel,
            textvariable=self.selected_source_var,
            state="readonly",
            width=44,
        )
        self.source_combo.grid(row=0, column=1, sticky="ew")
        tk.Label(
            source_panel,
            textvariable=self.source_status_var,
            bg="#f8fafc",
            fg="#475569",
            font=("TkDefaultFont", 10),
            anchor="w",
        ).grid(row=0, column=2, sticky="w", padx=(14, 0))

        table_frame = tk.Frame(parent, bg="#ffffff", highlightbackground="#e2e8f0", highlightthickness=1)
        table_frame.grid(row=2, column=0, sticky="nsew", padx=24, pady=(0, 12))
        table_frame.rowconfigure(0, weight=1)
        table_frame.columnconfigure(0, weight=1)

        columns = ("model",)
        self.models_tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="browse")
        self.models_tree.heading("model", text="Model")
        self.models_tree.column("model", width=520, anchor="w")
        self.models_tree.grid(row=0, column=0, sticky="nsew")

        scrollbar = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self.models_tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.models_tree.configure(yscrollcommand=scrollbar.set)

        self._build_confidence_threshold_panel(parent)

        actions = tk.Frame(parent, bg="#f8fafc")
        actions.grid(row=4, column=0, sticky="ew", padx=24, pady=(0, 24))
        actions.columnconfigure(0, weight=1)

        tk.Label(
            actions,
            textvariable=self.assigned_model_var,
            bg="#f8fafc",
            fg="#0f172a",
            font=("TkDefaultFont", 11, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")
        tk.Label(
            actions,
            textvariable=self.model_status_var,
            bg="#f8fafc",
            fg="#0284c7",
            font=("TkDefaultFont", 10),
            anchor="w",
        ).grid(row=1, column=0, sticky="ew", pady=(4, 0))

        tk.Button(
            actions,
            text="Assign",
            command=self.assign_selected_model,
            bg="#e2e8f0",
            fg="#0f172a",
            relief=tk.FLAT,
            padx=16,
            pady=9,
        ).grid(row=0, column=1, rowspan=2, padx=(10, 0))
        tk.Button(
            actions,
            text="Run Model",
            command=self.run_assigned_model,
            bg="#16a34a",
            fg="white",
            relief=tk.FLAT,
            padx=16,
            pady=9,
        ).grid(row=0, column=2, rowspan=2, padx=(10, 0))
        tk.Button(
            actions,
            text="Stop",
            command=self.stop_inference,
            bg="#dc2626",
            fg="white",
            relief=tk.FLAT,
            padx=16,
            pady=9,
        ).grid(row=0, column=3, rowspan=2, padx=(10, 0))

    def _build_confidence_threshold_panel(self, parent: tk.Frame) -> None:
        panel = tk.Frame(parent, bg="#f8fafc")
        panel.grid(row=3, column=0, sticky="ew", padx=24, pady=(0, 12))
        panel.columnconfigure(0, weight=1)

        tk.Label(
            panel,
            text="Class Confidence Thresholds",
            bg="#f8fafc",
            fg="#0f172a",
            font=("TkDefaultFont", 10, "bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", pady=(0, 6))

        table_frame = tk.Frame(panel, bg="#ffffff", highlightbackground="#e2e8f0", highlightthickness=1)
        table_frame.grid(row=1, column=0, sticky="ew")
        table_frame.columnconfigure(0, weight=1)

        columns = ("id", "class", "threshold")
        self.threshold_tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="browse", height=5)
        self.threshold_tree.heading("id", text="ID")
        self.threshold_tree.heading("class", text="Class")
        self.threshold_tree.heading("threshold", text="Threshold")
        self.threshold_tree.column("id", width=48, anchor="center", stretch=False)
        self.threshold_tree.column("class", width=220, anchor="w")
        self.threshold_tree.column("threshold", width=100, anchor="center", stretch=False)
        self.threshold_tree.grid(row=0, column=0, sticky="ew")
        self.threshold_tree.bind("<<TreeviewSelect>>", self._on_threshold_select)

        scrollbar = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self.threshold_tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.threshold_tree.configure(yscrollcommand=scrollbar.set)

        controls = tk.Frame(panel, bg="#f8fafc")
        controls.grid(row=1, column=1, sticky="ns", padx=(12, 0))
        tk.Label(
            controls,
            text="Selected",
            bg="#f8fafc",
            fg="#46618f",
            font=("TkDefaultFont", 9),
            anchor="w",
        ).grid(row=0, column=0, sticky="w")
        tk.Spinbox(
            controls,
            textvariable=self.selected_threshold_var,
            from_=MIN_CLASS_CONFIDENCE,
            to=MAX_CLASS_CONFIDENCE,
            increment=0.005,
            format="%.3f",
            width=8,
        ).grid(row=1, column=0, sticky="ew", pady=(3, 6))
        tk.Button(
            controls,
            text="Apply",
            command=self.apply_selected_class_threshold,
            bg="#e2e8f0",
            fg="#0f172a",
            relief=tk.FLAT,
            padx=12,
            pady=5,
        ).grid(row=2, column=0, sticky="ew")
        tk.Button(
            controls,
            text="Save",
            command=self.save_class_thresholds,
            bg="#0284c7",
            fg="white",
            relief=tk.FLAT,
            padx=12,
            pady=5,
        ).grid(row=3, column=0, sticky="ew", pady=(6, 0))
        tk.Label(
            controls,
            textvariable=self.threshold_status_var,
            bg="#f8fafc",
            fg="#0284c7",
            font=("TkDefaultFont", 9),
            anchor="w",
            wraplength=150,
        ).grid(row=4, column=0, sticky="ew", pady=(6, 0))

        self._refresh_threshold_tree()

    def _on_exposure_slide(self, value: str) -> None:
        self.exposure_text.set(str(int(float(value))))

    def _load_saved_settings(self) -> dict:
        try:
            if DASHBOARD_SETTINGS_PATH.exists():
                with DASHBOARD_SETTINGS_PATH.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data if isinstance(data, dict) else {}
        except Exception:
            LOG.exception("Failed to load dashboard settings")
        return {}

    def _load_class_confidence_thresholds(self) -> dict[int, float]:
        saved = self.saved_settings.get("class_confidence_thresholds")
        thresholds: dict[int, float] = {}
        for class_id in sorted(CLASS_NAME_BY_ID):
            value = DEFAULT_CLASS_CONFIDENCE
            if isinstance(saved, dict):
                raw = saved.get(str(class_id), saved.get(class_id))
                try:
                    value = float(raw)
                except (TypeError, ValueError):
                    value = DEFAULT_CLASS_CONFIDENCE
            thresholds[class_id] = self._clamp_class_confidence(value)
        return thresholds

    @staticmethod
    def _clamp_class_confidence(value: float) -> float:
        return max(MIN_CLASS_CONFIDENCE, min(MAX_CLASS_CONFIDENCE, float(value)))

    def _refresh_threshold_tree(self) -> None:
        tree = getattr(self, "threshold_tree", None)
        if tree is None:
            return
        selected = tree.selection()
        selected_id = selected[0] if selected else ""
        for item_id in tree.get_children():
            tree.delete(item_id)
        for class_id in sorted(CLASS_NAME_BY_ID):
            threshold = self.class_confidence_thresholds.get(class_id, DEFAULT_CLASS_CONFIDENCE)
            tree.insert(
                "",
                tk.END,
                iid=str(class_id),
                values=(class_id, CLASS_NAME_BY_ID[class_id], f"{threshold:.3f}"),
            )
        if selected_id and tree.exists(selected_id):
            tree.selection_set(selected_id)
            tree.focus(selected_id)

    def _on_threshold_select(self, _event=None) -> None:
        selected = self.threshold_tree.selection()
        if not selected:
            return
        try:
            class_id = int(selected[0])
        except ValueError:
            return
        value = self.class_confidence_thresholds.get(class_id, DEFAULT_CLASS_CONFIDENCE)
        self.selected_threshold_var.set(f"{value:.3f}")

    def apply_selected_class_threshold(self) -> None:
        selected = self.threshold_tree.selection()
        if not selected:
            self.threshold_status_var.set("Select a class first")
            return
        try:
            class_id = int(selected[0])
            value = self._clamp_class_confidence(float(self.selected_threshold_var.get()))
        except (TypeError, ValueError):
            self.threshold_status_var.set("Enter a valid threshold")
            return
        self.class_confidence_thresholds[class_id] = value
        self.selected_threshold_var.set(f"{value:.3f}")
        self._refresh_threshold_tree()
        self.threshold_status_var.set(f"{CLASS_NAME_BY_ID.get(class_id, class_id)} set to {value:.3f}")

    def save_class_thresholds(self) -> None:
        if self.threshold_tree.selection():
            self.apply_selected_class_threshold()
        self.save_defaults()
        restarted = self._restart_model_after_threshold_save()
        self.threshold_status_var.set("Thresholds saved and model restarted" if restarted else "Thresholds saved")

    def _current_class_confidence_thresholds_snapshot(self) -> dict[int, float]:
        return {
            int(class_id): self._clamp_class_confidence(value)
            for class_id, value in self.class_confidence_thresholds.items()
        }

    def _load_fqc_rois(self) -> list[dict]:
        rois = self.saved_settings.get("fqc_rois")
        if isinstance(rois, list):
            return rois
        return []

    def _current_fqc_rois(self) -> list[dict]:
        with self._roi_lock:
            return json.loads(json.dumps(self.fqc_rois))

    def reset_fqc_rois(self) -> None:
        with self._roi_lock:
            self.fqc_rois = []
            self._roi_draft_norm = None
        self.roi_message_var.set("ROI cleared")
        self.save_defaults()

    def save_fqc_rois(self) -> None:
        self.save_defaults()
        self.roi_message_var.set("ROI saved as default")

    def _settings_payload(self) -> dict:
        assigned_model_name = ""
        if self.assigned_model:
            assigned_model_name = self.assigned_model.get("model_name") or ""
        elif self._saved_model_name:
            assigned_model_name = self._saved_model_name

        assigned_source_name = ""
        if self.assigned_source:
            assigned_source_name = self.assigned_source.get("source_name") or ""
        elif self._saved_source_name:
            assigned_source_name = self._saved_source_name

        return {
            "assigned_model_name": assigned_model_name,
            "assigned_source_name": assigned_source_name or "Hikrobot camera",
            "camera_config": {
                "exposure": float(self.exposure_text.get() or self.exposure_var.get()),
                "gain": float(self.camera.config.get("gain", 0)),
                "fps": float(self.camera.config.get("fps", 21)),
                "pixel_format": self.camera.config.get("pixel_format"),
            },
            "fqc_rois": self._current_fqc_rois(),
            "class_confidence_thresholds": {
                str(class_id): round(float(value), 4)
                for class_id, value in sorted(self.class_confidence_thresholds.items())
            },
        }

    def save_defaults(self) -> None:
        try:
            exposure = float(self.exposure_text.get())
            self.exposure_var.set(exposure)
            self.camera.config["exposure"] = exposure
            payload = self._settings_payload()
            with DASHBOARD_SETTINGS_PATH.open("w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception as exc:
            self.settings_message.set(f"Default save failed: {exc}")
            return

        self._saved_model_name = payload.get("assigned_model_name") or ""
        self._saved_source_name = payload.get("assigned_source_name") or "Hikrobot camera"
        self.settings_message.set(f"Default saved: exposure {int(exposure)}")

    def load_models(self) -> None:
        self.load_sources()
        models: list[dict] = []
        seen: set[Path] = set()
        for directory in LOCAL_MODEL_DIRS:
            if not directory.is_dir():
                continue
            for path in sorted(directory.glob("*.pt")):
                resolved = path.resolve()
                if resolved in seen:
                    continue
                seen.add(resolved)
                models.append({
                    "model_name": path.stem,
                    "model_file": str(resolved),
                })

        self.models = sorted(models, key=lambda item: str(item.get("model_name") or ""))
        for index, model in enumerate(self.models, start=1):
            model_name = str(model.get("model_name") or "").strip()
            model["display_name"] = f"{model_name} - Model {index}" if model_name else f"Model {index}"
        for item_id in self.models_tree.get_children():
            self.models_tree.delete(item_id)

        for index, model in enumerate(self.models):
            self.models_tree.insert(
                "",
                tk.END,
                iid=str(index),
                values=(
                    model.get("display_name", f"Model {index + 1}"),
                ),
            )

        self.model_status_var.set(f"Loaded {len(self.models)} model(s)")
        self._select_saved_model()

    def load_sources(self) -> None:
        sources = [{
            "source_name": "Hikrobot camera",
            "source_type": "hikrobot",
            "source_path": "",
        }]
        seen: set[Path] = set()
        for directory in LOCAL_VIDEO_DIRS:
            if not directory.is_dir():
                continue
            for path in sorted(directory.iterdir()):
                if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
                    continue
                resolved = path.resolve()
                if resolved in seen:
                    continue
                seen.add(resolved)
                sources.append({
                    "source_name": path.name,
                    "source_type": "video",
                    "source_path": str(resolved),
                })

        self.sources = sources
        source_names = [source["source_name"] for source in sources]
        self.source_combo.configure(values=source_names)
        selected_name = self._saved_source_name if self._saved_source_name in source_names else "Hikrobot camera"
        self.selected_source_var.set(selected_name)
        self.assigned_source = self._source_by_name(selected_name) or sources[0]
        self._update_source_status()

    def _select_saved_model(self) -> None:
        if not self._saved_model_name:
            return

        for index, model in enumerate(self.models):
            if model.get("model_name") == self._saved_model_name:
                item_id = str(index)
                self.models_tree.selection_set(item_id)
                self.models_tree.focus(item_id)
                self.models_tree.see(item_id)
                self.assigned_model = model
                display_name = model.get("display_name") or f"Model {index + 1}"
                self.assigned_model_var.set(f"Assigned model: {display_name}")
                self.model_status_var.set(f"Default model loaded: {display_name}")
                return

    def _source_by_name(self, source_name: str) -> Optional[dict]:
        for source in self.sources:
            if source.get("source_name") == source_name:
                return source
        return None

    def _selected_source(self) -> dict:
        return self._source_by_name(self.selected_source_var.get()) or self.sources[0]

    def _update_source_status(self) -> None:
        source_name = self.assigned_source.get("source_name") or "Hikrobot camera"
        if self.assigned_source.get("source_type") == "video":
            self.source_status_var.set(f"Source: video - {source_name}")
        else:
            self.source_status_var.set("Source: Hikrobot camera")

    def _selected_model(self) -> Optional[dict]:
        selected = self.models_tree.selection()
        if not selected:
            return None

        try:
            return self.models[int(selected[0])]
        except (IndexError, ValueError):
            return None

    def assign_selected_model(self) -> None:
        model = self._selected_model()
        if not model:
            self.model_status_var.set("Select one model first")
            return

        model_name = model.get("model_name") or ""
        if not model_name:
            self.model_status_var.set("Selected model has no model_name")
            return

        self.assigned_model = model
        self.assigned_source = self._selected_source()
        display_name = model.get("display_name") or model_name
        self.assigned_model_var.set(f"Assigned model: {display_name}")
        self._update_source_status()
        source_name = self.assigned_source.get("source_name") or "Hikrobot camera"
        self.model_status_var.set(f"{display_name} assigned to {source_name}")
        self.save_defaults()

    def run_assigned_model(self) -> None:
        model = getattr(self, "assigned_model", None) or self._selected_model()
        if not model:
            self.model_status_var.set("Select and assign a model first")
            return

        self.assigned_model = model
        self.assigned_source = self._selected_source()
        display_name = model.get("display_name") or model.get("model_name", "-")
        self.assigned_model_var.set(f"Assigned model: {display_name}")
        self._update_source_status()
        self.root.after(0, self.save_defaults)
        source_name = self.assigned_source.get("source_name") or "Hikrobot camera"
        self._set_model_status(f"Starting {display_name} on {source_name}")
        LOG.debug(
            "run_model requested model=%s source_type=%s source=%s",
            model.get("model_name", "-"),
            self.assigned_source.get("source_type"),
            source_name,
        )
        if self.assigned_source.get("source_type") != "video":
            stop_start = time.perf_counter()
            self._stop_camera_preview()
            LOG.debug("camera preview stop before inference took %.3fs", time.perf_counter() - stop_start)
        self._start_local_annotated_model(model, self.assigned_source.copy())

    def _restart_model_after_threshold_save(self) -> bool:
        if not self.inference_run_id:
            return False
        model = getattr(self, "assigned_model", None)
        source = getattr(self, "assigned_source", None)
        if not model or not source:
            return False

        model_name = model.get("model_name", "-")
        display_name = model.get("display_name") or model_name
        source_name = source.get("source_name") or "Hikrobot camera"
        LOG.info(
            "restarting model after threshold save model=%s source=%s",
            model_name,
            source_name,
        )
        self._set_model_status(f"Restarting {display_name} with saved thresholds")
        self._stop_annotated_stream()
        self._start_local_annotated_model(model.copy(), source.copy())
        return True

    def _start_local_annotated_model(self, model: dict, source: dict) -> None:
        self._stop_annotated_stream()
        self._annotated_stop.clear()
        with self._annotated_frame_lock:
            self._latest_annotated_frame = None
        loading_text = "Loading model and opening video" if source.get("source_type") == "video" else "Loading model and opening camera"
        self.annotated_label.configure(
            text=loading_text,
            image="",
        )
        self._annotated_thread = threading.Thread(
            target=self._run_assigned_model_worker,
            args=(model, source),
            name="ultralytics-annotated-runner",
            daemon=True,
        )
        LOG.debug(
            "starting annotated worker model=%s source_type=%s source=%s",
            model.get("display_name") or model.get("model_name", "-"),
            source.get("source_type"),
            source.get("source_name", "-"),
        )
        self._annotated_thread.start()
        self.root.after(0, self._annotated_render_loop)
        self.root.after(0, self.status_var.set, "Inference running")
        self.root.after(0, self.notebook.select, 1)

    def _run_assigned_model_worker(self, model: dict, source: dict) -> None:
        model_name = model.get("model_name") or ""
        display_name = model.get("display_name") or model_name
        model_file = model.get("model_file") or ""
        if not model_name or not model_file:
            self._set_model_status("Selected model is missing model file")
            return
        capture = None
        worker_start = time.perf_counter()
        LOG.debug(
            "worker start model=%s model_file=%s source_type=%s source_path=%s",
            model_name,
            model_file,
            source.get("source_type"),
            source.get("source_path") or "",
        )

        try:
            exposure = float(self.exposure_text.get())
        except (TypeError, ValueError):
            exposure = float(self.camera.config.get("exposure", self.exposure_var.get()))

        try:
            cv2_start = time.perf_counter()
            import cv2
            LOG.debug("cv2 import took %.3fs", time.perf_counter() - cv2_start)

            if source.get("source_type") == "video":
                video_path = source.get("source_path") or ""
                video_open_start = time.perf_counter()
                capture = cv2.VideoCapture(video_path)
                if not capture.isOpened():
                    raise RuntimeError(f"Video could not be opened: {video_path}")
                LOG.debug("video open took %.3fs path=%s", time.perf_counter() - video_open_start, video_path)
                first_frame_start = time.perf_counter()
                ok, first_frame = capture.read()
                LOG.debug("video first frame read ok=%s took %.3fs", ok, time.perf_counter() - first_frame_start)
                if ok and first_frame is not None:
                    self._publish_annotated_frame(first_frame)
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    self._set_model_status("Video opened. Loading model")

            try:
                import_start = time.perf_counter()
                ULTRALYTICS_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
                os.environ.setdefault("YOLO_CONFIG_DIR", str(ULTRALYTICS_CONFIG_DIR))
                from ultralytics import YOLO
                from pylibdmtx.pylibdmtx import decode as dmtx_decode
                LOG.debug("inference dependency import took %.3fs", time.perf_counter() - import_start)
            except Exception as exc:
                self._set_model_status(f"Inference dependency missing: {exc}")
                if capture is not None:
                    capture.release()
                    capture = None
                self.root.after(0, self._stop_annotated_stream)
                if source.get("source_type") != "video":
                    self.root.after(0, self._start_camera_preview)
                return

            self.camera.config["exposure"] = exposure
            model_load_start = time.perf_counter()
            yolo = YOLO(model_file)
            LOG.debug("YOLO model load took %.3fs model=%s", time.perf_counter() - model_load_start, model_name)
            self.inference_run_id = f"local-{model_name}"
            source_name = source.get("source_name") or "Hikrobot camera"
            camera_key = source_name if source.get("source_type") == "video" else (self.camera.serial or "local-camera")
            self._current_source_key = camera_key
            reset_fqc_panel_engine(camera_key)
            engine = get_fqc_panel_engine(camera_key)
            self._inference_frame_count = 0
            LOG.debug("worker ready took %.3fs source=%s", time.perf_counter() - worker_start, source_name)
            self._set_model_status(f"Running {display_name} on {source_name}")

            if source.get("source_type") == "video":
                fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
                frame_delay = 1.0 / max(1.0, min(float(fps), 60.0))
                try:
                    while not self._annotated_stop.is_set():
                        ok, frame = capture.read()
                        if not ok or frame is None:
                            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            continue
                        self._process_inference_frame(
                            cv2,
                            yolo,
                            dmtx_decode,
                            engine,
                            model_name,
                            camera_key,
                            frame,
                        )
                        time.sleep(frame_delay)
                finally:
                    capture.release()
                    capture = None
                return

            self.camera.open()
            LOG.debug("camera open for inference completed source=%s", source_name)
            loop_prev_end = time.perf_counter()
            while not self._annotated_stop.is_set():
                gap_since_prev_frame = time.perf_counter() - loop_prev_end
                read_start = time.perf_counter()
                frame = self.camera.read()
                read_elapsed = time.perf_counter() - read_start
                if frame is None:
                    LOG.debug("worker loop: camera.read()=%.4fs gap_before=%.4fs -> None, retrying", read_elapsed, gap_since_prev_frame)
                    loop_prev_end = time.perf_counter()
                    continue
                LOG.debug("worker loop: camera.read()=%.4fs gap_before=%.4fs", read_elapsed, gap_since_prev_frame)
                self._process_inference_frame(
                    cv2,
                    yolo,
                    dmtx_decode,
                    engine,
                    model_name,
                    camera_key,
                    frame,
                )
                loop_prev_end = time.perf_counter()
        except Exception as exc:
            if not self._annotated_stop.is_set():
                self._set_model_status(f"Run failed: {exc}")
        finally:
            if source.get("source_type") == "video":
                try:
                    if capture is not None:
                        capture.release()
                except Exception:
                    LOG.exception("Failed to release video capture after local inference")
            else:
                try:
                    self.camera.close()
                except Exception:
                    LOG.exception("Failed to close camera after local inference")

    def _publish_annotated_frame(self, frame: np.ndarray) -> None:
        with self._annotated_frame_lock:
            self._latest_annotated_frame = frame

    def _process_inference_frame(self, cv2, yolo, dmtx_decode, engine, model_name: str, camera_key: str, frame: np.ndarray) -> None:
        frame_start = time.perf_counter()
        classes = [0] if model_name.lower().startswith("person") else None
        class_thresholds = self._current_class_confidence_thresholds_snapshot()
        predict_confidence = min(class_thresholds.values()) if class_thresholds else DEFAULT_CLASS_CONFIDENCE
        predict_start = time.perf_counter()
        results = yolo.predict(frame, classes=classes, conf=predict_confidence, verbose=False)
        predict_elapsed = time.perf_counter() - predict_start
        result = results[0] if results else None
        detections = self._detections_from_yolo_result(result, class_thresholds)
        detections = self._suppress_contradicted_missing_detections(detections, frame.shape)
        qr_values = self._scan_qr_box_detections(cv2, frame, detections, dmtx_decode)
        rois = self._current_fqc_rois()
        logic_start = time.perf_counter()
        fqc_state = engine.process_frame(
            detections,
            roi_zones=rois,
            frame_size={"w": frame.shape[1], "h": frame.shape[0]},
        )
        logic_elapsed = time.perf_counter() - logic_start
        annotated = frame.copy()
        draw_start = time.perf_counter()
        self._draw_yolo_detections(cv2, annotated, detections)
        draw_elapsed = time.perf_counter() - draw_start
        self._draw_fqc_rois(cv2, annotated, rois)
        self._save_completed_fqc_events(
            fqc_state,
            camera_id=camera_key,
            model_name=model_name,
            frame_size={"w": frame.shape[1], "h": frame.shape[0]},
            qr_values=qr_values,
            snapshot_frame=annotated,
        )
        self._update_fqc_zone_state(fqc_state, qr_values)
        self._publish_annotated_frame(annotated)
        self._inference_frame_count += 1
        total_elapsed = time.perf_counter() - frame_start
        if self._inference_frame_count <= 5 or total_elapsed >= 0.25:
            LOG.debug(
                "frame %s timing total=%.3fs predict=%.3fs fqc=%.3fs draw=%.3fs detections=%s qr_ids=%s",
                self._inference_frame_count,
                total_elapsed,
                predict_elapsed,
                logic_elapsed,
                draw_elapsed,
                len(detections),
                qr_values,
            )

    def _event_to_normalized_frame_point(self, event) -> Optional[tuple[float, float]]:
        offset_x, offset_y, display_w, display_h = self._annotated_display_rect
        frame_w, frame_h = self._annotated_frame_size
        if display_w <= 1 or display_h <= 1 or frame_w <= 1 or frame_h <= 1:
            return None
        if event.x < offset_x or event.y < offset_y or event.x > offset_x + display_w or event.y > offset_y + display_h:
            return None
        nx = (event.x - offset_x) / display_w
        ny = (event.y - offset_y) / display_h
        return max(0.0, min(1.0, nx)), max(0.0, min(1.0, ny))

    def _on_roi_mouse_down(self, event) -> None:
        if not self.roi_draw_enabled.get():
            return
        point = self._event_to_normalized_frame_point(event)
        if point is None:
            self.roi_message_var.set("Click inside the video image")
            return
        self._roi_drag_start = point
        self._roi_draft_norm = (point[0], point[1], point[0], point[1])
        self.roi_message_var.set(f"Drawing {self.roi_mode_var.get()}")

    def _on_roi_mouse_drag(self, event) -> None:
        if not self.roi_draw_enabled.get() or self._roi_drag_start is None:
            return
        point = self._event_to_normalized_frame_point(event)
        if point is None:
            return
        x1, y1 = self._roi_drag_start
        self._roi_draft_norm = (x1, y1, point[0], point[1])

    def _on_roi_mouse_up(self, event) -> None:
        if not self.roi_draw_enabled.get() or self._roi_drag_start is None:
            return
        point = self._event_to_normalized_frame_point(event)
        if point is None:
            self._roi_drag_start = None
            self._roi_draft_norm = None
            self.roi_message_var.set("ROI draw cancelled")
            return

        start_x, start_y = self._roi_drag_start
        x1, x2 = sorted((start_x, point[0]))
        y1, y2 = sorted((start_y, point[1]))
        self._roi_drag_start = None
        self._roi_draft_norm = None
        if abs(x2 - x1) < 0.005 or abs(y2 - y1) < 0.005:
            self.roi_message_var.set("ROI too small")
            return

        name = self.roi_mode_var.get()
        roi = {
            "name": name,
            "type": "rectangle",
            "coordinates": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
        }
        with self._roi_lock:
            updated = False
            for index, existing in enumerate(self.fqc_rois):
                if str(existing.get("name")) == name:
                    self.fqc_rois[index] = roi
                    updated = True
                    break
            if not updated:
                self.fqc_rois.append(roi)
        self.roi_message_var.set(f"{name} updated")

    @staticmethod
    def _label_key(label: str) -> str:
        return str(label or "").strip().lower().replace(" ", "_").replace("-", "_")

    @staticmethod
    def _crop_with_padding(frame: np.ndarray, bbox: dict, pad_ratio: float = 0.25) -> Optional[np.ndarray]:
        height, width = frame.shape[:2]
        try:
            x1 = int(float(bbox["x1"]))
            y1 = int(float(bbox["y1"]))
            x2 = int(float(bbox["x2"]))
            y2 = int(float(bbox["y2"]))
        except (KeyError, TypeError, ValueError):
            return None

        x1, x2 = sorted((x1, x2))
        y1, y2 = sorted((y1, y2))
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        pad = int(max(box_w, box_h) * pad_ratio)
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(width, x2 + pad)
        y2 = min(height, y2 + pad)
        if x2 <= x1 or y2 <= y1:
            return None
        return frame[y1:y2, x1:x2]

    @staticmethod
    def _quick_matrix_candidates(cv2, crop: np.ndarray) -> list[np.ndarray]:
        candidates = [crop]
        height, width = crop.shape[:2]
        max_side = max(height, width)
        if max_side <= 0:
            return candidates

        scale = 2.0 if max_side < 180 else 1.0
        enlarged = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC) if scale > 1.0 else crop
        gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
        contrast = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
        candidates.append(contrast)
        _, otsu = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        candidates.append(otsu)
        return candidates

    @staticmethod
    def _decode_matrix_crop(cv2, crop: np.ndarray, dmtx_decode) -> str:
        for candidate in TkinterCameraViewer._quick_matrix_candidates(cv2, crop):
            try:
                results = dmtx_decode(candidate, timeout=30, max_count=1)
            except Exception:
                continue
            if results:
                value = results[0].data.decode("utf-8", errors="ignore").strip()
                if value:
                    return value
        return ""

    def _apply_zone_qr_state(self, side: str, text: str, crop: Optional[np.ndarray] = None) -> None:
        if side == "left":
            self.left_zone_qr_var.set(text)
        else:
            self.right_zone_qr_var.set(text)

        label = self._zone_qr_labels.get(side)
        if label is None:
            return

        if crop is None:
            signature = (text, None)
            if self._zone_qr_signature.get(side) == signature:
                return
            self._zone_qr_signature[side] = signature
            label.configure(text="QR crop", image="")
            self._zone_qr_images.pop(side, None)
            return

        try:
            crop_signature = (
                text,
                tuple(crop.shape[:2]),
                int(float(crop.mean())),
            )
        except Exception:
            crop_signature = (text, "crop")
        if self._zone_qr_signature.get(side) == crop_signature:
            return
        self._zone_qr_signature[side] = crop_signature

        try:
            image = Image.fromarray(crop[:, :, ::-1])
            image.thumbnail((96, 96), Image.Resampling.NEAREST)
            photo = ImageTk.PhotoImage(image)
        except Exception:
            LOG.exception("Failed to render QR crop")
            return
        self._zone_qr_images[side] = photo
        label.configure(image=photo, text="", bg="#ffffff")

    @staticmethod
    def _side_for_detection(detection: dict, frame_shape: tuple[int, int, int]) -> str:
        bbox = detection.get("bbox") or {}
        width = frame_shape[1]
        try:
            cx = (float(bbox["x1"]) + float(bbox["x2"])) / 2.0
        except (KeyError, TypeError, ValueError):
            return "left"
        return "left" if cx < width / 2 else "right"

    def _scan_qr_box_detections(self, cv2, frame: np.ndarray, detections: list[dict], dmtx_decode) -> dict[str, str]:
        values: dict[str, str] = {}
        seen_sides: set[str] = set()
        now = time.time()
        for det in detections:
            if self._label_key(str(det.get("class_name") or "")) != QR_DETECTION_KEY:
                continue
            crop = self._crop_with_padding(frame, det.get("bbox") or {}, pad_ratio=0.35)
            if crop is None:
                continue
            side = self._side_for_detection(det, frame.shape)
            seen_sides.add(side)
            self._last_qr_seen_at[side] = now
            display_crop = crop.copy()
            self.root.after(0, self._apply_zone_qr_state, side, "Scanning -", display_crop)
            value = self._decode_matrix_crop(cv2, crop, dmtx_decode)
            if not value:
                continue
            values[side] = value
            self._last_qr_by_side[side] = value
        for side in ("left", "right"):
            if side not in seen_sides and now - float(self._last_qr_seen_at.get(side) or 0.0) > 2.0:
                self.root.after(0, self._apply_zone_qr_state, side, "--", None)
        return values

    @staticmethod
    def _suppress_contradicted_missing_detections(detections: list[dict], frame_shape: tuple[int, int, int]) -> list[dict]:
        present_keys_by_side = {"left": set(), "right": set()}
        for det in detections:
            key = TkinterCameraViewer._label_key(str(det.get("class_name") or ""))
            if key in DIRECT_MISSING_COMPONENT_KEY_BY_KEY:
                continue
            side = TkinterCameraViewer._side_for_detection(det, frame_shape)
            present_keys_by_side.setdefault(side, set()).add(key)

        filtered = []
        for det in detections:
            key = TkinterCameraViewer._label_key(str(det.get("class_name") or ""))
            expected_key = DIRECT_MISSING_COMPONENT_KEY_BY_KEY.get(key)
            if expected_key:
                side = TkinterCameraViewer._side_for_detection(det, frame_shape)
                if expected_key in present_keys_by_side.get(side, set()):
                    continue
            filtered.append(det)
        return filtered

    def _save_completed_fqc_events(
        self,
        fqc_state: dict,
        *,
        camera_id: str,
        model_name: str,
        frame_size: dict,
        qr_values: Optional[dict[str, str]] = None,
        snapshot_frame: Optional[np.ndarray] = None,
    ) -> None:
        qr_values = qr_values or {}
        for event in fqc_state.get("completed_events") or []:
            side = str(event.get("side") or "").lower()
            qr_id = qr_values.get(side) or self._last_qr_by_side.get(side, "")
            LOG.info(
                "FQC completed event queued panel_id=%s side=%s status=%s missing=%s",
                event.get("panel_id"),
                side,
                event.get("status"),
                event.get("missing_components") or [],
            )
            self._fqc_alert_saver.submit_completed_event(
                event=event,
                camera_id=camera_id,
                model_name=model_name,
                frame_size=frame_size,
                qr_id=qr_id,
                snapshot_frame=snapshot_frame,
            )

    @staticmethod
    def _detections_from_yolo_result(result, class_thresholds: Optional[dict[int, float]] = None) -> list[dict]:
        if result is None or getattr(result, "boxes", None) is None:
            return []

        names = getattr(result, "names", {}) or {}
        detections: list[dict] = []
        for box in result.boxes:
            xyxy = box.xyxy[0].detach().cpu().tolist()
            class_id = int(box.cls[0].detach().cpu().item()) if box.cls is not None else -1
            confidence = float(box.conf[0].detach().cpu().item()) if box.conf is not None else 0.0
            threshold = DEFAULT_CLASS_CONFIDENCE
            if class_thresholds is not None:
                threshold = float(class_thresholds.get(class_id, DEFAULT_CLASS_CONFIDENCE))
            if confidence < threshold:
                continue
            detections.append({
                "bbox": {"x1": xyxy[0], "y1": xyxy[1], "x2": xyxy[2], "y2": xyxy[3]},
                "class_id": class_id,
                "class_name": str(names.get(class_id, class_id)),
                "confidence": confidence,
            })
        return detections

    @staticmethod
    def _draw_yolo_detections(cv2, frame: np.ndarray, detections: list[dict]) -> None:
        for det in detections:
            bbox = det.get("bbox") or {}
            try:
                x1 = int(float(bbox["x1"]))
                y1 = int(float(bbox["y1"]))
                x2 = int(float(bbox["x2"]))
                y2 = int(float(bbox["y2"]))
            except (KeyError, TypeError, ValueError):
                continue

            label = str(det.get("class_name") or "")
            key = TkinterCameraViewer._label_key(label)
            is_missing = key in MISSING_DETECTION_KEYS
            color = (0, 0, 255) if is_missing else (0, 180, 0)
            text = label
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            (text_w, text_h), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
            text_y = max(text_h + baseline + 4, y1)
            cv2.rectangle(frame, (x1, text_y - text_h - baseline - 4), (x1 + text_w + 8, text_y + baseline), color, -1)
            cv2.putText(frame, text, (x1 + 4, text_y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

    def _draw_fqc_rois(self, cv2, frame: np.ndarray, rois: list[dict]) -> None:
        height, width = frame.shape[:2]
        for index, roi in enumerate(rois):
            box = zone_box(roi, width, height)
            if box is None:
                continue
            x1, y1, x2, y2 = (int(value) for value in box)
            name = str(roi.get("name") or "")
            is_line = name.lower().startswith("line")
            color = (0, 180, 255) if is_line else ((40, 180, 80) if index < 2 else (255, 140, 40))
            thickness = 3 if is_line else 2
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
            if not is_line:
                cv2.putText(frame, name.title(), (x1 + 8, max(22, y1 + 24)), cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)

        draft = self._roi_draft_norm
        if draft is not None:
            x1, y1, x2, y2 = draft
            px1, px2 = int(min(x1, x2) * width), int(max(x1, x2) * width)
            py1, py2 = int(min(y1, y2) * height), int(max(y1, y2) * height)
            cv2.rectangle(frame, (px1, py1), (px2, py2), (255, 255, 255), 3)
            cv2.putText(
                frame,
                self.roi_mode_var.get().title(),
                (px1 + 8, max(22, py1 + 24)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
            )

    def _update_fqc_zone_state(self, fqc_state: dict, qr_values: Optional[dict[str, str]] = None) -> None:
        panels = fqc_state.get("panels") or []
        left = next((item for item in panels if item.get("side") == "left"), None)
        right = next((item for item in panels if item.get("side") == "right"), None)
        qr_values = qr_values or {}
        self.root.after(0, self._apply_zone_state, "left", left, qr_values.get("left"))
        self.root.after(0, self._apply_zone_state, "right", right, qr_values.get("right"))

    def _apply_zone_state(self, side: str, result: Optional[dict], qr_value: Optional[str] = None) -> None:
        if side == "left":
            card = self.left_zone_card
            status_var = self.left_zone_status_var
            panel_var = self.left_zone_panel_var
            result_var = self.left_zone_result_var
            missing_var = self.left_zone_missing_var
        else:
            card = self.right_zone_card
            status_var = self.right_zone_status_var
            panel_var = self.right_zone_panel_var
            result_var = self.right_zone_result_var
            missing_var = self.right_zone_missing_var

        if not result:
            status_var.set("WAITING FOR PANEL")
            panel_var.set("--")
            result_var.set("--")
            missing_var.set("--")
            details: list[dict] = []
            signature = self._component_details_signature(details)
            details_changed = self._zone_render_signature.get(side) != signature
            if details_changed:
                self._zone_component_details[side] = details
                self._zone_render_signature[side] = signature
                self._render_zone_component_list(side)
            self._set_zone_alert_background(side, card, False, force=details_changed)
            return

        status = str(result.get("status") or "INSPECTING")
        missing = result.get("missing_components") or []
        finalized = bool(result.get("inspection_finalized"))
        status_var.set("INSPECTING PANEL" if status == "INSPECTING" else "PANEL COMPLETE")
        result_var.set(status)
        if finalized:
            qr_panel_id = qr_value or self._last_qr_by_side.get(side) or ""
            panel_var.set(str(qr_panel_id or result.get("panel_id") or "--"))
            if qr_panel_id:
                if side == "left":
                    self.left_zone_qr_var.set(f"QR ID - {qr_panel_id}")
                else:
                    self.right_zone_qr_var.set(f"QR ID - {qr_panel_id}")
            missing_var.set(f"{len(missing)} missing" if missing else "None")
            details = list(result.get("component_details") or [])
        else:
            panel_var.set("--")
            missing_var.set("Wait line touch")
            details = []
        signature = self._component_details_signature(details)
        details_changed = self._zone_render_signature.get(side) != signature
        if details_changed:
            self._zone_component_details[side] = details
            self._zone_render_signature[side] = signature
            self._render_zone_component_list(side)
        self._set_zone_alert_background(side, card, bool(missing) or status == "FAIL", force=details_changed)

    def _set_zone_alert_background(self, side: str, card: Optional[tk.Frame], alert: bool, force: bool = False) -> None:
        if card is None:
            return
        if not force and self._zone_alert_state.get(side) is alert:
            return
        self._zone_alert_state[side] = alert

        card_bg = "#fff1f2" if alert else "#ffffff"
        card_border = "#fca5a5" if alert else "#dbeafe"
        muted_bg = "#ffe4e6" if alert else "#eaf0f7"
        selected_bg = "#ffffff"
        card.configure(bg=card_bg, highlightbackground=card_border)

        def apply(widget: tk.Widget) -> None:
            for child in widget.winfo_children():
                try:
                    current_bg = child.cget("bg")
                except tk.TclError:
                    current_bg = ""

                if current_bg in {"#ffffff", "#fff1f2"}:
                    child.configure(bg=card_bg)
                elif current_bg in {"#eaf0f7", "#ffe4e6"}:
                    child.configure(bg=muted_bg)

                apply(child)

        apply(card)

    def stop_inference(self) -> None:
        self._set_model_status("Stopping inference")
        self.inference_run_id = None
        self._stop_annotated_stream()
        self._set_model_status("Inference stopped. Camera preview restarting")
        self._start_camera_preview()

    def _set_model_status(self, message: str) -> None:
        self.root.after(0, self.model_status_var.set, message)

    def _stop_annotated_stream(self) -> None:
        self._annotated_stop.set()
        if (
            self._annotated_thread
            and self._annotated_thread.is_alive()
            and threading.current_thread() is not self._annotated_thread
        ):
            self._annotated_thread.join(timeout=2)
        self._annotated_thread = None
        with self._annotated_frame_lock:
            self._latest_annotated_frame = None

    def _get_latest_annotated_frame(self) -> Optional[np.ndarray]:
        with self._annotated_frame_lock:
            frame = self._latest_annotated_frame
            self._latest_annotated_frame = None
        return frame

    def _annotated_render_loop(self) -> None:
        if self._annotated_stop.is_set():
            return

        frame = self._get_latest_annotated_frame()
        if frame is not None:
            self._show_annotated_frame(frame)

        self.root.after(self.render_interval_ms, self._annotated_render_loop)

    def _show_annotated_frame(self, frame: np.ndarray) -> None:
        image = Image.fromarray(frame[:, :, ::-1])
        width = max(self.annotated_label.winfo_width(), 2)
        height = max(self.annotated_label.winfo_height(), 2)
        image = self._resize_keep_aspect(image, width, height)
        offset_x = max(0, (width - image.width) // 2)
        offset_y = max(0, (height - image.height) // 2)
        self._annotated_display_rect = (offset_x, offset_y, image.width, image.height)
        self._annotated_frame_size = (frame.shape[1], frame.shape[0])

        self._annotated_tk_image = ImageTk.PhotoImage(image)
        self.annotated_label.configure(
            image=self._annotated_tk_image,
            text="",
        )

    @staticmethod
    def _resize_keep_aspect(
        image: Image.Image,
        target_width: int,
        target_height: int,
    ) -> Image.Image:

        if target_width <= 1 or target_height <= 1:
            return image

        image_ratio = image.width / image.height
        target_ratio = target_width / target_height

        if image_ratio > target_ratio:
            new_width = target_width
            new_height = int(target_width / image_ratio)
        else:
            new_height = target_height
            new_width = int(target_height * image_ratio)

        return image.resize(
            (new_width, new_height),
            Image.Resampling.BILINEAR,
        )

    def _render_loop(self) -> None:
        if not self.running.is_set():
            return

        frame = self._get_latest_frame()

        if frame is not None:

            # HikrobotCamera.read() returns BGR.
            # Pillow expects RGB.
            rgb_frame = frame[:, :, ::-1]

            image = Image.fromarray(rgb_frame)

            display_width = self.image_label.winfo_width()
            display_height = self.image_label.winfo_height()

            image = self._resize_keep_aspect(
                image,
                display_width,
                display_height,
            )

            self._tk_image = ImageTk.PhotoImage(image)

            self.image_label.configure(
                image=self._tk_image,
                text="",
            )
            self._frame_count += 1
            self.status_var.set("Live")
            self.camera_var.set(f"Camera: {self.camera.serial or '-'}")
            self.resolution_var.set(f"Resolution: {self.camera.width} x {self.camera.height}")

        elif self._last_error:
            self.status_var.set("Capture stopped")
            self.settings_message.set(self._last_error)

        self.root.after(
            self.render_interval_ms,
            self._render_loop,
        )

    def apply_exposure(self) -> None:
        try:
            exposure = float(self.exposure_text.get())
            self.camera.set_exposure(exposure)
        except Exception as exc:
            self.settings_message.set(f"Exposure update failed: {exc}")
            return

        self.exposure_var.set(exposure)
        self.exposure_text.set(str(int(exposure)))
        self.settings_message.set(f"Exposure applied: {int(exposure)}")

    def run(self) -> None:
        try:
            self._start_camera_preview()
            self.root.mainloop()

        finally:
            self._shutdown_camera()

    def _start_camera_preview(self) -> None:
        if self._preview_active:
            return

        try:
            self.camera.open()
        except Exception as exc:
            LOG.exception("Camera failed to open")
            self.status_var.set("Offline")
            self.image_label.configure(
                text=f"Camera failed to open\n\n{exc}",
                image="",
                justify=tk.CENTER,
                padx=30,
                pady=30,
            )
            return

        self.running.set()
        self._preview_active = True
        self.status_var.set("Connected")
        self.camera_var.set(f"Camera: {self.camera.serial or '-'}")

        self._capture_thread = threading.Thread(
            target=self._capture_loop,
            name="hikrobot-camera-capture",
            daemon=True,
        )
        self._capture_thread.start()
        self.root.after(0, self._render_loop)

    def _stop_camera_preview(self) -> None:
        if not self._preview_active and not self.camera.opened:
            return

        self.running.clear()
        self._preview_active = False
        if (
            self._capture_thread
            and self._capture_thread.is_alive()
            and threading.current_thread() is not self._capture_thread
        ):
            self._capture_thread.join(timeout=2)
        self._capture_thread = None
        self.camera.close()

    def _shutdown_camera(self) -> None:
        self._fqc_alert_saver.stop()
        self._stop_annotated_stream()
        self.running.clear()

        if (
            self._capture_thread
            and self._capture_thread.is_alive()
            and threading.current_thread() is not self._capture_thread
        ):
            self._capture_thread.join(timeout=2)

        try:
            self.camera.close()
        except Exception:
            LOG.exception("Failed to close camera")

    def close(self) -> None:
        self._stop_annotated_stream()
        self.running.clear()

        try:
            self.root.after_cancel("all")
        except Exception:
            pass

        self.root.destroy()
