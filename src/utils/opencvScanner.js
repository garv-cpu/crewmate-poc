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

export async function autoCropDocument(sourceCanvas, targetCanvas) {
  const cv = await waitForOpenCV();

  const src = cv.imread(sourceCanvas);
  const original = src.clone();

  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 75, 200);

    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let bestContour = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();

      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      const area = cv.contourArea(approx);
      const isDocumentLike = approx.rows === 4 && area > bestArea;

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
      drawFallback(sourceCanvas, targetCanvas);
      return { usedFallback: true };
    }

    const points = getContourPoints(bestContour);
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

    cv.warpPerspective(
      original,
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

    bestContour.delete();
    srcTri.delete();
    dstTri.delete();
    matrix.delete();
    warped.delete();

    return { usedFallback: false };
  } finally {
    src.delete();
    original.delete();
    gray.delete();
    blurred.delete();
    edged.delete();
    contours.delete();
    hierarchy.delete();
  }
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