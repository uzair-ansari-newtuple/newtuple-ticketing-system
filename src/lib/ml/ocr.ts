export interface OcrResult {
  text: string;
  confidence: number;
}

export async function readText(dataUrl: string): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(dataUrl);
    return { text: data.text, confidence: data.confidence / 100 };
  } finally {
    await worker.terminate();
  }
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmap): Promise<{ rawValue: string }[]>;
}

export async function detectBarcode(dataUrl: string): Promise<string | null> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (!Detector) return null;
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const found = await new Detector({ formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"] }).detect(bitmap);
    return found[0]?.rawValue ?? null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
