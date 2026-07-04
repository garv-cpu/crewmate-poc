export async function startCamera(videoElement) {
  if (!videoElement) {
    throw new Error("Video element not found.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  videoElement.srcObject = stream;

  await new Promise((resolve) => {
    videoElement.onloadedmetadata = resolve;
  });

  await videoElement.play();
}

export function stopCamera(videoElement) {
  const stream = videoElement?.srcObject;

  if (!stream) return;

  stream.getTracks().forEach((track) => track.stop());
  videoElement.srcObject = null;
}