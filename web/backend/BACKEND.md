# Backend Reference Guide — Kidney Stone Detection Inference API

> **Status:** Reference / learning guide. Implementasi backend **tidak** dieksekusi oleh agent; ini adalah patokan kamu sendiri saat membangun service inference. Frontend di `web/frontend/` sudah dirancang berdasarkan kontrak HTTP di dokumen ini.

Dokumen ini menjabarkan bagaimana membangun layer inference minimal untuk men-deploy `best.pt` (YOLO single-class: `stone`) di balik satu endpoint REST yang dikonsumsi frontend. Tujuannya tidak production-grade — cukup membuat frontend bisa berjalan end-to-end di lokal dan memberi kamu fondasi untuk belajar lebih jauh.

---

## 1. Tech Stack

| Komponen          | Pilihan                | Alasan                                                              |
|-------------------|------------------------|---------------------------------------------------------------------|
| HTTP framework    | **FastAPI**            | Async-native, OpenAPI otomatis, type hints langsung jadi validasi   |
| ASGI server       | **Uvicorn**            | Default pasangan FastAPI; `--reload` untuk dev                      |
| Inference         | **Ultralytics 8.3.x**  | Loader resmi `.pt`, API `model.predict()` stabil                    |
| Image decode      | **Pillow**             | Decode bytes → PIL.Image, handle PNG/JPEG/BMP/TIFF                  |
| Multipart parser  | **python-multipart**   | Diperlukan FastAPI saat menerima `UploadFile`                        |
| Rate limit (opsi) | **slowapi**            | Mencegah penyalahgunaan saat di-deploy                              |
| Test              | **pytest + httpx**     | Unit + integration; `httpx.AsyncClient` untuk simulasi request      |
| Property tests    | **hypothesis**         | Untuk validasi properti respons (lihat Section 7)                    |

### `requirements.txt`

```txt
fastapi>=0.115,<0.120
uvicorn[standard]>=0.30
python-multipart>=0.0.9
ultralytics==8.3.*
pillow>=10.0
torch>=2.2          # sesuaikan dengan CUDA host; di Windows tanpa GPU pakai CPU build
slowapi>=0.1.9      # opsional
pytest>=8
httpx>=0.27
hypothesis>=6
```

> **Catatan PyTorch di Windows.** Jika kamu pakai CPU saja, install dari index resmi:
> ```cmd
> pip install torch --index-url https://download.pytorch.org/whl/cpu
> ```
> Untuk CUDA 12.1 di Windows: `pip install torch --index-url https://download.pytorch.org/whl/cu121`. Cek versi CUDA yang cocok dengan driver GPU kamu di `nvidia-smi`.

---

## 2. Directory Layout

```
web/backend/
├── README.md              # dokumen ini
├── requirements.txt
├── main.py                # FastAPI app + endpoint
├── inference.py           # wrapper Ultralytics (separation of concerns)
├── schemas.py             # Pydantic response models
├── settings.py            # konfigurasi via env var
└── tests/
    ├── test_detect.py     # integration test endpoint
    └── test_schema.py     # property tests dengan hypothesis
```

Path model `best.pt` defaultnya diambil dari root workspace (`../../best.pt` relatif terhadap `web/backend/`), atau di-override via env var `MODEL_WEIGHTS`.

---

## 3. API Contract (Yang Frontend Asumsikan)

Frontend di `web/frontend/` bergantung **mutlak** pada kontrak ini. Selama backend yang kamu bangun mematuhi shape berikut, frontend berfungsi tanpa modifikasi.

### Endpoint

```
POST /api/detect
Content-Type: multipart/form-data
```

### Request Fields (multipart)

| Field    | Type         | Wajib | Default | Catatan                                                 |
|----------|--------------|-------|---------|---------------------------------------------------------|
| `image`  | file         | ya    | —       | MIME ∈ {png, jpeg, bmp, tiff}, ≤ 20 MB                  |
| `conf`   | string→float | tidak | `0.05`  | Range `[0.0, 1.0]`. Frontend kirim 0.05 supaya bisa filter lokal |
| `iou`    | string→float | tidak | `0.5`   | Range `[0.0, 1.0]`                                      |
| `imgsz`  | string→int   | tidak | `1280`  | ∈ {320, 640, 1024, 1280, 1536}                          |

### Response — `200 OK`

```json
{
  "detections": [
    {
      "class_id": 0,
      "class_name": "stone",
      "confidence": 0.874,
      "bbox": { "x": 123.0, "y": 45.0, "width": 87.0, "height": 135.0 }
    }
  ],
  "image": { "width": 1024, "height": 768 },
  "meta": {
    "inference_ms": 842.3,
    "model_imgsz": 1280,
    "conf_threshold": 0.05,
    "iou_threshold": 0.5
  }
}
```

**Wajib dipatuhi:**

- `image.width` dan `image.height` adalah dimensi gambar **input** (bukan ukuran inference internal).
- `bbox` dalam **piksel asli** (bukan ternormalisasi 0–1).
- `bbox.x + bbox.width <= image.width` dan `bbox.y + bbox.height <= image.height`.
- `confidence ∈ [0, 1]`.

### Error Responses

| Status | Body                                | Kapan                                                    |
|--------|-------------------------------------|----------------------------------------------------------|
| `400`  | `{"detail": "Unsupported image type"}` | MIME tidak didukung                                  |
| `400`  | `{"detail": "conf/iou must be in [0,1]"}` | Param di luar range                              |
| `400`  | `{"detail": "Cannot decode image"}` | Gambar korup / bukan format gambar                       |
| `413`  | `{"detail": "Payload too large"}`   | File > 20 MB (jika di-enforce di proxy/middleware)       |
| `422`  | (FastAPI default)                   | Field hilang / tipe salah (auto dari Pydantic)           |
| `500`  | `{"detail": "<reason>"}`            | Inference internal error                                 |

---

## 4. Implementasi Minimal (`main.py`)

Versi paling sederhana — single file, tanpa dependency injection. Cukup untuk dev lokal dan untuk membuktikan kontrak API berfungsi.

```python
# web/backend/main.py
import io
import os
import time
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLO

ALLOWED_MIME = {"image/png", "image/jpeg", "image/bmp", "image/tiff"}
ALLOWED_IMGSZ = {320, 640, 1024, 1280, 1536}

WEIGHTS = os.environ.get(
    "MODEL_WEIGHTS",
    str(Path(__file__).resolve().parents[2] / "best.pt"),
)

app = FastAPI(title="Kidney Stone Detection API", version="0.1.0")

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

    # 4. Serialisasi Results → schema yang kontrak butuhkan
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
                "x": x1, "y": y1,
                "width": x2 - x1, "height": y2 - y1,
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
```

### Run

```cmd
cd web\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Setelah jalan, buka `http://127.0.0.1:8000/docs` untuk melihat Swagger UI auto-generated FastAPI. Test endpoint `/api/health` dulu untuk memastikan model load sukses.

---

## 5. Refactor Suggestion (Opsional, Saat Sudah Nyaman)

Setelah versi single-file di atas berfungsi, pisahkan tanggung jawab agar lebih bisa di-test:

### `schemas.py` (Pydantic)

```python
from pydantic import BaseModel, Field, NonNegativeFloat

class BBox(BaseModel):
    x: NonNegativeFloat
    y: NonNegativeFloat
    width: float = Field(gt=0)
    height: float = Field(gt=0)

class DetectionItem(BaseModel):
    class_id: int
    class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BBox

class ImageDims(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)

class Meta(BaseModel):
    inference_ms: float
    model_imgsz: int
    conf_threshold: float
    iou_threshold: float

class DetectionResponse(BaseModel):
    detections: list[DetectionItem]
    image: ImageDims
    meta: Meta
```

Lalu di route, return type → `DetectionResponse` dan FastAPI otomatis validasi shape sebelum kirim ke client. Ini menutup celah "backend mengembalikan deteksi tidak valid" yang frontend defensive-validate.

### `inference.py` (wrapper)

```python
from ultralytics import YOLO
from PIL import Image

class Detector:
    def __init__(self, weights: str):
        self.model = YOLO(weights)
        self.names = self.model.names

    def predict(self, img: Image.Image, *, conf: float, iou: float, imgsz: int):
        return self.model.predict(img, conf=conf, iou=iou, imgsz=imgsz, verbose=False)[0]
```

Test bisa mock `Detector` tanpa load model `.pt` — drastis mempercepat suite.

---

## 6. Hardening Untuk Deploy (Bukan MVP)

Aktifkan hanya saat sudah keluar dari local dev:

- **Rate limiting** dengan `slowapi` (mis. 10 req/min per IP) — cegah DoS inference.
- **Request size limit** di reverse proxy (Nginx `client_max_body_size 25M`) atau middleware FastAPI untuk reject > 20 MB sebelum di-buffer.
- **Tidak persist gambar** ke disk — semua di RAM, release setelah response. Penting untuk data medis (no PHI footprint).
- **HTTPS** wajib jika di expose ke internet — pakai Caddy atau Cloudflare.
- **Auth sederhana** (mis. API key header) jika hosting publik. JWT overkill untuk single-user tool.
- **Async runner**: `model.predict` synchronous; bungkus dengan `asyncio.to_thread()` agar event loop tidak blok pada request panjang.
- **Worker count**: Uvicorn `--workers N` untuk multi-instance. Tapi setiap worker load `best.pt` sendiri (RAM × N) — tune sesuai memori.

---

## 7. Testing Tips

### Smoke test cepat dengan `httpx` di REPL

```python
import httpx
r = httpx.post(
    "http://127.0.0.1:8000/api/detect",
    files={"image": ("ct.png", open("sample_ct.png", "rb"), "image/png")},
    data={"conf": "0.05", "iou": "0.5", "imgsz": "1280"},
    timeout=30,
)
print(r.status_code, r.json())
```

### Property test untuk schema (`tests/test_schema.py`)

```python
from hypothesis import given, strategies as st
from main import app  # asumsi app sudah di-load dengan model
from fastapi.testclient import TestClient

client = TestClient(app)

# Test: untuk semua image valid yang dikirim, semua bbox dalam batas image dimensions.
def test_detection_bbox_within_image_bounds():
    # Kirim sample CT yang dimensinya kamu ketahui
    with open("tests/fixtures/sample_ct.png", "rb") as f:
        r = client.post(
            "/api/detect",
            files={"image": ("sample_ct.png", f, "image/png")},
            data={"conf": "0.001"},  # sengaja rendah untuk dapat banyak deteksi
        )
    assert r.status_code == 200
    body = r.json()
    W, H = body["image"]["width"], body["image"]["height"]
    for d in body["detections"]:
        b = d["bbox"]
        assert b["x"] >= 0
        assert b["y"] >= 0
        assert b["x"] + b["width"] <= W + 1e-3   # toleransi float
        assert b["y"] + b["height"] <= H + 1e-3
        assert 0.0 <= d["confidence"] <= 1.0
```

### Korup file harus 400, bukan 500

```python
def test_corrupt_image_returns_400():
    r = client.post(
        "/api/detect",
        files={"image": ("x.png", b"not-a-real-png", "image/png")},
    )
    assert r.status_code == 400
    assert "Cannot decode" in r.json()["detail"]
```

---

## 8. Common Pitfalls & Cara Debug

| Gejala                                     | Kemungkinan Penyebab                              | Cara debug / fix                                    |
|--------------------------------------------|---------------------------------------------------|-----------------------------------------------------|
| Frontend dapat CORS error                  | `allow_origins` belum mencakup origin frontend    | Tambahkan `http://localhost:5173` ke list           |
| `model.predict` hang ~30 detik             | Pertama kali load, Ultralytics download lib bantu | Pre-warm di startup: `model.predict(dummy_img)` sekali |
| `RuntimeError: CUDA out of memory`          | `imgsz=1280` + GPU kecil                          | Turunkan ke `1024` atau `device="cpu"`              |
| BBox terlihat "geser" di frontend          | Backend kirim koord dalam ukuran inference, bukan input | Pastikan pakai `b.xyxy` (sudah di-rescale ke input), bukan `b.xyxyn` |
| `inference_ms` >5s di CPU                   | Wajar tanpa GPU pada `imgsz=1280`                 | Kasih opsi imgsz lebih kecil di frontend; atau cache last result |
| Response sangat besar (>1MB)               | Threshold `conf` terlalu rendah → ratusan deteksi | Pastikan kontrak: frontend kirim `conf=0.05`, jangan 0.0 |
| Model load fail "Cannot find best.pt"      | Path relatif salah                                 | Set env `MODEL_WEIGHTS=C:\Users\User\Data_Science\yolo\best.pt` |

---

## 9. Belajar Lebih Jauh — Suggested Path

1. **Mulai dari `main.py` di Section 4.** Pastikan `/api/health` jalan dan model load.
2. **Coba di Swagger UI** (`/docs`). Upload gambar manual, lihat response.
3. **Jalankan frontend** (`web/frontend/`, port 5173). Pastikan integrasi end-to-end berhasil.
4. **Refactor ke 3-file layout** (Section 5). Tambah Pydantic response model.
5. **Tambahkan tests** dengan `pytest` + `TestClient` (Section 7).
6. **Eksperimen optimasi**: pre-warm model, batching kalau mau handle multi-image, pakai `asyncio.to_thread`.
7. **Deploy**: dimulai dari `uvicorn` + Caddy reverse proxy di VPS sederhana, baru pikirkan containerization.

Saat kamu siap untuk satu langkah di atas, ping aja — kita bisa pair pada implementasi spesifiknya.

---

## 10. Resources

- FastAPI docs: <https://fastapi.tiangolo.com/>
- Ultralytics Python API: <https://docs.ultralytics.com/usage/python/>
- Ultralytics `Results` object reference: <https://docs.ultralytics.com/modes/predict/#working-with-results>
- Hypothesis strategies: <https://hypothesis.readthedocs.io/en/latest/data.html>
- Frontend kontrak yang harus dipatuhi: lihat `.kiro/specs/kidney-stone-detection-frontend/design.md` section "External API Contract".
