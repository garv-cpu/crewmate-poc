export function drawVideoToCanvas(videoElement, canvasElement) {
  if (!videoElement || !canvasElement) {
    throw new Error("Video or canvas element missing.");
  }

  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (!width || !height) {
    throw new Error("Camera is not ready yet.");
  }

  canvasElement.width = width;
  canvasElement.height = height;

  const ctx = canvasElement.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(videoElement, 0, 0, width, height);
}

export function drawVideoToSmallCanvas(videoElement, canvasElement, maxWidth = 720) {
  if (!videoElement || !canvasElement) {
    throw new Error("Video or canvas element missing.");
  }

  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;

  if (!videoWidth || !videoHeight) {
    throw new Error("Camera is not ready yet.");
  }

  const scale = Math.min(1, maxWidth / videoWidth);
  const targetWidth = Math.round(videoWidth * scale);
  const targetHeight = Math.round(videoHeight * scale);

  canvasElement.width = targetWidth;
  canvasElement.height = targetHeight;

  const ctx = canvasElement.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);

  return {
    scale,
    width: targetWidth,
    height: targetHeight
  };
}

export function canvasToBase64Jpeg(canvasElement) {
  const dataUrl = canvasElement.toDataURL("image/jpeg", 0.92);
  return dataUrl.split(",")[1];
}