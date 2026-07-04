import { useRef, useState } from "react";
import { startCamera, stopCamera } from "./utils/camera";
import { canvasToBase64Jpeg, drawVideoToCanvas } from "./utils/image";
import { autoCropDocument } from "./utils/opencvScanner";
import { processWithDocumentAI } from "./utils/documentAi";
import { classifyDocument, validateExtractedFields } from "./utils/validators";
import { runLLMExceptionReview } from "./utils/llmReview";

const PROJECT_ID = import.meta.env.VITE_GCP_PROJECT_ID || "";
const LOCATION = import.meta.env.VITE_DOCAI_LOCATION || "us";
const PROCESSOR_ID = import.meta.env.VITE_DOCAI_PROCESSOR_ID || "";

export default function App() {
  const videoRef = useRef(null);
  const rawCanvasRef = useRef(null);
  const croppedCanvasRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [status, setStatus] = useState("Ready");
  const [rawBase64, setRawBase64] = useState("");
  const [croppedBase64, setCroppedBase64] = useState("");
  const [docAiResult, setDocAiResult] = useState(null);
  const [classification, setClassification] = useState(null);
  const [validation, setValidation] = useState(null);
  const [llmReview, setLlmReview] = useState(null);

  async function handleStartCamera() {
    try {
      setStatus("Requesting camera permission...");
      await startCamera(videoRef.current);
      setCameraActive(true);
      setStatus("Camera started. Place CDC/SRB document inside the frame.");
    } catch (error) {
      setStatus(error.message || "Camera failed.");
    }
  }

  function handleStopCamera() {
    stopCamera(videoRef.current);
    setCameraActive(false);
    setStatus("Camera stopped.");
  }

  async function handleCaptureAndCrop() {
    try {
      setStatus("Capturing document image...");

      const rawCanvas = rawCanvasRef.current;
      const croppedCanvas = croppedCanvasRef.current;

      drawVideoToCanvas(videoRef.current, rawCanvas);

      setStatus("Detecting document edges and auto-cropping...");
      const cropResult = await autoCropDocument(rawCanvas, croppedCanvas);

      const raw = canvasToBase64Jpeg(rawCanvas);
      const cropped = canvasToBase64Jpeg(croppedCanvas);

      setRawBase64(raw);
      setCroppedBase64(cropped);

      if (cropResult.usedFallback) {
        setStatus("Document captured. Auto-crop fallback used because clear edges were not found.");
      } else {
        setStatus("Document captured and auto-cropped successfully.");
      }
    } catch (error) {
      setStatus(error.message || "Capture/crop failed.");
    }
  }

  async function handleRunDocumentAI() {
    try {
      if (!croppedBase64) {
        setStatus("Capture and crop the document first.");
        return;
      }

      if (!PROJECT_ID || !LOCATION || !PROCESSOR_ID) {
        setStatus("Missing VITE_GCP_PROJECT_ID / VITE_DOCAI_LOCATION / VITE_DOCAI_PROCESSOR_ID in .env");
        return;
      }

      if (!accessToken.trim()) {
        setStatus("Paste a temporary Google OAuth access token first.");
        return;
      }

      setStatus("Sending cropped document to Google Document AI...");

      const result = await processWithDocumentAI({
        projectId: PROJECT_ID,
        location: LOCATION,
        processorId: PROCESSOR_ID,
        accessToken: accessToken.trim(),
        base64Image: croppedBase64,
        mimeType: "image/jpeg"
      });

      setDocAiResult(result);

      setStatus("Classifying document country/type...");
      const detected = classifyDocument(result);
      setClassification(detected);

      setStatus("Running country-specific validation rules...");
      const validationResult = validateExtractedFields(result, detected);
      setValidation(validationResult);

      if (validationResult.shouldEscalateToLLM) {
        setStatus("Rules found issues. Running optional LLM exception review...");
        const review = await runLLMExceptionReview({
          classification: detected,
          extractedFields: result.fields,
          validationIssues: validationResult.issues
        });
        setLlmReview(review);
        setStatus("Completed with LLM exception review.");
      } else {
        setLlmReview(null);
        setStatus("Completed. Document passed POC validation rules.");
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Document AI processing failed.");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Crewmate POC</p>
          <h1>Document Scanner + AI Verification Demo</h1>
          <p className="subtitle">
            Camera capture → auto crop → Google Document AI → country rules → optional LLM review.
          </p>
        </div>

        <div className="status-pill">{status}</div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>1. Camera Scanner</h2>
          <p className="muted">
            This web POC uses browser camera + OpenCV.js. Native app later can use ML Kit on Android
            and VisionKit on iOS.
          </p>

          <div className="video-frame">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="scan-overlay">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="button-row">
            {!cameraActive ? (
              <button onClick={handleStartCamera}>Allow Camera</button>
            ) : (
              <button onClick={handleStopCamera} className="secondary">Stop Camera</button>
            )}

            <button onClick={handleCaptureAndCrop} disabled={!cameraActive}>
              Capture + Auto Crop
            </button>
          </div>
        </div>

        <div className="panel">
          <h2>2. Cropped Document</h2>
          <p className="muted">
            This cropped output is what gets sent to Document AI, not the full noisy camera frame.
          </p>

          <div className="canvas-stack">
            <canvas ref={rawCanvasRef} className="hidden-canvas" />
            <canvas ref={croppedCanvasRef} className="preview-canvas" />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>3. Google Document AI</h2>

        <div className="form-grid">
          <label>
            Project ID
            <input value={PROJECT_ID} disabled placeholder="from .env" />
          </label>

          <label>
            Location
            <input value={LOCATION} disabled placeholder="us / eu / asia-south1 etc." />
          </label>

          <label>
            Processor ID
            <input value={PROCESSOR_ID} disabled placeholder="from .env" />
          </label>
        </div>

        <label>
          Temporary OAuth Access Token
          <textarea
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Paste gcloud auth print-access-token result here for POC only"
          />
        </label>

        <button onClick={handleRunDocumentAI}>Run 3-Step POC Check</button>
      </section>

      <section className="grid">
        <ResultCard title="Classification" data={classification} />
        <ResultCard title="Validation" data={validation} />
      </section>

      <section className="grid">
        <ResultCard title="Extracted Fields" data={docAiResult?.fields || null} />
        <ResultCard title="LLM Exception Review" data={llmReview} />
      </section>

      <section className="panel warning">
        <h2>Important POC Note</h2>
        <p>
          This POC can extract and validate document data, but it must not mark a user as officially
          verified. Final official verification still needs DGMA/DG Shipping or the issuing authority’s
          official portal/API.
        </p>
      </section>
    </main>
  );
}

function ResultCard({ title, data }) {
  return (
    <div className="panel result-card">
      <h2>{title}</h2>
      <pre>{data ? JSON.stringify(data, null, 2) : "No result yet"}</pre>
    </div>
  );
}