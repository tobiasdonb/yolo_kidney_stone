# Requirements Document

## Introduction

Dokumen ini menurunkan persyaratan **frontend** untuk aplikasi web Kidney Stone Detection berdasarkan `design.md`. Lingkup mutlak hanya **antarmuka web (UI/UX + frontend React/TypeScript)**: pengguna mengunggah citra CT, melihat overlay bounding box deteksi batu ginjal yang dirender real-time di atas gambar, menyesuaikan threshold confidence/IoU, menelusuri daftar deteksi, lalu mengunduh PNG teranotasi.

Backend inference (FastAPI + Ultralytics yang membungkus `best.pt`) **berada di luar lingkup** dokumen ini dan diperlakukan sebagai layanan HTTP eksternal. Frontend hanya bergantung pada *External API Contract* yang didokumentasikan di `design.md` (section "External API Contract"). Implementasi backend disediakan terpisah sebagai bahan pembelajaran di `web/backend/README.md`.

Setiap persyaratan di bawah merujuk ke section `design.md` tempat keputusan teknis aslinya berada, dan—jika relevan—ke properti korektnes formal (P1–P12) di section "Correctness Properties" pada `design.md`.

## Glossary

- **Frontend**: Aplikasi React + TypeScript + Vite + Tailwind di `web/frontend/` yang dirender di browser pengguna.
- **External_Inference_API**: Layanan HTTP eksternal yang mengekspos `POST /api/detect` sesuai *External API Contract* di `design.md`. Bukan bagian dari Frontend.
- **Workspace**: Area utama aplikasi yang berisi UploadZone/ResultViewer di kiri dan ControlPanel di kanan (sesuai wireframe `design.md`).
- **UploadZone**: Komponen drag-and-drop + file picker yang menerima file gambar dari pengguna (`design.md` → Components → Component 1).
- **ResultViewer**: Komponen yang menampilkan gambar asli dan koordinasi overlay bounding box (`design.md` → Components → Component 2).
- **BBoxOverlay**: Layer SVG yang menggambar `<rect>` + label deteksi di atas gambar (`design.md` → Components → Component 3).
- **ControlPanel**: Sidebar kanan yang berisi slider, daftar deteksi, dan tombol unduh (`design.md` → Components → Component 4).
- **ConfidenceSlider**: Slider yang mengatur threshold confidence di sisi klien (`design.md` → Components → Component 5).
- **IoUSlider**: Slider yang menampilkan threshold IoU; mempengaruhi NMS yang dilakukan backend (`design.md` → Components → Component 5/Component 4).
- **DetectionList**: Daftar deteksi terurut menurun berdasarkan confidence (`design.md` → Components → Component 6).
- **DownloadButton**: Tombol yang membuat dan men-trigger unduhan PNG teranotasi via offscreen canvas (`design.md` → Components → Component 7).
- **DetectionStore**: Zustand store yang menyimpan state aplikasi (`design.md` → Data Models → Model 3 `AppState`).
- **Detection**: Objek hasil deteksi tunggal: `{ id, classId, className, confidence, bbox }` (`design.md` → Data Models → Model 1).
- **BBox**: Koordinat bounding box dalam piksel asli: `{ x, y, width, height }` (`design.md` → Data Models → Model 1).
- **Image_Dims**: Dimensi gambar asli `{ width, height }` (piksel `naturalWidth`/`naturalHeight`).
- **Display_Dims**: Dimensi area render di viewport tempat gambar dan overlay digambar.
- **Allowed_MIME**: `{ "image/png", "image/jpeg", "image/bmp", "image/tiff" }` (`design.md` → External API Contract).
- **Max_Size_Bytes**: `20 * 1024 * 1024` (20 MB) (`design.md` → Algorithmic Pseudocode → Algoritma 1).
- **Raw_Confidence**: Nilai konstanta `0.05` yang Frontend kirim sebagai parameter `conf` ke External_Inference_API agar filter dapat dilakukan lokal (`design.md` → External API Contract; Architecture).
- **Filtered_Detections**: Subset `rawDetections` yang lolos `filterByConfidence(rawDetections, confidenceThreshold)`.

## Requirements

### Requirement 1: Upload dan Validasi Gambar

**User Story:** Sebagai pengguna klinis, saya ingin mengunggah citra CT melalui drag-and-drop atau file picker yang divalidasi terlebih dahulu, sehingga saya yakin hanya gambar dengan format dan ukuran yang didukung yang dikirim ke layanan inference.

*Diturunkan dari: `design.md` → UI/UX Design → UI States (1. Empty); Interaction Patterns → Drag-and-drop affordance; Components → Component 1 `UploadZone`; Algorithmic Pseudocode → Algoritma 1.*

#### Acceptance Criteria

1. WHILE belum ada gambar yang diunggah ke DetectionStore, THE UploadZone SHALL menampilkan elemen interaktif utama pada area konten dengan teks "Drag & drop a CT image here" dan sub-teks yang mendaftar setiap MIME type dalam Allowed_MIME beserta batas ukuran 20 MB.
2. WHILE pengguna men-drag file di atas UploadZone, THE UploadZone SHALL mengubah border menjadi `border-sky-500` dan background menjadi `bg-sky-50`; ketika drag berakhir tanpa drop, THE UploadZone SHALL mengembalikan border dan background ke state default.
3. WHEN pengguna menjatuhkan file ke UploadZone atau memilih file melalui file picker, THE UploadZone SHALL meneruskan objek `File` ke handler `onFileAccepted`.
4. IF tipe MIME file berada di luar Allowed_MIME, THEN THE UploadZone SHALL menolak file, menampilkan pesan inline yang menyebutkan format yang diterima, mempertahankan state empty (tetap menerima upload berikutnya tanpa reload), dan SHALL TIDAK memanggil External_Inference_API.
5. IF ukuran file melebihi Max_Size_Bytes, THEN THE UploadZone SHALL menolak file, menampilkan pesan inline yang mengindikasikan ukuran file melebihi Max_Size_Bytes (20 MB), mempertahankan state empty, dan SHALL TIDAK memanggil External_Inference_API.
6. WHEN file lolos validasi, THE Frontend SHALL membuat `URL.createObjectURL(file)` sebagai preview, dan menyimpan `File`, `imageUrl`, `imageDims`, serta `imageElement` ke DetectionStore.
7. WHEN gambar baru diterima sementara sudah ada `imageUrl` lama di DetectionStore, THE Frontend SHALL memanggil `URL.revokeObjectURL` pada `imageUrl` lama sebelum menetapkan yang baru.
8. WHILE pengguna men-drag file gambar baru di atas Workspace dan terdapat `imageUrl` aktif di DetectionStore, THE Workspace SHALL menampilkan overlay drop-zone semi-transparan dengan teks "Drop to replace current image".
9. THE Frontend SHALL melakukan validasi file di sisi klien sebagai pengecekan pre-upload dan SHALL TIDAK menganggap validasi ini sebagai kontrol keamanan otoritatif (otoritas validasi tetap di External_Inference_API).
10. WHEN tombol `Enter` atau `Space` ditekan saat UploadZone memegang fokus keyboard, THE UploadZone SHALL membuka file dialog sistem.
11. WHEN file lolos validasi dan disimpan ke DetectionStore (Acceptance Criterion 6), THE Frontend SHALL mengubah `DetectionStore.status` menjadi `inferring` dan memicu Requirement 2 (`runInference`).
12. IF `imageElement.onerror` ter-trigger saat memuat preview (file korup atau decode gagal di browser), THEN THE Frontend SHALL menampilkan pesan inline yang mengindikasikan gambar tidak dapat dimuat, memanggil `URL.revokeObjectURL` pada `imageUrl` yang baru saja dibuat, mereset `File`, `imageUrl`, `imageDims`, dan `imageElement` di DetectionStore ke null, dan SHALL TIDAK memanggil External_Inference_API.

> **Validates Properties:** P10 (mismatch MIME ⇒ `validateFile.ok = false`).

---

### Requirement 2: Permintaan Inference ke External Inference API

**User Story:** Sebagai pengguna, saya ingin Frontend mengirim gambar saya ke layanan inference satu kali dengan threshold rendah lalu menerima daftar deteksi yang sudah divalidasi, sehingga saya bisa memfilter hasil secara lokal tanpa round-trip tambahan ke server.

*Diturunkan dari: `design.md` → Architecture; External API Contract; Sequence Diagrams → Alur 1; Algorithmic Pseudocode → Algoritma 2; Data Models → Model 2 `DetectionResponse`.*

#### Acceptance Criteria

1. WHEN `runInference` dipanggil, THE Frontend SHALL mengirim permintaan `POST /api/detect` dengan `Content-Type: multipart/form-data` ke External_Inference_API dengan timeout 60 detik per request.
2. THE Frontend SHALL menyertakan field `image` (file biner), `conf="0.05"` (Raw_Confidence), `iou=String(iouThreshold)`, dan `imgsz="1280"` di body multipart.
3. WHEN External_Inference_API mengembalikan `200 OK`, THE Frontend SHALL mem-parse body sebagai `DetectionResponse` dan memvalidasi shape sesuai `design.md` → Data Models → Model 2.
4. THE Frontend SHALL memvalidasi bahwa `payload.image.width === imageDims.width` dan `payload.image.height === imageDims.height` sebelum menerima response.
5. THE Frontend SHALL memvalidasi setiap detection sehingga `0 ≤ confidence ≤ 1`, `bbox.x ≥ 0`, `bbox.y ≥ 0`, `bbox.x + bbox.width ≤ image.width`, `bbox.y + bbox.height ≤ image.height`, `bbox.width > 0`, dan `bbox.height > 0`.
6. WHEN response lolos seluruh validasi, THE Frontend SHALL men-generate `id` UUID v4 unik untuk setiap detection sebelum menyimpannya ke `DetectionStore.rawDetections`.
7. WHEN response lolos seluruh validasi, THE Frontend SHALL menetapkan `DetectionStore.meta` dari `payload.meta`, mengubah `status` menjadi `ready`, dan menetapkan `errorMessage = null`.
8. IF response status berada di rentang `4xx` atau `5xx`, THEN THE Frontend SHALL menetapkan `status = 'error'`; jika body adalah JSON valid yang berisi field `detail` non-kosong, THE Frontend SHALL menggunakan `body.detail` (dipangkas ≤ 500 karakter) sebagai `errorMessage`; jika tidak, THE Frontend SHALL menggunakan pesan generik yang menyertakan kode status HTTP.
9. IF `fetch` rejected (network error), timeout pada AC 1 tercapai, atau response tidak dapat di-parse sebagai JSON valid, THEN THE Frontend SHALL menetapkan `status = 'error'` dan `errorMessage = "Tidak dapat menghubungi server inference. Pastikan backend berjalan di port 8000."`.
10. IF salah satu invariant validasi pada AC 4 atau AC 5 gagal, THEN THE Frontend SHALL menolak seluruh response, menetapkan `status = 'error'` dan `errorMessage = "Backend mengembalikan deteksi tidak valid (bbox di luar batas gambar)"`, dan SHALL TIDAK menulis hasil parsial ke `rawDetections`.
11. WHILE Frontend dijalankan dengan dev server Vite (`http://localhost:5173`), THE Frontend SHALL menggunakan Vite proxy `/api → http://localhost:8000` agar request ke External_Inference_API terlihat same-origin oleh browser.
12. WHEN `runInference` mulai dieksekusi (sebelum network call dikirim), THE Frontend SHALL menetapkan `DetectionStore.status = 'inferring'` dan `DetectionStore.errorMessage = null`.

> **Validates Properties:** P1 (BBox dalam batas gambar), P2 (confidence ternormalisasi), P11 (tidak ada ID duplikat).

---

### Requirement 3: Rendering Overlay Bounding Box

**User Story:** Sebagai pengguna, saya ingin melihat kotak deteksi tergambar tepat di atas gambar saya dengan label kelas dan persentase confidence, sehingga saya bisa langsung mengaitkan hasil model dengan area anatomis yang dimaksud.

*Diturunkan dari: `design.md` → UI/UX Design → Visual Design Tokens; Components → Component 2 `ResultViewer`, Component 3 `BBoxOverlay`; Algorithmic Pseudocode → Algoritma 3; Key Functions → `scaleBBoxToDisplay`.*

#### Acceptance Criteria

1. WHILE `status === 'ready'` dan `imageUrl !== null`, THE ResultViewer SHALL menampilkan `<img>` (atau bitmap canvas) dengan `object-contain` mempertahankan aspect-ratio Image_Dims tanpa cropping atau stretching, terlepas dari jumlah detection di Filtered_Detections (termasuk 0 detection).
2. WHILE ResultViewer dirender dengan `status === 'ready'`, THE BBoxOverlay SHALL menggambar tepat satu `<rect>` SVG untuk setiap detection di Filtered_Detections sehingga `jumlah <rect> === Filtered_Detections.length` (mencakup kasus 0 `<rect>` ketika Filtered_Detections kosong).
3. THE BBoxOverlay SHALL men-skala koordinat setiap bbox dari Image_Dims ke Display_Dims menggunakan `scaleX = displayDims.width / imageDims.width` dan `scaleY = displayDims.height / imageDims.height`, dengan toleransi pembulatan ≤ 1 px per koordinat.
4. THE BBoxOverlay SHALL menggambar setiap `<rect>` non-hover dengan `stroke = amber-500`, `stroke-width = 2px`, dan `fill = "none"`.
5. WHILE `detection.id === hoveredId`, THE BBoxOverlay SHALL menggambar rect terkait dengan `stroke-width = 3px` dan `stroke = amber-600`.
6. THE BBoxOverlay SHALL merender label `"{className} {round(confidence * 100)}%"` untuk setiap detection pada posisi vertikal `y - 4` ketika `y > 14`, atau `y + height + 14` ketika `y ≤ 14`, dan SHALL meng-clamp posisi horizontal label antara `0` dan `displayDims.width - labelWidth` agar label tidak terpotong oleh tepi kiri atau kanan gambar.
7. THE BBoxOverlay SHALL merender label dengan teks berwarna `white` di atas background `amber-500` untuk seluruh detection non-hover, dan SHALL menggunakan background `amber-700` ketika `detection.id === hoveredId`, sehingga rasio kontras teks-ke-background tetap ≥ 7:1 (WCAG AAA).
8. WHEN ukuran viewport berubah sehingga Display_Dims berubah (perubahan width atau height ≥ 1 px), THE BBoxOverlay SHALL me-render ulang seluruh overlay menggunakan Display_Dims yang baru dalam ≤ 1 frame (≤ 16 ms) tanpa kehilangan data deteksi mendasarnya.
9. THE BBoxOverlay SHALL TIDAK merender `<rect>` atau label untuk detection yang `confidence < confidenceThreshold`.
10. IF `imageUrl === null`, THEN THE ResultViewer SHALL menampilkan placeholder kosong dan SHALL TIDAK me-mount BBoxOverlay.
11. WHEN slider confidenceThreshold digeser, THE Frontend SHALL menyelesaikan render ulang overlay (rect + label) dalam ≤ 16 ms (P95) untuk hingga 50 detection pada viewport ≤ 1920×1080 px, agar UI mempertahankan ≥ 60 fps.
12. IF Display_Dims belum terukur (`displayDims.width === 0` atau `displayDims.height === 0`), THEN THE BBoxOverlay SHALL menunda rendering `<rect>` dan label hingga Display_Dims tervalidasi dengan kedua dimensi > 0 px.
13. WHILE `status !== 'ready'`, THE BBoxOverlay SHALL TIDAK merender `<rect>` maupun label, dan ResultViewer SHALL menampilkan state visual sesuai status (`idle`, `inferring`, atau `error`) tanpa overlay deteksi.

> **Validates Properties:** P6 (jumlah `<rect>` = `Filtered_Detections.length`), P7 (skala identitas), P8 (round-trip skala).

---

### Requirement 4: Slider Confidence dan IoU

**User Story:** Sebagai pengguna, saya ingin menggeser slider confidence untuk menyaring deteksi secara instan dan menggeser slider IoU untuk meminta inference ulang ketika dibutuhkan, sehingga saya bisa mengeksplorasi sensitivitas model tanpa menunggu round-trip pada setiap perubahan kecil.

*Diturunkan dari: `design.md` → UI/UX Design → Interaction Patterns → Slider feedback; Components → Component 4 `ControlPanel`, Component 5 `ConfidenceSlider`; Sequence Diagrams → Alur 2; Key Functions → `filterByConfidence`.*

#### Acceptance Criteria

1. THE ConfidenceSlider SHALL menerima nilai di rentang `[0, 1]` dengan `step = 0.01` dan default `0.25`.
2. WHEN pengguna menggeser ConfidenceSlider, THE Frontend SHALL meng-update `DetectionStore.confidenceThreshold` dalam ≤ 50 ms setelah event input dan menampilkan nilai numerik dengan presisi 2 desimal di samping label.
3. WHEN `confidenceThreshold` berubah, THE Frontend SHALL menghitung Filtered_Detections sebagai `rawDetections.filter(d => d.confidence >= confidenceThreshold)` dan SHALL TIDAK memanggil External_Inference_API.
4. THE filterByConfidence SHALL stabil terhadap urutan input (urutan relatif elemen yang lolos sama dengan urutannya di input).
5. IF `confidenceThreshold === 0`, THEN THE filterByConfidence SHALL mengembalikan list dengan panjang dan urutan identik dengan `rawDetections`.
6. THE IoUSlider SHALL menerima nilai di rentang `[0, 1]` dengan `step = 0.01` dan default `0.5`.
7. WHEN pengguna menggeser IoUSlider, THE Frontend SHALL menerapkan debounce 250 ms — hanya nilai terakhir dalam jendela 250 ms yang di-commit ke `DetectionStore.iouThreshold`.
8. IF `|iouThreshold - last_inferred_iou| > 0.05`, THEN THE ControlPanel SHALL menampilkan tooltip "Click \"Re-run inference\" to apply" dan tombol "Re-run inference" dalam keadaan enabled.
9. WHEN pengguna mengklik tombol "Re-run inference", THE Frontend SHALL memanggil `runInference()` dengan `iouThreshold` saat ini, dan SHALL memperbarui `last_inferred_iou` setelah response sukses.
10. WHILE `status === 'inferring'`, THE ConfidenceSlider dan IoUSlider SHALL tetap interaktif (memungkinkan pengguna menggeser sebelum hasil tiba).
11. WHILE `status === 'idle'`, THE ConfidenceSlider, IoUSlider, dan tombol "Re-run inference" SHALL ditampilkan dalam state visual disabled dan SHALL TIDAK merespons input pengguna.
12. IF `runInference()` yang dipicu klik tombol "Re-run inference" gagal (Requirement 2 mengembalikan `status = 'error'`), THEN THE ControlPanel SHALL mempertahankan tooltip "Click \"Re-run inference\" to apply", SHALL TIDAK memperbarui `last_inferred_iou`, dan tombol "Re-run inference" SHALL tetap enabled untuk memungkinkan retry.

> **Validates Properties:** P3 (filter monoton terhadap threshold), P4 (idempoten pada threshold = 0), P5 (filter stabil), P12 (filter tidak membuat deteksi baru).

---

### Requirement 5: Sidebar Daftar Deteksi

**User Story:** Sebagai pengguna, saya ingin melihat daftar deteksi terurut berdasarkan confidence dan dapat menyorot kotak terkait dari sidebar (atau sebaliknya), sehingga saya bisa memeriksa hasil model secara sistematis.

*Diturunkan dari: `design.md` → UI/UX Design → Interaction Patterns → Hover synchronization; Components → Component 6 `DetectionList`.*

#### Acceptance Criteria

1. THE DetectionList SHALL menampilkan setiap detection di Filtered_Detections sebagai satu baris yang berisi nomor urut (integer mulai dari 1, increment +1 per baris berikutnya), `className`, persentase confidence dihitung sebagai `round(confidence * 100)` diikuti karakter `%`, dan dimensi bbox dalam format `{width} × {height}` dengan kedua nilai berupa integer dalam satuan piksel.
2. THE DetectionList SHALL mengurutkan baris secara descending berdasarkan `confidence`, dan IF dua atau lebih deteksi memiliki nilai `confidence` identik (selisih < 0.0001), THEN THE DetectionList SHALL menggunakan `detection.id` ascending sebagai tie-breaker sehingga urutan baris bersifat deterministik.
3. THE DetectionList SHALL menerapkan `font-variant-numeric: tabular-nums` pada kolom persentase confidence agar digit ter-align secara vertikal antar baris.
4. WHEN pointer hover masuk ke baris di DetectionList, THE Frontend SHALL menetapkan `DetectionStore.hoveredId = detection.id` baris tersebut dalam ≤ 100 ms sejak event `mouseenter`.
5. WHEN pointer hover keluar dari baris di DetectionList, THE Frontend SHALL menetapkan `DetectionStore.hoveredId = null` dalam ≤ 100 ms sejak event `mouseleave`.
6. WHEN pointer hover masuk ke `<rect>` di BBoxOverlay, THE Frontend SHALL menetapkan `DetectionStore.hoveredId = detection.id` rect tersebut dalam ≤ 100 ms sejak event `mouseenter`.
7. WHEN pointer hover keluar dari `<rect>` di BBoxOverlay, THE Frontend SHALL menetapkan `DetectionStore.hoveredId = null` dalam ≤ 100 ms sejak event `mouseleave`.
8. IF `DetectionStore.hoveredId === detection.id`, THEN THE DetectionList SHALL menerapkan background `bg-amber-50` pada baris terkait, dan IF `DetectionStore.hoveredId !== detection.id`, THEN THE DetectionList SHALL mempertahankan background default baris (tanpa kelas `bg-amber-50`).
9. WHEN inference selesai (`status` bukan `'idle'` dan bukan `'inferring'`) dan `Filtered_Detections.length === 0` (baik karena threshold terlalu tinggi maupun backend mengembalikan list kosong), THE DetectionList SHALL menampilkan empty state berisi teks persis "Tidak ada batu ginjal terdeteksi pada threshold saat ini." disertai baris saran tekstual yang mengarahkan pengguna untuk menurunkan slider threshold.
10. WHILE `status === 'inferring'`, THE DetectionList SHALL menampilkan tepat 3 baris skeleton dengan kelas `bg-slate-200 animate-pulse` (tidak menampilkan baris detection nyata maupun empty state).
11. WHILE `status === 'idle'`, THE DetectionList SHALL menampilkan placeholder berisi teks persis "Upload an image to start" (tidak menampilkan baris skeleton maupun empty state).
12. THE DetectionList SHALL me-render setiap baris dengan atribut `aria-label="Detection {n}, {className}, {percent} percent confidence"` di mana `{n}` adalah nomor urut baris sesuai kriterion 1, `{className}` adalah string `className` deteksi, dan `{percent}` adalah hasil `round(confidence * 100)` tanpa karakter `%`.

---

### Requirement 6: Unduh Gambar Teranotasi

**User Story:** Sebagai pengguna, saya ingin mengunduh PNG yang menyimpan deteksi yang sedang saya lihat dengan dimensi sama persis seperti gambar asli, sehingga saya bisa membagikan atau mengarsipkan hasil tanpa kehilangan resolusi.

*Diturunkan dari: `design.md` → UI/UX Design → Interaction Patterns → Download button affordance; Components → Component 7 `DownloadButton`; Sequence Diagrams → Alur 3; Algorithmic Pseudocode → Algoritma 4; Error Handling → Skenario 6.*

#### Acceptance Criteria

1. WHEN pengguna mengklik DownloadButton dan terdapat ≥ 1 detection di Filtered_Detections dan `imageElement.complete === true`, THE Frontend SHALL membuat `OffscreenCanvas` (atau `HTMLCanvasElement` fallback) dengan dimensi tepat `Image_Dims.width × Image_Dims.height`.
2. WHEN canvas dibuat (AC 1), THE Frontend SHALL menggambar `imageElement` ke offscreen canvas pada koordinat `(0, 0)` dengan ukuran `Image_Dims`.
3. WHEN gambar asli telah digambar ke canvas (AC 2), THE Frontend SHALL menggambar `<rect>` dan label untuk setiap detection di Filtered_Detections menggunakan koordinat piksel asli (tanpa scaling viewport).
4. WHILE Frontend menggambar `<rect>` ke canvas (AC 3), THE Frontend SHALL menggunakan `lineWidth = max(2, imageDims.width / 500)` agar ketebalan kotak proporsional dengan resolusi gambar.
5. WHEN seluruh detection telah digambar (AC 3 selesai), THE Frontend SHALL meng-export hasil sebagai `Blob` bertipe `"image/png"` melalui `convertToBlob` (`OffscreenCanvas`) atau `toBlob` (`HTMLCanvasElement`), menyelesaikan langkah ini dalam ≤ 5 detik.
6. WHEN Blob berhasil dihasilkan (AC 5), THE Frontend SHALL men-trigger unduhan dengan nama file `kidney-stone-result.png` melalui anchor `<a download>` programatik dalam ≤ 1 detik.
7. IF `Filtered_Detections.length === 0` ATAU `imageElement === null` ATAU `imageElement.complete === false`, THEN THE DownloadButton SHALL berada dalam state disabled dengan tooltip yang menjelaskan kondisi (mis. "No detections to download" atau "Upload an image first").
8. IF `typeof OffscreenCanvas === 'undefined'`, THEN THE Frontend SHALL menggunakan `HTMLCanvasElement` reguler dengan `canvas.toBlob` sebagai fallback tanpa menampilkan pesan, dialog, prompt, atau perubahan UI apa pun kepada pengguna.
9. WHEN unduhan berhasil di-trigger (AC 6 selesai), THE Frontend SHALL menampilkan toast berisi teks persis "Saved kidney-stone-result.png" yang menghilang otomatis setelah 3 detik (toleransi ±0.5 detik).
10. THE Blob hasil SHALL berukuran > 0 byte dan memiliki MIME type `"image/png"`.
11. THE Frontend SHALL menggunakan nama file hard-coded `kidney-stone-result.png` (bukan input pengguna atau response server) untuk menghindari path traversal.
12. IF generasi canvas atau export Blob gagal (exception, timeout > 10 detik, atau Blob `null`/`size === 0`), THEN THE Frontend SHALL menampilkan toast error yang mengindikasikan kegagalan unduhan, mempertahankan state DetectionStore tanpa modifikasi (tidak mengubah `rawDetections`, `confidenceThreshold`, atau `status`), dan SHALL membiarkan DownloadButton tetap enabled untuk memungkinkan retry.
13. WHILE pipeline unduhan sedang berjalan (antara klik tombol dan trigger unduhan AC 6), THE DownloadButton SHALL berada dalam state disabled untuk mencegah klik ganda yang memicu pipeline paralel.

> **Validates Properties:** P9 (gambar hasil berdimensi sama dengan Image_Dims).

---

### Requirement 7: State UI (Empty / Loading / Ready / Error / No-Detection)

**User Story:** Sebagai pengguna, saya ingin setiap state aplikasi terbaca jelas dari satu pandangan, sehingga saya selalu tahu apa yang sedang terjadi dan apa langkah berikutnya.

*Diturunkan dari: `design.md` → UI/UX Design → UI States (1–5).*

#### Acceptance Criteria

1. WHILE `status === 'idle'`, THE Workspace SHALL menampilkan UploadZone yang mengisi ≥ 60% area konten utama dengan border dashed, dan ControlPanel SHALL menerapkan atribut `disabled` atau `aria-disabled="true"` pada seluruh kontrol interaktif (slider, tombol).
2. WHILE `status === 'inferring'`, THE ResultViewer SHALL menampilkan preview gambar dengan overlay opasitas 50% dan satu spinner di tengah area gambar, serta caption satu baris berisi teks persis "Running detection…" berwarna `text-sky-600` di bawah gambar.
3. WHEN `status === 'ready'`, THE ResultViewer SHALL menampilkan gambar bersama BBoxOverlay aktif (sesuai Requirement 3).
4. WHEN `status === 'ready'`, THE ControlPanel SHALL menonaktifkan atribut `disabled`/`aria-disabled` pada seluruh kontrol interaktif sehingga slider, tombol "Re-run inference", dan DownloadButton dapat dioperasikan (kecuali DownloadButton tetap mengikuti Requirement 6 AC 7).
5. WHEN `status === 'ready'`, THE Frontend SHALL menampilkan footer kecil di bawah gambar berisi `"Inference: {meta.inference_ms}ms · {meta.model_imgsz}px · {Filtered_Detections.length} detections at conf ≥ {confidenceThreshold}"`.
6. WHEN `status === 'error'`, THE Frontend SHALL menampilkan banner di atas canvas dengan `role="alert"`, `aria-live="assertive"`, dan teks `errorMessage`.
7. IF `status === 'error'` disebabkan oleh kondisi network error (request gagal terkirim, timeout > 30 detik, atau HTTP status ≥ 500), THEN THE Frontend SHALL menampilkan tombol "Coba lagi" di samping pesan yang memanggil `runInference()` tanpa mengharuskan pengguna memilih file ulang.
8. WHEN `status === 'ready'` dan `Filtered_Detections.length === 0`, THE ResultViewer SHALL menampilkan gambar tanpa elemen `<rect>` apa pun, THE DetectionList SHALL menampilkan empty state berisi teks "🔍 No stones detected at confidence ≥ {confidenceThreshold}. Try lowering the slider.", dan THE DownloadButton SHALL menerapkan atribut `disabled`.
9. WHEN status berubah dari `error` kembali ke `inferring`, THE Frontend SHALL menyembunyikan banner error dalam ≤ 100 ms dan tetap mempertahankan `imageUrl` serta `imageElement` di DetectionStore.
10. WHEN status bertransisi dari satu nilai ke nilai lain, THE Frontend SHALL membersihkan elemen UI khusus state lama (banner error, skeleton, spinner, overlay opasitas) dalam ≤ 100 ms sebelum menampilkan elemen UI state baru.

---

### Requirement 8: Aksesibilitas (WCAG 2.1 AA)

**User Story:** Sebagai pengguna yang mengandalkan keyboard atau teknologi bantu, saya ingin seluruh fungsi aplikasi dapat diakses tanpa mouse dan dengan label yang dapat dibaca screen reader, sehingga aplikasi memenuhi standar WCAG 2.1 AA.

*Diturunkan dari: `design.md` → UI/UX Design → Accessibility (WCAG 2.1 AA target).*

#### Acceptance Criteria

1. THE Frontend SHALL mendefinisikan tab order: Header → UploadZone (saat empty) atau gambar (saat ready) → ConfidenceSlider → IoUSlider → tombol "Re-run inference" → DetectionList (item-by-item) → DownloadButton.
2. THE UploadZone SHALL memiliki `role="button"` dan `tabIndex={0}` dan SHALL membuka file dialog ketika tombol `Enter` atau `Space` ditekan saat fokus.
3. THE ConfidenceSlider dan IoUSlider SHALL menggunakan elemen native `<input type="range">` dengan atribut `min="0"` dan `max="1"`, sehingga mendukung Arrow keys (Left/Right/Up/Down) dengan `step = 0.01`, `Home` ke `0`, dan `End` ke `1`.
4. THE Frontend SHALL menggunakan struktur landmark: `<main role="main">` untuk Workspace dan `<aside aria-label="Detection controls">` untuk ControlPanel.
5. THE banner error SHALL menggunakan `role="alert"` dan `aria-live="assertive"`, dan WHILE `status !== 'error'`, THE Frontend SHALL TIDAK me-mount banner error di DOM.
6. THE DetectionList SHALL menggunakan `<ul role="list">` dengan setiap item `<li role="listitem">` yang memiliki `aria-label="Detection {n}, {className}, {percent} percent confidence"`; WHEN `Filtered_Detections.length === 0`, THE DetectionList SHALL me-render kontainer `<ul>` kosong (atau menggantinya dengan elemen `<p>` empty state) dengan `aria-label="No detections"`.
7. THE BBoxOverlay SHALL menggunakan `<svg role="img" aria-label="Detection overlay with {N} bounding boxes">` di mana `N = Filtered_Detections.length`; WHEN `N === 0`, `aria-label` SHALL menjadi "No detection overlay".
8. WHERE elemen interaktif menerima fokus, THE Frontend SHALL menerapkan `focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2` dan SHALL TIDAK menghapus default outline tanpa pengganti.
9. THE Frontend SHALL menjamin rasio kontras teks utama (`slate-900` di `slate-50`) ≥ 4.5:1 untuk teks normal dan ≥ 3:1 untuk teks besar.
10. WHERE label bbox dirender di atas background `amber-500`, THE BBoxOverlay SHALL menggunakan `font-weight ≥ 600` dengan ukuran font ≥ 14 px, atau menggunakan background `amber-700` agar lulus kontras AA untuk teks normal.
11. WHERE pengguna memiliki `prefers-reduced-motion: reduce`, THE Frontend SHALL menonaktifkan `animate-pulse` skeleton dan transisi slider, menggantinya dengan state statis.
12. THE Frontend SHALL menetapkan atribut `lang="id"` (atau `lang="en"` jika konten utama berbahasa Inggris) pada elemen `<html>` agar screen reader menggunakan profil pelafalan yang tepat.
13. THE Frontend SHALL menyediakan skip link sebagai elemen pertama yang dapat fokus dengan teks "Skip to main content" yang melompat ke Workspace, dan WHILE skip link tidak fokus, THE skip link SHALL secara visual tersembunyi tanpa menghilangkan dari focus order.

---

### Requirement 9: Layout Responsif

**User Story:** Sebagai pengguna, saya ingin aplikasi tetap dapat digunakan di layar mobile maupun desktop, sehingga saya bisa memeriksa hasil inferensi dari perangkat apa pun tanpa kehilangan akurasi visual.

*Diturunkan dari: `design.md` → UI/UX Design → Responsive Behavior; Wireframe Layout.*

#### Acceptance Criteria

1. WHILE viewport width `< 768px` (di bawah breakpoint Tailwind `md`), THE Workspace SHALL menampilkan layout vertikal stack: Header → ResultViewer/UploadZone (full width) → ControlPanel di bawahnya.
2. WHILE viewport width `>= 768px` AND `< 1280px`, THE Workspace SHALL menggunakan grid dua kolom `grid-cols-[1fr_320px]` dengan ResultViewer/UploadZone di kolom kiri dan ControlPanel di kolom kanan dengan lebar tetap 320 px.
3. WHILE viewport width `>= 1280px` (breakpoint `xl`), THE Workspace SHALL menggunakan grid dua kolom dengan ControlPanel selebar 360 px.
4. WHILE viewport width `>= 1280px`, THE Frontend SHALL menerapkan font heading ≥ 4 px lebih besar dibandingkan ukuran font heading saat viewport `< 1280px`.
5. WHILE viewport width `< 768px`, THE DetectionList SHALL collapse menjadi `<details>` (collapsed secara default) dengan summary "{N} detections" yang dapat di-expand pengguna melalui klik atau tombol Enter/Space saat fokus keyboard.
6. THE ResultViewer SHALL mempertahankan aspect-ratio gambar asli dengan `object-contain` dan SHALL TIDAK pernah crop atau stretch gambar.
7. WHILE viewport width `< 768px`, THE ResultViewer SHALL menetapkan lebar gambar mengisi lebar viewport dengan tinggi auto.
8. WHEN viewport di-resize sehingga Display_Dims berubah, THE BBoxOverlay SHALL me-render ulang dengan Display_Dims yang baru dalam ≤ 200 ms sehingga setiap `<rect>` selaras dengan piksel gambar yang sedang ditampilkan dengan deviasi ≤ 1 px per koordinat.
9. WHEN viewport di-resize melewati breakpoint 768px atau 1280px, THE Frontend SHALL mempertahankan state aplikasi (rawDetections, confidenceThreshold, iouThreshold, hoveredId, status) tanpa kehilangan data atau memanggil ulang External_Inference_API.

---

### Requirement 10: Penanganan Error

**User Story:** Sebagai pengguna, saya ingin setiap mode kegagalan ditangani dengan pesan yang spesifik dan jalur pemulihan yang jelas, sehingga saya tidak terjebak di state mati ketika sesuatu salah.

*Diturunkan dari: `design.md` → Error Handling (Skenario 1–6); Algorithmic Pseudocode → Algoritma 1, 2.*

#### Acceptance Criteria

1. IF file gagal validasi MIME atau ukuran (Requirement 1.4 / 1.5), THEN THE UploadZone SHALL menampilkan pesan inline tanpa mengubah `DetectionStore` selain menetapkan `errorMessage`, dan SHALL TIDAK mengirim request ke External_Inference_API.
2. IF `fetch` rejected atau response `status === 0`, THEN THE Frontend SHALL menetapkan `status = 'error'` dengan pesan generik "Tidak dapat menghubungi server inference. Pastikan backend berjalan di port 8000." dan menampilkan tombol "Coba lagi".
3. IF response status berada di rentang `4xx` atau `5xx` dengan body JSON yang berisi field `detail`, THEN THE Frontend SHALL menampilkan `body.detail` (dipangkas ≤ 500 karakter) di banner error untuk mencegah overflow UI.
4. IF response body tidak dapat di-parse sebagai JSON valid atau melanggar shape `DetectionResponse` (termasuk kasus bbox di luar batas gambar), THEN THE Frontend SHALL menetapkan `errorMessage` ke pesan yang konsisten dengan trigger dan SHALL TIDAK menulis hasil parsial ke `DetectionStore.rawDetections`.
5. IF `payload.image.width !== imageDims.width` atau `payload.image.height !== imageDims.height`, THEN THE Frontend SHALL menolak response, menetapkan `errorMessage` yang menjelaskan ketidaksesuaian dimensi, dan SHALL TIDAK menulis hasil parsial ke `DetectionStore.rawDetections`.
6. WHEN `payload.detections.length === 0`, THE Frontend SHALL menetapkan `status = 'ready'`, `rawDetections = []`, dan `errorMessage = null`, menampilkan empty state di DetectionList yang mengindikasikan "no kidney stones detected", dan SHALL TIDAK menampilkan banner error.
7. WHEN `Filtered_Detections.length === 0` karena threshold tinggi tetapi `rawDetections.length > 0`, THE Frontend SHALL menampilkan banner saran non-error yang secara eksplisit menyebut nama slider yang perlu diturunkan (ConfidenceSlider) dan SHALL TIDAK memanggil External_Inference_API.
8. WHEN pengguna mengklik "Coba lagi" pada error network, THE Frontend SHALL memanggil `runInference()` ulang menggunakan `File`, `iouThreshold`, dan `imgsz` saat ini tanpa meminta upload ulang, hingga maksimum 5 percobaan beruntun; setelah percobaan ke-5 gagal, THE Frontend SHALL menonaktifkan tombol "Coba lagi" dan meminta pengguna memuat ulang halaman atau memilih file lain.
9. THE Frontend SHALL me-render `errorMessage` melalui text node JSX (bukan `dangerouslySetInnerHTML`) untuk mencegah XSS dari konten `detail` yang tidak terpercaya.
10. THE Frontend SHALL TIDAK menyimpan `File`, `imageUrl`, atau `rawDetections` ke `localStorage` atau `sessionStorage`.
11. WHEN halaman di-refresh, THE Frontend SHALL melakukan reset penuh `DetectionStore` ke nilai default initial.
12. IF request inference berlangsung > 60 detik tanpa response, THEN THE Frontend SHALL membatalkan request menggunakan `AbortController`, menetapkan `status = 'error'` dengan pesan yang mengindikasikan timeout, dan menampilkan tombol "Coba lagi" sesuai AC 8.

> **Validates Properties:** P1 (validasi bbox dalam batas gambar — basis untuk error pada Skenario 5).
