import argparse
import shutil
import subprocess
import sys
import time
from ctypes import *
from pathlib import Path

import cv2
import numpy as np

from qr_scanner import QRScanner


MVS_IMPORT_DIRS = [
    Path(r"C:\Program Files (x86)\MVS\Development\Samples\Python\MvImport"),
    Path("/opt/MVS/Samples/64/Python/MvImport"),
    Path("/opt/MVS/Development/Samples/Python/MvImport"),
    Path(__file__).resolve().parent / "MvImport",
]

for p in MVS_IMPORT_DIRS:
    if p.exists():
        sys.path.append(str(p))
        break
else:
    raise FileNotFoundError("MvImport not found. Copy MvImport near app.py")

from MvCameraControl_class import *
from CameraParams_header import *
from MvErrorDefine_const import *
from PixelType_header import *


def check_ret(ret, action):
    if ret != 0:
        raise RuntimeError(f"{action} failed: 0x{ret:x}")


def int_to_ip(ip_int):
    return ".".join(str((ip_int >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def find_camera_by_ip(target_ip):
    device_list = MV_CC_DEVICE_INFO_LIST()
    ret = MvCamera.MV_CC_EnumDevices(MV_GIGE_DEVICE, device_list)
    check_ret(ret, "Enum devices")

    if device_list.nDeviceNum == 0:
        raise RuntimeError("No GigE camera found")

    found_ips = []

    for i in range(device_list.nDeviceNum):
        info = cast(device_list.pDeviceInfo[i], POINTER(MV_CC_DEVICE_INFO)).contents

        if info.nTLayerType != MV_GIGE_DEVICE:
            continue

        ip = int_to_ip(info.SpecialInfo.stGigEInfo.nCurrentIp)
        found_ips.append(ip)

        if ip == target_ip:
            return info

    raise RuntimeError(f"Camera IP {target_ip} not found. Found: {found_ips}")


class HikrobotCamera:
    def __init__(self, camera_ip, exposure, gain, fps):
        self.camera_ip = camera_ip
        self.exposure = exposure
        self.gain = gain
        self.fps = fps
        self.cam = MvCamera()
        self.opened = False

    def open(self):
        device_info = find_camera_by_ip(self.camera_ip)

        check_ret(self.cam.MV_CC_CreateHandle(device_info), "Create handle")
        check_ret(self.cam.MV_CC_OpenDevice(MV_ACCESS_Control, 0), "Open camera")
        self.opened = True

        packet_size = self.cam.MV_CC_GetOptimalPacketSize()
        if packet_size > 0:
            self.cam.MV_CC_SetIntValue("GevSCPSPacketSize", packet_size)

        self.cam.MV_CC_SetEnumValue("TriggerMode", MV_TRIGGER_MODE_OFF)

        self.cam.MV_CC_SetEnumValue("ExposureAuto", 0)
        self.cam.MV_CC_SetFloatValue("ExposureTime", float(self.exposure))

        self.cam.MV_CC_SetEnumValue("GainAuto", 0)
        self.cam.MV_CC_SetFloatValue("Gain", float(self.gain))

        self.cam.MV_CC_SetBoolValue("AcquisitionFrameRateEnable", True)
        self.cam.MV_CC_SetFloatValue("AcquisitionFrameRate", float(self.fps))

        for fmt in ["BayerRG8", "BayerGB8", "BayerGR8", "BayerBG8", "RGB8Packed", "BGR8Packed"]:
            if self.cam.MV_CC_SetEnumValueByString("PixelFormat", fmt) == 0:
                print(f"PixelFormat set: {fmt}")
                break

        check_ret(self.cam.MV_CC_StartGrabbing(), "Start grabbing")

    def read(self):
        frame_out = MV_FRAME_OUT()
        memset(byref(frame_out), 0, sizeof(frame_out))

        ret = self.cam.MV_CC_GetImageBuffer(frame_out, 1000)
        if ret != 0:
            return None

        try:
            info = frame_out.stFrameInfo
            width = info.nWidth
            height = info.nHeight

            dst_size = width * height * 3
            dst_buffer = (c_ubyte * dst_size)()

            convert_param = MV_CC_PIXEL_CONVERT_PARAM()
            memset(byref(convert_param), 0, sizeof(convert_param))

            convert_param.nWidth = width
            convert_param.nHeight = height
            convert_param.pSrcData = frame_out.pBufAddr
            convert_param.nSrcDataLen = info.nFrameLen
            convert_param.enSrcPixelType = info.enPixelType
            convert_param.enDstPixelType = PixelType_Gvsp_BGR8_Packed
            convert_param.pDstBuffer = dst_buffer
            convert_param.nDstBufferSize = dst_size

            check_ret(self.cam.MV_CC_ConvertPixelType(convert_param), "Convert pixel")

            image = np.frombuffer(dst_buffer, dtype=np.uint8).reshape((height, width, 3))
            return image.copy()

        finally:
            self.cam.MV_CC_FreeImageBuffer(frame_out)

    def close(self):
        if not self.opened:
            return

        self.cam.MV_CC_StopGrabbing()
        self.cam.MV_CC_CloseDevice()
        self.cam.MV_CC_DestroyHandle()
        self.opened = False


class RTSPPublisher:
    def __init__(self, rtsp_url, width, height, fps):
        self.rtsp_url = rtsp_url
        self.width = width
        self.height = height
        self.fps = max(int(fps), 1)
        self.proc = None

    def start(self):
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise FileNotFoundError("ffmpeg not found. Install: sudo apt install -y ffmpeg")

        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel", "warning",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{self.width}x{self.height}",
            "-r", str(self.fps),
            "-i", "pipe:0",
            "-an",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-profile:v", "baseline",
            "-pix_fmt", "yuv420p",
            "-g", str(max(self.fps * 2, 10)),
            "-bf", "0",
            "-f", "rtsp",
            "-rtsp_transport", "tcp",
            self.rtsp_url,
        ]

        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )

        print(f"Streaming started: {self.rtsp_url}")

    def write(self, frame):
        if self.proc is None or self.proc.stdin is None:
            return

        if self.proc.poll() is not None:
            print("[RTSP] ffmpeg stopped")
            return

        try:
            self.proc.stdin.write(frame.tobytes())
        except BrokenPipeError:
            print("[RTSP] broken pipe")

    def stop(self):
        if not self.proc:
            return

        try:
            if self.proc.stdin:
                self.proc.stdin.close()
        except Exception:
            pass

        self.proc.terminate()

        try:
            self.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def draw_qr_overlay(frame, results, messages, camera_ip, fps):
    h, w = frame.shape[:2]

    for result in results:
        x1, y1, x2, y2 = result.xyxy
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 255), 2)
        cv2.putText(
            frame,
            result.value[:35],
            (x1, max(25, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 220, 255),
            2,
            cv2.LINE_AA,
        )

    cv2.rectangle(frame, (0, 0), (w, 42), (0, 0, 0), -1)
    cv2.putText(
        frame,
        f"Hikrobot QR LIVE | {camera_ip} | {fps} FPS",
        (18, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2,
        cv2.LINE_AA,
    )

    lines = messages[-4:] if messages else ["Scanning..."]
    panel_h = 36 + len(lines) * 28

    overlay = frame.copy()
    cv2.rectangle(overlay, (0, h - panel_h), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    y = h - panel_h + 32

    for i, value in enumerate(lines, start=1):
        text = value if value == "Scanning..." else f"{i}. {value}"
        cv2.putText(
            frame,
            text[:80],
            (18, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )
        y += 28

    return frame


def save_crop(result, crop_dir):
    if result.crop is None or result.crop.size == 0:
        return

    crop_dir.mkdir(parents=True, exist_ok=True)
    name = str(abs(hash(result.value)))[:12]
    cv2.imwrite(str(crop_dir / f"qr_{name}.jpg"), result.crop)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--camera-ip", required=True)
    parser.add_argument("--rtsp-url", required=True)

    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--fps", type=int, default=25)

    parser.add_argument("--exposure", type=float, default=80000.0)
    parser.add_argument("--gain", type=float, default=12.0)

    parser.add_argument("--qr-skip", type=int, default=3)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--crop-dir", default="qr_crops")

    args = parser.parse_args()

    camera = HikrobotCamera(
        camera_ip=args.camera_ip,
        exposure=args.exposure,
        gain=args.gain,
        fps=args.fps,
    )

    publisher = RTSPPublisher(
        rtsp_url=args.rtsp_url,
        width=args.width,
        height=args.height,
        fps=args.fps,
    )

    scanner = QRScanner()

    seen = set()
    messages = []
    last_results = []
    crop_dir = Path(args.crop_dir)

    frame_no = 0
    frame_interval = 1.0 / max(args.fps, 1)

    try:
        camera.open()
        publisher.start()

        if args.preview:
            cv2.namedWindow("QR Live Preview", cv2.WINDOW_NORMAL)

        while True:
            start = time.time()

            frame = camera.read()
            if frame is None:
                continue

            frame = cv2.resize(
                frame,
                (args.width, args.height),
                interpolation=cv2.INTER_AREA,
            )

            if frame_no % max(args.qr_skip, 1) == 0:
                results = scanner.scan(frame)
                last_results = results

                for result in results:
                    if result.value in seen:
                        continue

                    seen.add(result.value)
                    messages.append(result.value)
                    save_crop(result, crop_dir)
                    print(f"✓ {result.value}")

            annotated = frame.copy()
            annotated = draw_qr_overlay(
                annotated,
                last_results,
                messages,
                args.camera_ip,
                args.fps,
            )

            publisher.write(annotated)

            if args.preview:
                cv2.imshow("QR Live Preview", annotated)
                key = cv2.waitKey(1) & 0xFF

                if key == ord("q") or key == 27:
                    break

            elapsed = time.time() - start
            sleep_time = frame_interval - elapsed

            if sleep_time > 0:
                time.sleep(sleep_time)

            frame_no += 1

    except KeyboardInterrupt:
        pass

    finally:
        publisher.stop()
        camera.close()

        if args.preview:
            cv2.destroyAllWindows()

    print("-" * 60)
    print(f"Total QR/DataMatrix detected: {len(seen)}")
    for value in seen:
        print(f"✓ {value}")


if __name__ == "__main__":
    main()