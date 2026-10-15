import sharp from "sharp";
import { CLASSES, COLORS, normalizeGtin, parseTagText } from "@/lib/taxonomy";
import { searchLibrary } from "@/lib/mock/library";
import { getPool } from "@/lib/db";
import type { ClientAnalysis, PhotoSlot } from "@/lib/types";
import { CLIP_MODEL_NAME, classifyEmbedding, embedImage, loadClip, meanEmbedding } from "./clip";

export const MATCH_THRESHOLD = 0.88;
const TEXT_SLOTS: PhotoSlot[] = ["tag", "label"];
const BARCODE_FORMATS = ["UPC-A", "UPC-E", "EAN-13", "EAN-8", "Code128"] as const;

export interface StoredPhoto {
  slot: PhotoSlot;
  mime_type: string;
  data: string;
}

const toBlob = (p: StoredPhoto) => new Blob([Buffer.from(p.data, "base64")], { type: p.mime_type });

const TESSERACT_CACHE = ".cache/tesseract";
let ocrWorker: Promise<import("tesseract.js").Worker> | null = null;

/** One worker is reused across photos, and its language file is cached on disk so it is downloaded only once. */
function getOcrWorker() {
  ocrWorker ??= import("tesseract.js")
    .then(({ createWorker }) => createWorker("eng", 1, { cachePath: TESSERACT_CACHE }))
    .catch((err) => {
      ocrWorker = null;
      throw err;
    });
  return ocrWorker;
}

async function readText(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(buffer);
  return { text: data.text, confidence: data.confidence / 100 };
}

async function detectBarcode(buffer: Buffer): Promise<string | null> {
  const { readBarcodes } = await import("zxing-wasm/reader");
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = { data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" as const };
  const found = await readBarcodes(image as ImageData, { formats: [...BARCODE_FORMATS], tryHarder: true, maxNumberOfSymbols: 1 });
  return found[0]?.text ?? null;
}

/** Reads the photos of one ticket with CLIP and OCR and searches the catalog, producing the same analysis the browser used to send. */
export async function analyzeStoredPhotos(storeId: string, photos: StoredPhoto[]): Promise<{ analysis: ClientAnalysis; embeddings: number[][] }> {
  const base: ClientAnalysis = { model: CLIP_MODEL_NAME, match: null, top_matches: [], match_threshold: MATCH_THRESHOLD, classification: null, ocr: null, error: null };
  try {
    // Tag and label photos are mostly white text, so they would look alike across every item and pollute matching.
    const productPhotos = photos.filter((p) => !TEXT_SLOTS.includes(p.slot));
    const subjects = productPhotos.length ? productPhotos : photos;
    const embeddings: number[][] = [];
    for (const photo of subjects) embeddings.push(await embedImage(toBlob(photo)));

    const { matches: top, brands } = await searchLibrary(getPool(), storeId, embeddings);
    const best = top[0];
    const match = best && best.similarity >= MATCH_THRESHOLD ? best : null;

    const { cls, color } = await classifyEmbedding(meanEmbedding(embeddings));
    const classDef = CLASSES[cls.index];
    const colorDef = COLORS[color.index];

    const textPhotos = photos.filter((p) => TEXT_SLOTS.includes(p.slot));
    let ocr: ClientAnalysis["ocr"] = null;
    if (textPhotos.length) {
      const texts: string[] = [];
      let confidence = 0;
      let barcode: string | null = null;
      for (const photo of textPhotos) {
        const buffer = Buffer.from(photo.data, "base64");
        const result = await readText(buffer);
        texts.push(result.text);
        confidence = Math.max(confidence, result.confidence);
        barcode ??= await detectBarcode(buffer);
      }
      const text = texts.join("\n").trim();
      const parsed = parseTagText(text, brands);
      ocr = { text, confidence, brand: parsed.brand, size: parsed.size, price: parsed.price, barcode: barcode ? normalizeGtin(barcode) : parsed.barcode };
    }

    return {
      embeddings,
      analysis: {
        ...base,
        match,
        top_matches: top,
        classification: {
          class: { code: classDef.code, name: classDef.name, score: cls.score, departmentCode: classDef.departmentCode, departmentName: classDef.departmentName },
          color: { code: colorDef.code, name: colorDef.name, score: color.score },
        },
        ocr,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image analysis failed";
    return { embeddings: [], analysis: { ...base, error: `Image analysis failed: ${message}` } };
  }
}

/** Loads the image model and the OCR engine so the first real request does not pay for it. The State Machine gives a connector only 10 seconds. */
export async function warmUp(): Promise<void> {
  await Promise.all([loadClip(), getOcrWorker(), import("zxing-wasm/reader"), import("sharp")]);
}
