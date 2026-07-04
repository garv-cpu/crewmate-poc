export class Canvas {}

export class Image {}

export function createCanvas(width = 1, height = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export default {
  Canvas,
  Image,
  createCanvas,
  loadImage
};