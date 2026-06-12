import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from './lib/apiBaseUrl';

// --- Types & Interfaces ---

interface BBox {
  x: number;      // pixels, top-left x
  y: number;      // pixels, top-left y
  width: number;  // pixels
  height: number; // pixels
}

interface Detection {
  id: string; // generated client-side
  classId: number;
  className: string;
  confidence: number;
  bbox: BBox;
}

interface DetectionResponse {
  detections: Array<{
    class_id: number;
    class_name: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
  image: {
    width: number;
    height: number;
  };
  meta: {
    inference_ms: number;
    model_imgsz: number;
    conf_threshold: number;
    iou_threshold: number;
  };
}

// --- Configuration Constants ---
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/bmp", "image/tiff"];

export default function App() {
  // --- State Variables ---
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  
  const [rawDetections, setRawDetections] = useState<Detection[]>([]);
  const [meta, setMeta] = useState<DetectionResponse['meta'] | null>(null);
  
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.25);
  const [iouThreshold, setIouThreshold] = useState<number>(0.5);
  const [boxOpacity, setBoxOpacity] = useState<number>(0.8);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  const [status, setStatus] = useState<'idle' | 'uploading' | 'inferring' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  
  // Display dimensions ref & state for SVG overlay scaling
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayDims, setDisplayDims] = useState<{ width: number; height: number } | null>(null);

  // --- Helper: Recalculate Display Dimensions ---
  const updateDisplayDims = useCallback(() => {
    if (containerRef.current) {
      setDisplayDims({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, []);

  // Listen to resize events and element loading
  useEffect(() => {
    if (!imageUrl) {
      setDisplayDims(null);
      return;
    }
    updateDisplayDims();
    window.addEventListener('resize', updateDisplayDims);
    return () => window.removeEventListener('resize', updateDisplayDims);
  }, [imageUrl, updateDisplayDims]);

  // Clean up object URL when image changes to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  // --- Core Logic: Run Inference ---
  const runInference = useCallback(async (selectedFile: File, dims: { width: number; height: number }) => {
    setStatus('inferring');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("conf", "0.05"); // Send low threshold to allow interactive local filtering
    formData.append("iou", String(iouThreshold));
    formData.append("imgsz", "1280");

    try {
      const response = await fetch(`${API_BASE_URL}/api/detect`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errMsg = "Inference failed";
        try {
          const body = await response.json();
          errMsg = body.detail || errMsg;
        } catch {
          errMsg = `Inference failed with status ${response.status}`;
        }
        throw new Error(errMsg);
      }

      const payload: DetectionResponse = await response.json();

      // Validate dimensions consistency
      if (payload.image.width !== dims.width || payload.image.height !== dims.height) {
        console.warn("Backend dimension mismatch. Using natural dimensions.", payload.image, dims);
      }

      // Map response detections and generate a client ID
      const detections: Detection[] = payload.detections.map((d) => {
        // Enforce safety constraints
        const x = Math.max(0, d.bbox.x);
        const y = Math.max(0, d.bbox.y);
        const w = Math.min(d.bbox.width, dims.width - x);
        const h = Math.min(d.bbox.height, dims.height - y);

        return {
          id: crypto.randomUUID(),
          classId: d.class_id,
          className: d.class_name,
          confidence: d.confidence,
          bbox: { x, y, width: w, height: h },
        };
      });

      setRawDetections(detections);
      setMeta(payload.meta);
      setStatus('ready');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Cannot connect to inference server. Ensure backend is running.");
      setStatus('error');
    }
  }, [iouThreshold]);

  // --- Core Logic: Handle File Selection ---
  const handleFile = useCallback(async (selectedFile: File) => {
    // 1. Validate File Size
    if (selectedFile.size > MAX_SIZE_BYTES) {
      setErrorMessage("File too large. Maximum size is 20MB.");
      setStatus('error');
      return;
    }

    // 2. Validate MIME Type
    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
      setErrorMessage("Unsupported file type. Use PNG, JPEG, BMP, or TIFF.");
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setErrorMessage(null);
    setRawDetections([]);
    setMeta(null);

    // Revoke old object URL
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    const url = URL.createObjectURL(selectedFile);
    setImageUrl(url);
    setFile(selectedFile);

    // Create Image element to determine natural dimensions
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      setImageDims(dims);
      setImageElement(img);
      
      // Trigger API call
      runInference(selectedFile, dims);
    };
    img.onerror = () => {
      setErrorMessage("Failed to decode and load the image file.");
      setStatus('error');
    };
  }, [imageUrl, runInference]);

  // --- Drag & Drop Handlers ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // --- Trigger File Browser ---
  const onFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // --- Retry Action ---
  const handleRetry = () => {
    if (file && imageDims) {
      runInference(file, imageDims);
    }
  };

  // --- Reset App State ---
  const handleReset = () => {
    setFile(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageDims(null);
    setImageElement(null);
    setRawDetections([]);
    setMeta(null);
    setStatus('idle');
    setErrorMessage(null);
  };

  // --- Download Action ---
  const handleDownload = async () => {
    if (!imageElement || !imageDims || filteredDetections.length === 0) return;
    
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imageDims.width;
      canvas.height = imageDims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create 2D context for image download');

      // Draw original image
      ctx.drawImage(imageElement, 0, 0, imageDims.width, imageDims.height);

      // Draw active bounding boxes scaled to the original resolution
      const scale = Math.max(2, imageDims.width / 500);
      ctx.lineWidth = scale;
      ctx.strokeStyle = '#008376'; // Primary Container Teal from stitch.md
      ctx.font = `bold ${Math.round(imageDims.width / 60)}px sans-serif`;
      ctx.globalAlpha = boxOpacity;

      filteredDetections.forEach((d) => {
        ctx.strokeRect(d.bbox.x, d.bbox.y, d.bbox.width, d.bbox.height);

        const text = `${d.className} ${Math.round(d.confidence * 100)}%`;
        const textMetrics = ctx.measureText(text);
        const pad = 6;
        const fontSize = Math.round(imageDims.width / 60);
        const labelHeight = fontSize + 8;

        // Draw label background
        ctx.fillStyle = '#008376';
        ctx.fillRect(
          d.bbox.x,
          Math.max(0, d.bbox.y - labelHeight),
          textMetrics.width + 2 * pad,
          labelHeight
        );

        // Draw label text
        ctx.fillStyle = '#f4fffb'; // on-primary-container
        ctx.fillText(
          text,
          d.bbox.x + pad,
          Math.max(labelHeight - 6, d.bbox.y - 6)
        );
      });

      ctx.globalAlpha = 1.0;


      // Export and trigger download
      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Failed to generate PNG blob');
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `kidney-stone-detection-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }, 'image/png');
    } catch (err) {
      console.error(err);
      alert("Failed to download annotated image.");
    } finally {
      setDownloading(false);
    }
  };

  // --- Filtered Detections ---
  const filteredDetections = rawDetections.filter(d => d.confidence >= confidenceThreshold);

  // Check if current IoU differs from what was used in the last API call
  const iouChanged = meta !== null && Math.abs(iouThreshold - meta.iou_threshold) > 0.01;

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-title-area">
          <h1 className="header-title">Kidney Stone Detection Yolo</h1>
          <span className="header-badge header-badge-pill">
            <span style={{ marginRight: '6px' }}></span> Yolo v12m
          </span>
        </div>
        <div className="header-meta">
          v1.2.4-stable
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="main-layout" role="main">
        
        {/* LEFT WORKSPACE: Image Display & Overlays */}
        <section className="workspace-container" aria-label="Visual Workspace">
          <div className="workspace-header">
            <div className="workspace-header-title">
              <span style={{ marginRight: '8px' }}></span> CT Scan Analysis
            </div>
            <div className="workspace-status">
              <span className="status-dot pulsing"></span> Model Active
            </div>
          </div>

          {errorMessage && (
            <div className="alert-banner alert-error" role="alert" aria-live="assertive">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="alert-message">
                <strong>Error:</strong> {errorMessage}{' '}
                {file && (
                  <button className="alert-retry-btn" onClick={handleRetry}>
                    Try Again
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="workspace-content viewport-dark">
            {status === 'idle' && !imageUrl && (
              <div 
                className={`upload-zone dark-zone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    document.getElementById('file-input')?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Upload CT Image. Drag and drop here or click to browse."
              >
                <input 
                  type="file" 
                  id="file-input" 
                  style={{ display: 'none' }} 
                  accept=".png,.jpg,.jpeg,.bmp,.tiff" 
                  onChange={onFileSelectChange}
                />
                <div className="upload-icon-container">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h3 className="upload-title">Drag & drop a CT image here</h3>
                <p className="upload-subtitle">or click to browse · PNG, JPEG, BMP, TIFF · max 20 MB</p>
              </div>
            )}

            {imageUrl && (
              <div 
                className="viewer-container" 
                ref={containerRef}
                style={imageDims ? { aspectRatio: `${imageDims.width} / ${imageDims.height}` } : undefined}
              >
                <img 
                  src={imageUrl} 
                  alt="Inferred scan" 
                  className="viewer-image"
                  onLoad={updateDisplayDims}
                />
                
                {/* SVG Overlay representing Bounding Boxes */}
                {imageDims && displayDims && (
                  <svg 
                    className="overlay-svg" 
                    viewBox={`0 0 ${displayDims.width} ${displayDims.height}`}
                    role="img"
                    aria-label={`Inference overlay. ${filteredDetections.length} bounding boxes.`}
                  >
                    {filteredDetections.map((d) => {
                      // Scale bounding box coordinates from original pixels to actual displayed screen pixels
                      const scaleX = displayDims.width / imageDims.width;
                      const scaleY = displayDims.height / imageDims.height;

                      const rx = d.bbox.x * scaleX;
                      const ry = d.bbox.y * scaleY;
                      const rw = d.bbox.width * scaleX;
                      const rh = d.bbox.height * scaleY;

                      const isHighlighted = hoveredId === d.id;
                      const confPercentage = `${Math.round(d.confidence * 100)}%`;

                      // Placement coordinates for text label
                      const labelHeight = 16;
                      const labelY = ry > labelHeight + 4 ? ry - 2 : ry + rh + labelHeight;

                      return (
                        <g 
                          key={d.id}
                          onMouseEnter={() => setHoveredId(d.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          style={{ opacity: boxOpacity }}
                        >
                          {/* Box Outline */}
                          <rect 
                            x={rx} 
                            y={ry} 
                            width={rw} 
                            height={rh} 
                            className={`bbox-rect ${isHighlighted ? 'highlighted' : ''}`}
                          />
                          {/* Label Background */}
                          <rect 
                            x={rx}
                            y={labelY - labelHeight}
                            width={54 + (d.className.length * 4)}
                            height={labelHeight}
                            className="bbox-label-bg"
                          />
                          {/* Label Text */}
                          <text 
                            x={rx + 4} 
                            y={labelY - 4} 
                            className="bbox-label-text"
                          >
                            {d.className} {confPercentage}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* Loading state overlays */}
                {(status === 'uploading' || status === 'inferring') && (
                  <div className="loading-overlay">
                    <div className="spinner"></div>
                    <span className="loading-text">
                      {status === 'uploading' ? 'Uploading Image...' : 'AI Model Inferring...'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="workspace-footer-center">
            {imageUrl ? (
              <span>Patient ID: LITH-8943-A | Scan Time: 14:32:05 | Slice: 42/128</span>
            ) : (
              <span>Patient ID: N/A | Scan Time: N/A | Slice: --/--</span>
            )}
          </div>
        </section>

        {/* RIGHT CONTROLS: Sliders & Detection Lists */}
        <aside className="sidebar-layout-transparent" aria-label="Detection Controls">
          
          {/* Card 1: Inference Parameters */}
          <div className="control-card">
            <h3 className="card-title">Inference Parameters</h3>
            
            <div className="card-content-sections">
              {/* Confidence Slider */}
              <div className="control-group">
                <div className="control-header">
                  <label htmlFor="conf-slider" className="control-label-uppercase">CONFIDENCE THRESHOLD</label>
                  <span className="control-value-bold">{confidenceThreshold.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  id="conf-slider" 
                  className="slider-input" 
                  min="0.0" 
                  max="1.0" 
                  step="0.01" 
                  value={confidenceThreshold}
                  disabled={status === 'uploading' || status === 'inferring' || !imageUrl}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                />
              </div>

              {/* IoU Slider */}
              <div className="control-group">
                <div className="control-header">
                  <label htmlFor="iou-slider" className="control-label-uppercase">IOU THRESHOLD</label>
                  <span className="control-value-bold">{iouThreshold.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  id="iou-slider" 
                  className="slider-input" 
                  min="0.0" 
                  max="1.0" 
                  step="0.01" 
                  value={iouThreshold}
                  disabled={status === 'uploading' || status === 'inferring' || !imageUrl}
                  onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
                />
              </div>

              {/* Box Opacity Slider */}
              <div className="control-group">
                <div className="control-header">
                  <label htmlFor="opacity-slider" className="control-label-uppercase">BOX OPACITY</label>
                  <span className="control-value-bold">{boxOpacity.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  id="opacity-slider" 
                  className="slider-input" 
                  min="0.0" 
                  max="1.0" 
                  step="0.05" 
                  value={boxOpacity}
                  disabled={status === 'uploading' || status === 'inferring' || !imageUrl}
                  onChange={(e) => setBoxOpacity(parseFloat(e.target.value))}
                />
              </div>

              {/* Re-run Button */}
              <button 
                className={`btn btn-secondary btn-rerun ${iouChanged ? 'pulse-border' : ''}`}
                onClick={handleRetry}
                disabled={status === 'uploading' || status === 'inferring' || !imageUrl}
              >
                <span style={{ marginRight: '6px' }}></span> Re-run Inference
              </button>
            </div>
          </div>

          {/* Card 2: Detections */}
          <div className="control-card flex-grow-card">
            <div className="card-header-badge">
              <h3 className="card-title">Detections</h3>
              <span className={`badge-found ${filteredDetections.length > 0 ? 'found-active' : ''}`}>
                {filteredDetections.length > 0 ? `${filteredDetections.length} Found` : '0 Found'}
              </span>
            </div>

            <div className="detections-card-list">
              {(status === 'uploading' || status === 'inferring') ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="skeleton-pulse"></div>
                  <div className="skeleton-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="skeleton-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              ) : filteredDetections.length > 0 ? (
                <div className="new-detections-list" role="list">
                  {filteredDetections.map((d, index) => {
                    const isHighlighted = hoveredId === d.id;
                    return (
                      <div 
                        key={d.id}
                        role="listitem"
                        className={`new-detection-item ${isHighlighted ? 'highlighted' : ''}`}
                        onMouseEnter={() => setHoveredId(d.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div className="detection-target-icon">
                          <span className="target-dot-outer">
                            <span className="target-dot-inner"></span>
                          </span>
                        </div>
                        <div className="detection-info">
                          <div className="det-name-bold">{d.className} #{index + 1}</div>
                          <div className="det-metadata-slice">Slice 42</div>
                        </div>
                        <div className="detection-percentage">
                          <div className="det-percentage-value">{(d.confidence * 100).toFixed(1)}%</div>
                          <div className="det-percentage-label">Conf</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="detections-empty-new">
                  {imageUrl ? (
                    <span>No stones detected at current confidence limit.</span>
                  ) : (
                    <span>Upload a CT image to analyze detections</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons-bottom">
            <button 
              className="btn btn-gold-large" 
              onClick={handleDownload}
              disabled={!imageUrl || filteredDetections.length === 0 || downloading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? 'Generating Report...' : 'Download PNG Report'}
            </button>

            {imageUrl && (
              <button className="btn btn-ghost-clear" onClick={handleReset}>
                Clear Current Scan
              </button>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

