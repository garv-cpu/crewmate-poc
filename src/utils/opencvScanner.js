function waitForOpenCV() {
  return new Promise((resolve, reject) => {
    let tries = 0;

    const timer = setInterval(() => {
      tries += 1;

      if (window.cv && window.cv.Mat) {
        clearInterval(timer);
        resolve(window.cv);
      }

      if (tries > 100) {
        clearInterval(timer);
        reject(new Error("OpenCV.js failed to load."));
      }
    }, 100);
  });
}

export async function detectDocumentInCanvas(sourceCanvas) {
  const cv = await waitForOpenCV();

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const dilated = new cv.Mat();
  const dilationKernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Lower thresholds catch weaker edges (screen glare / low-contrast docs).
    cv.Canny(blurred, edged, 40, 120);

    // Bridges small gaps in the edge map caused by glare/moiré so
    // approxPolyDP can still close a clean 4-point polygon.
    cv.dilate(edged, dilated, dilationKernel);

    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestContour = null;
    let bestArea = 0;
    const imageArea = sourceCanvas.width * sourceCanvas.height;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();

      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      const area = cv.contourArea(approx);
      const areaRatio = area / imageArea;

      const isDocumentLike =
        approx.rows === 4 &&
        areaRatio > 0.08 &&
        areaRatio < 0.95 &&
        area > bestArea;

      if (isDocumentLike) {
        if (bestContour) bestContour.delete();
        bestContour = approx;
        bestArea = area;
      } else {
        approx.delete();
      }

      contour.delete();
    }

    if (!bestContour) {
      return {
        found: false,
        points: [],
        areaRatio: 0
      };
    }

    const points = getContourPoints(bestContour);
    const ordered = orderPoints(points);

    bestContour.delete();

    return {
      found: true,
      points: ordered,
      areaRatio: bestArea / imageArea
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edged.delete();
    dilated.delete();
    dilationKernel.delete();
    contours.delete();
    hierarchy.delete();
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

function getContourPoints(contour) {
  const points = [];

  for (let i = 0; i < contour.data32S.length; i += 2) {
    points.push({
      x: contour.data32S[i],
      y: contour.data32S[i + 1]
    });
  }

  return points;
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