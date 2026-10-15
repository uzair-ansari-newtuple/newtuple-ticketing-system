import { productMetadata, type Product } from "@/data/catalog";
import type { Candidate, ClientAnalysis, EscalationReason, Gating, NormalizedMetadata } from "@/lib/types";

export const GREEN_SCORE = 0.88;
export const GREEN_MARGIN = 0.05;
export const STRONG_SCORE = 0.75;
export const MIN_CANDIDATE_SCORE = 0.6;
export const MIN_PRINT_SCORE = 0.65;
const MAX_CANDIDATES = 6;
const TOO_MANY = 5;
const ATTRIBUTE_CAP = 0.85;
const BARCODE_SCORE = 0.99;

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

function attributeScore(meta: NormalizedMetadata, product: NormalizedMetadata): number {
  const brand = same(meta.Brand, product.Brand);
  const cls = same(meta.ClassCode, product.ClassCode);
  if (!brand && !cls) return 0;
  const raw = (brand ? 0.4 : 0) + (cls ? 0.4 : 0) + (same(meta.ColorCode, product.ColorCode) ? 0.2 : 0);
  return Math.min(ATTRIBUTE_CAP, raw * ATTRIBUTE_CAP);
}

/** Candidates come from three kinds of evidence: an exact barcode, image similarity, and matching brand/category/color. */
export function buildCandidates(analysis: ClientAnalysis, meta: NormalizedMetadata | null, products: Product[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  const offer = (c: Candidate) => {
    const current = byKey.get(c.key);
    if (!current || c.score > current.score) byKey.set(c.key, { ...c, thumb: c.thumb ?? current?.thumb ?? null });
  };

  if (meta) {
    for (const p of products) {
      const pm = productMetadata(p);
      if (same(meta.Barcode, p.upc)) offer({ key: p.sku, sku: p.sku, metadata: pm, score: BARCODE_SCORE, evidence: "barcode", thumb: null });
      const attr = attributeScore(meta, pm);
      if (attr > 0) offer({ key: p.sku, sku: p.sku, metadata: pm, score: attr, evidence: "attributes", thumb: null });
    }
  }
  for (const m of analysis.top_matches) {
    offer({ key: m.metadata.Sku ?? `ref:${m.reference_id}`, sku: m.metadata.Sku, metadata: m.metadata, score: m.similarity, evidence: "image", thumb: m.thumb });
  }

  return [...byKey.values()]
    .filter((c) => c.score >= MIN_CANDIDATE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

export function gate(candidates: Candidate[], analysisFailed: boolean): { gating: Gating; reason: EscalationReason | null } {
  if (analysisFailed) return { gating: "RED", reason: "CATALOG_UNAVAILABLE" };
  // Matching brand, class and colour alone says little when many products share them, so only photo and barcode evidence counts as a strong match.
  if (candidates.filter((c) => c.evidence !== "attributes" && c.score >= STRONG_SCORE).length > TOO_MANY) return { gating: "RED", reason: "TOO_MANY_CANDIDATES" };
  if (candidates.length === 0) return { gating: "RED", reason: "LOW_EVIDENCE" };
  const [top, next] = candidates;
  if (top.score >= GREEN_SCORE && (!next || top.score - next.score >= GREEN_MARGIN)) return { gating: "GREEN", reason: null };
  return { gating: "YELLOW", reason: null };
}
