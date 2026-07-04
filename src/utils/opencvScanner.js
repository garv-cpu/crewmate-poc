function waitForOpenCV() {
  return new Promise((resolve, reject) => {
    let tries = 0;

    const timer = setInterval(() => {
      tries += 1;

      const cv = window.cv;

      if (
        cv &&
        cv.Mat &&
        cv.imread &&
        cv.findContours &&
        cv.getPerspectiveTransform
      ) {
        clearInterval(timer);
        resolve(cv);
      }

      if (tries > 150) {
        clearInterval(timer);
        reject(new Error("OpenCV.js failed to load completely."));
      }
    }, 100);
  });
}

function getJscanifyConstructor() {
  return (
    window.jscanify ||
    window.Jscanify ||
    globalThis.jscanify ||
    globalThis.Jscanify
  );
}

let scannerInstance = null;

function getScanner() {
  const Jscanify =
    window.jscanify ||
    window.Jscanify ||
    globalThis.jscanify ||
    globalThis.Jscanify;

  if (!Jscanify) {
    throw new Error("jscanify is not loaded. Check /vendor/jscanify.js script in index.html.");
  }

  if (!scannerInstance) {
    scannerInstance = new Jscanify();
  }

  return scannerInstance;
}
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

export async function detectDocumentInCanvas(sourceCanvas) {
  const cv = await waitForOpenCV();
  const scanner = getScanner();

  const mat = cv.imread(sourceCanvas);
  let contour = null;

  try {
    contour = scanner.findPaperContour(mat);

    if (!contour) {
      return { found: false, points: [], areaRatio: 0 };
    }

    const corners = scanner.getCornerPoints(contour, mat);

    if (
      !corners ||
      !corners.topLeftCorner ||
      !corners.topRightCorner ||
      !corners.bottomLeftCorner ||
      !corners.bottomRightCorner
    ) {
      return { found: false, points: [], areaRatio: 0 };
    }

    // Match this project's existing point order convention: TL, TR, BR, BL
    const points = [
      corners.topLeftCorner,
      corners.topRightCorner,
      corners.bottomRightCorner,
      corners.bottomLeftCorner
    ];

    const imageArea = sourceCanvas.width * sourceCanvas.height;
    const area = polygonArea(points);
    const areaRatio = area / imageArea;

    // Guard against jscanify locking onto something absurdly small/large
    // (e.g. a shadow sliver or the whole frame edge-to-edge).
    if (areaRatio < 0.05 || areaRatio > 0.98) {
      return { found: false, points: [], areaRatio: 0 };
    }

    return { found: true, points, areaRatio };
  } finally {
    mat.delete();
    if (contour) contour.delete();
  }
}

export async function autoCropDocument(sourceCanvas, targetCanvas) {
  const detection = await detectDocumentInCanvas(sourceCanvas);

  if (!detection.found) {
    drawFallback(sourceCanvas, targetCanvas);
    return {
      usedFallback: true,
      points: []
    };
  }

  await cropDocumentFromPoints(sourceCanvas, targetCanvas, detection.points);

  return {
    usedFallback: false,
    points: detection.points
  };
}

export async function cropDocumentFromPoints(sourceCanvas, targetCanvas, points) {
  const cv = await waitForOpenCV();

  const src = cv.imread(sourceCanvas);
  const ordered = orderPoints(points);

  const widthA = distance(ordered[2], ordered[3]);
  const widthB = distance(ordered[1], ordered[0]);
  const maxWidth = Math.max(widthA, widthB);

  const heightA = distance(ordered[1], ordered[2]);
  const heightB = distance(ordered[0], ordered[3]);
  const maxHeight = Math.max(heightA, heightB);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x, ordered[0].y,
    ordered[1].x, ordered[1].y,
    ordered[2].x, ordered[2].y,
    ordered[3].x, ordered[3].y
  ]);

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    maxWidth - 1, 0,
    maxWidth - 1, maxHeight - 1,
    0, maxHeight - 1
  ]);

  const matrix = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();

  try {
    cv.warpPerspective(
      src,
      warped,
      matrix,
      new cv.Size(Math.round(maxWidth), Math.round(maxHeight)),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar()
    );

    targetCanvas.width = warped.cols;
    targetCanvas.height = warped.rows;

    cv.imshow(targetCanvas, warped);
  } finally {
    src.delete();
    srcTri.delete();
    dstTri.delete();
    matrix.delete();
    warped.delete();
  }
}

export function drawDocumentOutline({
  overlayCanvas,
  videoElement,
  sourceCanvas,
  points,
  visible
}) {
  if (!overlayCanvas || !videoElement || !sourceCanvas) return;

  const rect = videoElement.getBoundingClientRect();
  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;

  overlayCanvas.width = rect.width;
  overlayCanvas.height = rect.height;

  const ctx = overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!visible || !points?.length || !videoWidth || !videoHeight) {
    return;
  }

  // sourceCanvas (detector canvas) is a downscaled copy of the FULL camera
  // frame at the same aspect ratio. Convert points -> full video-frame space.
  const toFullResScale = videoWidth / sourceCanvas.width;

  // video { object-fit: cover } uses a UNIFORM scale (the larger of the two
  // ratios) and centers the overflow, cropping the rest. Without accounting
  // for this, points land off-screen or warped whenever the container's
  // aspect ratio differs from the camera's native aspect ratio.
  const coverScale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const displayedWidth = videoWidth * coverScale;
  const displayedHeight = videoHeight * coverScale;
  const offsetX = (displayedWidth - rect.width) / 2;
  const offsetY = (displayedHeight - rect.height) / 2;

  const scaled = points.map((point) => ({
    x: point.x * toFullResScale * coverScale - offsetX,
    y: point.y * toFullResScale * coverScale - offsetY
  }));

  ctx.save();

  ctx.fillStyle = "rgba(0, 194, 255, 0.08)";
  ctx.strokeStyle = "rgba(113, 217, 255, 0.98)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(0, 194, 255, 0.9)";
  ctx.shadowBlur = 18;

  ctx.beginPath();
  ctx.moveTo(scaled[0].x, scaled[0].y);
  ctx.lineTo(scaled[1].x, scaled[1].y);
  ctx.lineTo(scaled[2].x, scaled[2].y);
  ctx.lineTo(scaled[3].x, scaled[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  drawCorner(ctx, scaled[0], "tl");
  drawCorner(ctx, scaled[1], "tr");
  drawCorner(ctx, scaled[2], "br");
  drawCorner(ctx, scaled[3], "bl");

  ctx.restore();
}

function drawCorner(ctx, point, position) {
  const size = 34;

  ctx.save();
  ctx.strokeStyle = "#d7f7ff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
  ctx.shadowBlur = 12;

  ctx.beginPath();

  if (position === "tl") {
    ctx.moveTo(point.x, point.y + size);
    ctx.lineTo(point.x, point.y);
    ctx.lineTo(point.x + size, point.y);
  }

  if (position === "tr") {
    ctx.moveTo(point.x - size, point.y);
    ctx.lineTo(point.x, point.y);
    ctx.lineTo(point.x, point.y + size);
  }

  if (position === "br") {
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x, point.y);
    ctx.lineTo(point.x - size, point.y);
  }

  if (position === "bl") {
    ctx.moveTo(point.x + size, point.y);
    ctx.lineTo(point.x, point.y);
    ctx.lineTo(point.x, point.y - size);
  }

  ctx.stroke();
  ctx.restore();
}

export function clearDocumentOutline(overlayCanvas) {
  if (!overlayCanvas) return;

  const ctx = overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

export function getDetectionStability(currentPoints, previousPoints) {
  if (!currentPoints?.length || !previousPoints?.length) {
    return 0;
  }

  let totalMovement = 0;

  for (let i = 0; i < 4; i++) {
    totalMovement += distance(currentPoints[i], previousPoints[i]);
  }

  const averageMovement = totalMovement / 4;

  if (averageMovement < 8) return 1;
  if (averageMovement < 16) return 0.7;
  if (averageMovement < 28) return 0.4;

  return 0;
}

function drawFallback(sourceCanvas, targetCanvas) {
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;

  const ctx = targetCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);
}

function orderPoints(points) {
  const sortedBySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const topLeft = sortedBySum[0];
  const bottomRight = sortedBySum[sortedBySum.length - 1];

  const sortedByDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  const topRight = sortedByDiff[0];
  const bottomLeft = sortedByDiff[sortedByDiff.length - 1];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}