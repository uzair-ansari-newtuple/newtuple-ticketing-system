const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.75;
const SAMPLE_SIZE = 256;

export interface ProcessedImage {
  dataUrl: string;
  base64: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  blurScore: number;
  brightness: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function measureQuality(source: ImageBitmap): { blurScore: number; brightness: number } {
  const scale = SAMPLE_SIZE / Math.max(source.width, source.height);
  const w = Math.max(8, Math.round(source.width * scale));
  const h = Math.max(8, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { blurScore: 100, brightness: 128 };
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const luma = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = luma;
    sum += luma;
  }

  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const mean = lapSum / n;
  return { blurScore: lapSq / n - mean * mean, brightness: sum / gray.length };
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  const dataUrl = await blobToDataUrl(blob);
  const { blurScore, brightness } = measureQuality(bitmap);
  bitmap.close();

  return {
    dataUrl,
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    bytes: blob.size,
    width,
    height,
    sha256: await sha256Hex(await blob.arrayBuffer()),
    blurScore: Math.round(blurScore * 10) / 10,
    brightness: Math.round(brightness),
  };
}

export async function makeThumb(source: Blob | string, size = 192): Promise<string> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}
