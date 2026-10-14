import { emptyMetadata } from "@/lib/taxonomy";
import type { ClientAnalysis, FieldSource, MetadataExtraction, NormalizedMetadata } from "@/lib/types";

type Built = Pick<MetadataExtraction, "normalized_metadata" | "ocr_text" | "confidence" | "warnings" | "missing_fields" | "field_sources" | "error_message">;

const LOW_CONFIDENCE = 0.5;

export function buildExtraction(analysis: ClientAnalysis): Built {
  if (analysis.error) {
    return { normalized_metadata: null, ocr_text: null, confidence: null, warnings: [], missing_fields: [], field_sources: {}, error_message: analysis.error };
  }

  const metadata: NormalizedMetadata = emptyMetadata();
  const sources: Built["field_sources"] = {};
  const warnings: string[] = [];
  const confidences: number[] = [];

  const set = <K extends keyof NormalizedMetadata>(key: K, value: NormalizedMetadata[K], source: FieldSource, confidence: number) => {
    if (value === null || value === undefined || value === "") return;
    metadata[key] = value;
    sources[key] = { source, confidence };
  };

  const { match, classification, ocr } = analysis;

  if (match) {
    for (const key of Object.keys(match.metadata) as (keyof NormalizedMetadata)[]) set(key, match.metadata[key], "image_match", match.similarity);
    confidences.push(match.similarity);
  } else if (classification) {
    const { class: cls, color } = classification;
    set("ClassCode", cls.code, "classifier", cls.score);
    set("ClassName", cls.name, "classifier", cls.score);
    set("DepartmentCode", cls.departmentCode, "classifier", cls.score);
    set("DepartmentName", cls.departmentName, "classifier", cls.score);
    set("ColorCode", color.code, "classifier", color.score);
    set("ColorName", color.name, "classifier", color.score);
    confidences.push(cls.score, color.score);
    if (cls.score < LOW_CONFIDENCE) warnings.push(`Low confidence on product type (${cls.name}, ${Math.round(cls.score * 100)}%)`);
    if (color.score < LOW_CONFIDENCE) warnings.push(`Low confidence on color (${color.name}, ${Math.round(color.score * 100)}%)`);
    if (analysis.top_matches[0]) {
      warnings.push(`No library match. Closest was ${Math.round(analysis.top_matches[0].similarity * 100)}% similar (needs ${Math.round(analysis.match_threshold * 100)}%).`);
    }
  }

  if (ocr) {
    const conf = Math.max(ocr.confidence, 0.05);
    if (!metadata.Brand) set("Brand", ocr.brand, "ocr", conf);
    // Size belongs to the physical item, so a size printed on this tag beats the one saved with the reference.
    if (ocr.size) {
      set("SizeCode", ocr.size.code, "ocr", conf);
      set("SizeName", ocr.size.name, "ocr", conf);
    }
    if (!metadata.Barcode) set("Barcode", ocr.barcode, "ocr", conf);
    if (sources.Brand?.source === "ocr" || sources.Barcode?.source === "ocr") confidences.push(conf);
    if (ocr.confidence < LOW_CONFIDENCE) warnings.push("Tag text was hard to read. Retake the tag photo closer and sharper.");
  } else {
    warnings.push("No tag photo, so brand, size and barcode could not be read.");
  }

  const missing = (["Brand", "SizeCode", "Barcode"] as const).filter((k) => !metadata[k]).map((k) => (k === "SizeCode" ? "Size" : k));
  const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  return { normalized_metadata: metadata, ocr_text: ocr?.text || null, confidence, warnings, missing_fields: missing, field_sources: sources, error_message: null };
}
