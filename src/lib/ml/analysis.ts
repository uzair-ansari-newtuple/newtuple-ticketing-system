import { CLASSES, COLORS, parseTagText } from "@/lib/taxonomy";
import { api } from "@/lib/api";
import type { ClientAnalysis, PhotoSlot } from "@/lib/types";
import { CLIP_MODEL_NAME, classifyEmbedding, embedImage, meanEmbedding, type LoadProgress } from "./clip";
import { detectBarcode, readText } from "./ocr";

export const MATCH_THRESHOLD = 0.88;
const OCR_SLOTS: PhotoSlot[] = ["tag", "label"];

export type AnalysisStage = "model" | "embed" | "match" | "ocr";

export interface AnalysisProgress extends LoadProgress {
  stage: AnalysisStage;
}

export interface AnalysisInput {
  photos: { slot: PhotoSlot; dataUrl: string }[];
  token: string;
  onProgress: (p: AnalysisProgress) => void;
}

export async function analyzePhotos({ photos, token, onProgress }: AnalysisInput): Promise<{ analysis: ClientAnalysis; embeddings: number[][] }> {
  const base: ClientAnalysis = { model: CLIP_MODEL_NAME, match: null, top_matches: [], match_threshold: MATCH_THRESHOLD, classification: null, ocr: null, error: null };

  try {
    // Tag and label photos are mostly white text, so they would look alike across every item and pollute matching.
    const productPhotos = photos.filter((p) => !OCR_SLOTS.includes(p.slot));
    const subjects = productPhotos.length ? productPhotos : photos;
    const embeddings: number[][] = [];
    for (let i = 0; i < subjects.length; i++) {
      onProgress({ stage: i === 0 ? "model" : "embed", label: i === 0 ? "Loading image model" : `Analyzing photo ${i + 1} of ${subjects.length}`, pct: (i / subjects.length) * 100 });
      embeddings.push(await embedImage(subjects[i].dataUrl, (p) => onProgress({ ...p, stage: "model" })));
    }

    onProgress({ stage: "match", label: "Searching the vector database", pct: 100 });
    const { matches: top, brands: knownBrands } = await api.searchLibrary(token, embeddings);
    const best = top[0];
    const match = best && best.similarity >= MATCH_THRESHOLD ? best : null;

    const { cls, color } = await classifyEmbedding(meanEmbedding(embeddings));
    const classDef = CLASSES[cls.index];
    const colorDef = COLORS[color.index];

    const ocrTargets = photos.filter((p) => OCR_SLOTS.includes(p.slot));
    let ocr: ClientAnalysis["ocr"] = null;
    if (ocrTargets.length) {
      const texts: string[] = [];
      let confidence = 0;
      let barcode: string | null = null;
      for (let i = 0; i < ocrTargets.length; i++) {
        onProgress({ stage: "ocr", label: `Reading tag text (${i + 1} of ${ocrTargets.length})`, pct: (i / ocrTargets.length) * 100 });
        const result = await readText(ocrTargets[i].dataUrl);
        texts.push(result.text);
        confidence = Math.max(confidence, result.confidence);
        barcode ??= await detectBarcode(ocrTargets[i].dataUrl);
      }
      const text = texts.join("\n").trim();
      const parsed = parseTagText(text, knownBrands);
      ocr = { text, confidence, brand: parsed.brand, size: parsed.size, price: parsed.price, barcode: barcode ?? parsed.barcode };
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
    return { embeddings: [], analysis: { ...base, error: `Image model unavailable: ${message}. It needs an internet connection on first run.` } };
  }
}
