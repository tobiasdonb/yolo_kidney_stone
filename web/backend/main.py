# web/backend/main.py
import io
import time
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLO

ALLOWED_MIME = {"image/png", "image/jpeg", "image/bmp", "image/tiff"}
ALLOWED_IMGSZ = {320, 640, 1024, 1280, 1536}

# Path bobot model — resolved relative to the file location (workspace root)
WEIGHTS = str((Path(__file__).resolve().parent.parent.parent / "model_result" / "train-2" / "best.pt").resolve())

app = FastAPI(
    title="Kidney Stone Detection API",
    description="API untuk mendeteksi batu ginjal menggunakan YOLO",
    version="1.0",
)

# CORS: izinkan origin dev frontend (Vite default 5173).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# Load model sekali saat startup.
model = YOLO(WEIGHTS)
NAMES = model.names  # dict {0: "stone"}


@app.get("/api/health")
def health():
    return {"status": "ok", "weights": WEIGHTS, "names": NAMES}


@app.post("/api/detect")
async def detect(
    image: UploadFile,
    conf: float = Form(0.05),
    iou: float = Form(0.5),
    imgsz: int = Form(1280),
):
    # 1. Validasi input
    if image.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported image type: {image.content_type}")
    if not (0.0 <= conf <= 1.0 and 0.0 <= iou <= 1.0):
        raise HTTPException(400, "conf/iou must be in [0,1]")
    if imgsz not in ALLOWED_IMGSZ:
        raise HTTPException(400, f"imgsz must be in {sorted(ALLOWED_IMGSZ)}")

    # 2. Decode gambar
    raw = await image.read()
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Cannot decode image")

    # 3. Inference
    t0 = time.perf_counter()
    try:
        results = model.predict(img, conf=conf, iou=iou, imgsz=imgsz, verbose=False)
    except Exception as e:
        raise HTTPException(500, f"Inference failed: {e}")
    inference_ms = (time.perf_counter() - t0) * 1000

    # 4. Serialisasi Results → schema sesuai kontrak frontend
    r = results[0]
    detections = []
    for b in r.boxes:
        x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
        # Clamp ke batas gambar (defensive — Ultralytics terkadang sub-pixel di luar)
        x1 = max(0.0, min(x1, float(img.width)))
        y1 = max(0.0, min(y1, float(img.height)))
        x2 = max(0.0, min(x2, float(img.width)))
        y2 = max(0.0, min(y2, float(img.height)))
        if x2 <= x1 or y2 <= y1:
            continue  # skip degenerate boxes
        detections.append({
            "class_id": int(b.cls.item()),
            "class_name": NAMES[int(b.cls.item())],
            "confidence": float(b.conf.item()),
            "bbox": {
                "x": x1,
                "y": y1,
                "width": x2 - x1,
                "height": y2 - y1,
            },
        })

    return {
        "detections": detections,
        "image": {"width": img.width, "height": img.height},
        "meta": {
            "inference_ms": round(inference_ms, 2),
            "model_imgsz": imgsz,
            "conf_threshold": conf,
            "iou_threshold": iou,
        },
    }
