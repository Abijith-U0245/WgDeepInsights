from __future__ import annotations

import ctypes
import logging
import os
import platform
import sys
import threading
import time
from pathlib import Path
from dataclasses import dataclass

import numpy as np


LOG = logging.getLogger("gateway.camera")
MVS_RUNTIME_LINK_DIR = Path(os.environ.get("BETTER_MVS_RUNTIME_DIR", "/tmp/better-mvs-runenv"))
MVS_IMPORT_DIRS = (
    Path(__file__).resolve().parent / "MvImport",
    Path("/opt/MVS/Samples/64/Python/MvImport"),
    Path("/opt/MVS/Samples/32/Python/MvImport"),
    Path("/opt/MVS/Development/Samples/Python/MvImport"),
)


class MVSUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class HikrobotDevice:
    index: int
    serial: str
    model: str
    transport: str
    ip: str = ""


def _configure_mvs_environment() -> None:
    sdk_root = Path(os.environ.get("MVCAM_SDK_PATH", "/opt/MVS"))
    runtime_root = _resolve_runtime_root(sdk_root)
    if not runtime_root.is_dir():
        raise MVSUnavailable(f"Hikrobot MVS native library directory not found: {runtime_root}")

    architecture_dir = {
        "x86_64": "64",
        "amd64": "64",
        "aarch64": "aarch64",
        "arm64": "aarch64",
        "armhf": "armhf",
        "armv7l": "armhf",
        "i386": "32",
        "i686": "32",
    }.get(platform.machine().lower())
    if architecture_dir is None:
        raise MVSUnavailable(f"Unsupported MVS CPU architecture: {platform.machine()}")

    native_dir = runtime_root / architecture_dir
    control_library = native_dir / "libMvCameraControl.so"
    if not control_library.is_file():
        versioned_control = next(native_dir.glob("libMvCameraControl.so.*"), None)
        if versioned_control is None:
            raise MVSUnavailable(f"Hikrobot MVS control library not found: {control_library}")
        runtime_root = _build_runtime_link_root(runtime_root, architecture_dir, versioned_control)
        native_dir = runtime_root / architecture_dir

    os.environ.setdefault("MVCAM_SDK_PATH", str(sdk_root))
    os.environ["MVCAM_COMMON_RUNENV"] = str(runtime_root)
    os.environ["MVCAM_SOFTWARE_LIBENV"] = str(runtime_root)
    os.environ.setdefault("MVCAM_GENICAM_CLPROTOCOL", str(runtime_root / "CLProtocol"))
    os.environ.setdefault("ALLUSERSPROFILE", str(sdk_root / "MVFG"))

    library_path = os.environ.get("LD_LIBRARY_PATH", "")
    entries = [str(native_dir), str(runtime_root / "32")]
    os.environ["LD_LIBRARY_PATH"] = ":".join(entry for entry in entries + [library_path] if entry)


def _resolve_runtime_root(sdk_root: Path) -> Path:
    configured = os.environ.get("MVCAM_COMMON_RUNENV")
    if configured:
        return Path(configured)

    candidates = (
        sdk_root / "lib",
        Path("/opt/MVS/lib"),
        Path("/usr/local/MVS/lib"),
    )
    return next((path for path in candidates if path.is_dir()), candidates[0])


def _build_runtime_link_root(runtime_root: Path, architecture_dir: str, versioned_control: Path) -> Path:
    link_root = MVS_RUNTIME_LINK_DIR
    link_native = link_root / architecture_dir
    link_native.mkdir(parents=True, exist_ok=True)

    source_native = runtime_root / architecture_dir
    for source in source_native.iterdir():
        target = link_native / source.name
        if target.exists() or target.is_symlink():
            continue
        try:
            target.symlink_to(source)
        except OSError:
            pass

    control_link = link_native / "libMvCameraControl.so"
    if not control_link.exists():
        control_link.symlink_to(versioned_control)

    source_cl = runtime_root / "CLProtocol"
    target_cl = link_root / "CLProtocol"
    if source_cl.exists() and not target_cl.exists():
        target_cl.symlink_to(source_cl, target_is_directory=True)

    return link_root


def _sdk():
    selected = next((path for path in MVS_IMPORT_DIRS if path.exists()), None)
    if selected is None:
        raise MVSUnavailable("MvImport not found. Install Hikrobot MVS SDK or copy MvImport beside main.py.")

    if str(selected) not in sys.path:
        sys.path.insert(0, str(selected))

    _configure_mvs_environment()

    try:
        import MvCameraControl_class as control
        import CameraParams_header as params
        import PixelType_header as pixels

        return control, params, pixels
    except (ImportError, OSError, TypeError) as exc:
        raise MVSUnavailable(f"Hikrobot MVS SDK could not be loaded: {exc}") from exc


def _decode(chars) -> str:
    return bytes(chars).split(b"\0", 1)[0].decode("utf-8", errors="replace").strip()


def _ip(value: int) -> str:
    return ".".join(str((value >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def _transport_mask(control) -> int:
    names = (
        "MV_GIGE_DEVICE",
        "MV_USB_DEVICE",
        "MV_GENTL_GIGE_DEVICE",
        "MV_GENTL_CAMERALINK_DEVICE",
        "MV_GENTL_CXP_DEVICE",
        "MV_GENTL_XOF_DEVICE",
    )
    mask = 0
    for name in names:
        mask |= int(getattr(control, name, 0))
    return mask


def _device_details(control, info, index: int) -> HikrobotDevice:
    layer = info.nTLayerType

    if layer in (getattr(control, "MV_GIGE_DEVICE", None), getattr(control, "MV_GENTL_GIGE_DEVICE", None)):
        gige = info.SpecialInfo.stGigEInfo
        return HikrobotDevice(
            index=index,
            serial=_decode(gige.chSerialNumber),
            model=_decode(gige.chModelName),
            transport="GigE",
            ip=_ip(gige.nCurrentIp),
        )

    if layer == getattr(control, "MV_USB_DEVICE", None):
        usb = info.SpecialInfo.stUsb3VInfo
        return HikrobotDevice(
            index=index,
            serial=_decode(usb.chSerialNumber),
            model=_decode(usb.chModelName),
            transport="USB3",
        )

    transport_fields = (
        ("MV_GENTL_CAMERALINK_DEVICE", "stCMLInfo", "CameraLink"),
        ("MV_GENTL_CXP_DEVICE", "stCXPInfo", "CXP"),
        ("MV_GENTL_XOF_DEVICE", "stXoFInfo", "XoF"),
    )
    for constant, field_name, transport in transport_fields:
        if layer == getattr(control, constant, None):
            transport_info = getattr(info.SpecialInfo, field_name)
            return HikrobotDevice(
                index=index,
                serial=_decode(transport_info.chSerialNumber),
                model=_decode(transport_info.chModelName),
                transport=transport,
            )

    return HikrobotDevice(index=index, serial="", model="", transport=f"Unknown 0x{layer:x}")


def _enumerate_device_infos(control, params):
    devices = params.MV_CC_DEVICE_INFO_LIST()
    ret = control.MvCamera.MV_CC_EnumDevices(_transport_mask(control), devices)
    if ret != 0:
        raise RuntimeError(f"Enumerate devices failed: 0x{ret:x}")
    return devices


def discover_devices() -> list[HikrobotDevice]:
    control, params, _ = _sdk()
    control.MvCamera.MV_CC_Initialize()
    try:
        devices = _enumerate_device_infos(control, params)
        discovered: list[HikrobotDevice] = []
        for index in range(devices.nDeviceNum):
            info = ctypes.cast(
                devices.pDeviceInfo[index],
                ctypes.POINTER(params.MV_CC_DEVICE_INFO),
            ).contents
            discovered.append(_device_details(control, info, index))
        return discovered
    finally:
        control.MvCamera.MV_CC_Finalize()


class HikrobotCamera:
    PIXEL_FORMATS = ("BayerRG8", "BayerGB8", "BayerGR8", "BayerBG8", "RGB8Packed", "BGR8Packed")

    def __init__(self, serial: str | None, config: dict):
        self.serial = serial
        self.config = config
        self.control = None
        self.params = None
        self.pixels = None
        self.cam = None
        self.opened = False
        self.width = 0
        self.height = 0
        self._lock = threading.RLock()

    @staticmethod
    def _check(ret: int, action: str) -> None:
        if ret != 0:
            raise RuntimeError(f"{action} failed: 0x{ret:x}")

    def _find(self):
        devices = _enumerate_device_infos(self.control, self.params)
        discovered: list[HikrobotDevice] = []

        for index in range(devices.nDeviceNum):
            info = ctypes.cast(
                devices.pDeviceInfo[index],
                ctypes.POINTER(self.params.MV_CC_DEVICE_INFO),
            ).contents
            details = _device_details(self.control, info, index)
            discovered.append(details)
            if self.serial and details.serial == self.serial:
                return info
            if not self.serial and index == 0:
                self.serial = details.serial
                LOG.info(
                    "Using camera index=%s serial=%s model=%s transport=%s",
                    details.index,
                    details.serial or "-",
                    details.model or "-",
                    details.transport,
                )
                return info

        if not discovered:
            raise RuntimeError("No Hikrobot cameras were found by the MVS SDK")

        available = ", ".join(
            f"{device.serial or 'no-serial'} ({device.model or device.transport})"
            for device in discovered
        )
        raise RuntimeError(f"Camera serial {self.serial} was not found. Available: {available}")

    def open(self) -> None:
        with self._lock:
            self.control, self.params, self.pixels = _sdk()
            self.control.MvCamera.MV_CC_Initialize()
            self.cam = self.control.MvCamera()

            info = self._find()
            self._check(self.cam.MV_CC_CreateHandle(info), "Create camera handle")
            try:
                self._check(self.cam.MV_CC_OpenDevice(self.control.MV_ACCESS_Control, 0), "Open camera")
                self.opened = True

                packet_size = self.cam.MV_CC_GetOptimalPacketSize()
                if packet_size > 0:
                    self.cam.MV_CC_SetIntValue("GevSCPSPacketSize", packet_size)

                self.cam.MV_CC_SetEnumValue("TriggerMode", self.control.MV_TRIGGER_MODE_OFF)
                self.cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                self.set_exposure(float(self.config["exposure"]))
                self.cam.MV_CC_SetEnumValue("GainAuto", 0)
                self.cam.MV_CC_SetFloatValue("Gain", float(self.config["gain"]))
                self.cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
                self.cam.MV_CC_SetFloatValue("AcquisitionFrameRate", float(self.config["fps"]))

                requested = self.config.get("pixel_format")
                formats = (requested,) if requested else self.PIXEL_FORMATS
                for pixel_format in formats:
                    if pixel_format and self.cam.MV_CC_SetEnumValueByString("PixelFormat", pixel_format) == 0:
                        LOG.info("camera=%s pixel_format=%s", self.serial, pixel_format)
                        break

                self._check(self.cam.MV_CC_StartGrabbing(), "Start grabbing")
                self._log_diagnostics(packet_size)
            except Exception:
                self.close()
                raise

    def _log_diagnostics(self, negotiated_packet_size: int) -> None:
        def get_float(node):
            value = self.params.MVCC_FLOATVALUE()
            ctypes.memset(ctypes.byref(value), 0, ctypes.sizeof(value))
            if self.cam.MV_CC_GetFloatValue(node, value) == 0:
                return value.fCurValue
            return None

        def get_int(node):
            value = self.params.MVCC_INTVALUE()
            ctypes.memset(ctypes.byref(value), 0, ctypes.sizeof(value))
            if self.cam.MV_CC_GetIntValue(node, value) == 0:
                return value.nCurValue
            return None

        resulting_fps = get_float("ResultingFrameRate")
        throughput_limit = get_int("DeviceLinkThroughputLimit")
        throughput_current = get_int("DeviceLinkCurrentThroughput") or get_int("GevSCDCT")
        packet_delay = get_int("GevSCPD")
        exposure = get_float("ExposureTime")

        LOG.info(
            "camera diagnostics: negotiated_packet_size=%s resulting_fps=%s throughput_limit=%s "
            "throughput_current=%s packet_delay=%s exposure_us=%s",
            negotiated_packet_size, resulting_fps, throughput_limit,
            throughput_current, packet_delay, exposure,
        )

    def read(self):
        with self._lock:
            t_lock_acquired = time.perf_counter()
            frame = self.params.MV_FRAME_OUT()
            ctypes.memset(ctypes.byref(frame), 0, ctypes.sizeof(frame))
            t_buffer_start = time.perf_counter()
            ret = self.cam.MV_CC_GetImageBuffer(frame, 1000)
            t_buffer_done = time.perf_counter()
            if ret != 0:
                LOG.debug("read: GetImageBuffer wait=%.4fs ret=0x%x (no frame)",
                          t_buffer_done - t_buffer_start, ret)
                return None

            try:
                info = frame.stFrameInfo
                self.width = int(info.nWidth)
                self.height = int(info.nHeight)
                size = self.width * self.height * 3

                t_alloc_start = time.perf_counter()
                output = (ctypes.c_ubyte * size)()
                convert = self.params.MV_CC_PIXEL_CONVERT_PARAM()
                ctypes.memset(ctypes.byref(convert), 0, ctypes.sizeof(convert))
                convert.nWidth = self.width
                convert.nHeight = self.height
                convert.pSrcData = frame.pBufAddr
                convert.nSrcDataLen = info.nFrameLen
                convert.enSrcPixelType = info.enPixelType
                convert.enDstPixelType = self.pixels.PixelType_Gvsp_BGR8_Packed
                convert.pDstBuffer = output
                convert.nDstBufferSize = size
                t_alloc_done = time.perf_counter()

                self._check(self.cam.MV_CC_ConvertPixelType(convert), "Convert pixel")
                t_convert_done = time.perf_counter()

                result = np.frombuffer(output, dtype=np.uint8).reshape((self.height, self.width, 3))
                t_reshape_done = time.perf_counter()

                LOG.debug(
                    "read: lock_wait=%.4fs buffer_wait=%.4fs alloc=%.4fs convert=%.4fs reshape=%.4fs "
                    "total=%.4fs size=%dx%d",
                    t_buffer_start - t_lock_acquired,
                    t_buffer_done - t_buffer_start,
                    t_alloc_done - t_alloc_start,
                    t_convert_done - t_alloc_done,
                    t_reshape_done - t_convert_done,
                    t_reshape_done - t_lock_acquired,
                    self.width, self.height,
                )
                return result
            finally:
                t_free_start = time.perf_counter()
                self.cam.MV_CC_FreeImageBuffer(frame)
                LOG.debug("read: free_buffer=%.4fs", time.perf_counter() - t_free_start)

    def set_exposure(self, exposure: float) -> None:
        exposure = float(exposure)
        if exposure <= 0:
            raise ValueError("Exposure must be greater than 0")

        with self._lock:
            self.config["exposure"] = exposure
            if self.opened and self.cam:
                self.cam.MV_CC_SetEnumValue("ExposureAuto", 0)
                self._check(self.cam.MV_CC_SetFloatValue("ExposureTime", exposure), "Set exposure")

    def close(self) -> None:
        with self._lock:
            if self.cam:
                if self.opened:
                    self.cam.MV_CC_StopGrabbing()
                    self.cam.MV_CC_CloseDevice()

                self.cam.MV_CC_DestroyHandle()
                self.opened = False
                self.cam = None

            if self.control:
                self.control.MvCamera.MV_CC_Finalize()
                self.control = None
