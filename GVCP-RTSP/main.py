import logging
import os
import json
from pathlib import Path

from camera import HikrobotCamera, discover_devices
from camera_viewer import TkinterCameraViewer


LOG_LEVEL = getattr(logging, os.getenv("DASHBOARD_LOG_LEVEL", "INFO").upper(), logging.INFO)

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


def load_camera_defaults():
    settings_path = Path(
        os.getenv(
            "CAMERA_DASHBOARD_SETTINGS",
            str(Path(__file__).resolve().parent.parent / "config" / "dashboard_settings.json"),
        )
    )
    default_config = {
        "exposure": 10000,
        "gain": 0,
        "fps": 21,
        "pixel_format": "BayerRG8",
    }

    try:
        with settings_path.open("r", encoding="utf-8") as f:
            settings = json.load(f)
    except FileNotFoundError:
        return default_config
    except Exception:
        logging.exception("Failed to load dashboard settings")
        return default_config

    camera_config = settings.get("camera_config") if isinstance(settings, dict) else None
    if isinstance(camera_config, dict):
        default_config.update({
            key: value
            for key, value in camera_config.items()
            if value is not None
        })

    return default_config


def main():
    serial = os.environ.get("HIKROBOT_CAMERA_SERIAL")
    if not serial:
        devices = discover_devices()
        if devices:
            serial = devices[0].serial
            logging.info(
                "Using first Hikrobot camera: serial=%s model=%s transport=%s ip=%s",
                devices[0].serial or "-",
                devices[0].model or "-",
                devices[0].transport,
                devices[0].ip or "-",
            )

    camera_config = load_camera_defaults()
    logging.info("Using camera defaults: exposure=%s gain=%s fps=%s pixel_format=%s",
                 camera_config.get("exposure"),
                 camera_config.get("gain"),
                 camera_config.get("fps"),
                 camera_config.get("pixel_format"))

    camera = HikrobotCamera(
        serial=serial,
        config=camera_config,
    )

    viewer = TkinterCameraViewer(
        camera=camera,
        title="DeepInsight - FQC Live Camera",
        render_interval_ms=15,
    )

    viewer.run()


if __name__ == "__main__":
    main()
