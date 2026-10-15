/**
 * Seeds Neon with demo data so every screen has something to show.
 *
 *   npm run db:seed             refresh the catalog embeddings and the demo tickets
 *   npm run db:seed -- --clear  remove the demo tickets (the catalog stays)
 *
 * Demo tickets belong to store ST-112 and use fixed ids, so running this again replaces them.
 * Run `npm run db:migrate` first. Product photos come from public/catalog/<SKU>.jpg and products from db/seed/products.json.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { productImageUrl, productMetadata, type Product } from "@/data/catalog";
import { buildCandidates, gate } from "@/lib/mock/flow";
import { buildExtraction } from "@/lib/mock/extract";
import { CLASSES, parseTagText } from "@/lib/taxonomy";
import type { Candidate, CaptureMetadata, ClientAnalysis, Escalation, EscalationReason, IncidentState, ItemAge, MatchCandidate, MetadataExtraction, ResolverState } from "@/lib/types";

process.loadEnvFile(".env");

const STORE_ID = "ST-112";
const PRODUCTS: Product[] = JSON.parse(readFileSync("db/seed/products.json", "utf8"));
const MODEL = "Xenova/clip-vit-base-patch32";
const ID_PREFIX = "00000000-0000-4000-8000-0000000090";
const toVector = (v: number[]) => `[${v.join(",")}]`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const bySku = (sku: string): Product => {
  const p = PRODUCTS.find((x) => x.sku === sku);
  if (!p) throw new Error(`Unknown SKU ${sku}`);
  return p;
};
const file = (path: string) => readFileSync(path);
const dataUrl = (path: string) => `data:image/jpeg;base64,${file(path).toString("base64")}`;

interface Spec {
  n: number;
  state: IncidentState;
  minutes: number;
  sku?: string;
  similarity?: number;
  extraMatches?: { sku: string; similarity: number }[];
  tag?: "full" | "brand-only" | "none";
  weakClass?: boolean;
  confirmed?: string;
  escalation?: { reason: EscalationReason; note: string; age: ItemAge };
  resolver?: Omit<ResolverState, "responded_at"> & { respondedMinutesAgo?: number };
  unread?: boolean;
  print?: { copies: number; printer: number };
  disposition?: "DISCARD" | "RETURN_TO_VENDOR" | "DONATE";
  tagAdded?: boolean;
}

const SPECS: Spec[] = [
  { n: 1, state: "CANDIDATES_READY", minutes: 6, sku: "SKU-1007", similarity: 0.96, tag: "full" },
  { n: 2, state: "CANDIDATES_READY", minutes: 14, sku: "SKU-1008", similarity: 0.84, extraMatches: [{ sku: "SKU-1007", similarity: 0.82 }], tag: "brand-only" },
  { n: 3, state: "CANDIDATES_READY", minutes: 22, sku: "SKU-1013", similarity: 0.5, weakClass: true, tag: "none" },
  { n: 4, state: "ESCALATED", minutes: 40, sku: "SKU-1013", similarity: 0.5, weakClass: true, tag: "none", escalation: { reason: "LOW_EVIDENCE", note: "Tag is missing from the item", age: "NEW_FREIGHT" }, resolver: { status: "NEW", claimed_by: null, decision: null, recommended: null, comment: null } },
  { n: 5, state: "RESOLUTION_IN_PROGRESS", minutes: 55, sku: "SKU-1015", similarity: 0.55, weakClass: true, tag: "none", escalation: { reason: "TOO_MANY_CANDIDATES", note: "Several denim jackets look the same", age: "OLD_MERCHANDISE" }, resolver: { status: "IN_PROGRESS", claimed_by: "resolver1", decision: null, recommended: null, comment: null } },
  { n: 6, state: "RESOLVER_RESPONSE_RECEIVED", minutes: 90, sku: "SKU-1013", similarity: 0.5, weakClass: true, tag: "none", unread: true, escalation: { reason: "LOW_EVIDENCE", note: "No tag, front photo only", age: "NEW_FREIGHT" }, resolver: { status: "RESOLVED", claimed_by: "resolver1", decision: "RECOMMEND", recommended: productMetadata(bySku("SKU-1013")), comment: "Wrap midi dress in maroon. Matches the supplier lookbook.", respondedMinutesAgo: 20 } },
  { n: 7, state: "RESOLVER_RESPONSE_RECEIVED", minutes: 120, sku: "SKU-1017", similarity: 0.5, weakClass: true, tag: "none", unread: true, escalation: { reason: "USER_UNSURE", note: "Looks like a mug set?", age: "OLD_MERCHANDISE" }, resolver: { status: "RESOLVED", claimed_by: "resolver1", decision: "NOT_APPAREL", recommended: null, comment: "This is a home item, not apparel. Send it to the home department.", respondedMinutesAgo: 45 } },
  { n: 8, state: "CONFIRMED", minutes: 30, sku: "SKU-1004", similarity: 0.95, tag: "full", confirmed: "SKU-1004" },
  { n: 9, state: "PRINTED", minutes: 300, sku: "SKU-1011", similarity: 0.94, tag: "full", confirmed: "SKU-1011", print: { copies: 2, printer: 1 } },
  { n: 10, state: "COMPLETED", minutes: 600, sku: "SKU-1001", similarity: 0.95, tag: "full", confirmed: "SKU-1001", print: { copies: 3, printer: 2 }, tagAdded: true },
  { n: 11, state: "RESOLVER_RESPONSE_RECEIVED", minutes: 500, sku: "SKU-1016", similarity: 0.5, weakClass: true, tag: "none", escalation: { reason: "LOW_EVIDENCE", note: "Heavy coat, no label", age: "OLD_MERCHANDISE" }, resolver: { status: "RESOLVED", claimed_by: "resolver1", decision: "CANT_RESOLVE", recommended: null, comment: "Not enough detail. Ask the vendor for a packing list.", respondedMinutesAgo: 400 } },
  { n: 12, state: "CLOSED", minutes: 1500, sku: "SKU-1017", similarity: 0.5, weakClass: true, tag: "none", escalation: { reason: "USER_UNSURE", note: "Might be a pet bed", age: "OLD_MERCHANDISE" }, resolver: { status: "RESOLVED", claimed_by: "resolver1", decision: "NOT_APPAREL", recommended: null, comment: "Pet item. Not CT merchandise.", respondedMinutesAgo: 1400 }, disposition: "DONATE" },
  { n: 13, state: "COMPLETED", minutes: 2000, sku: "SKU-1013", similarity: 0.5, weakClass: true, tag: "none", escalation: { reason: "LOW_EVIDENCE", note: "No tag", age: "NEW_FREIGHT" }, resolver: { status: "RESOLVED", claimed_by: "resolver1", decision: "RECOMMEND", recommended: productMetadata(bySku("SKU-1013")), comment: "Wrap midi dress, maroon.", respondedMinutesAgo: 1900 }, confirmed: "SKU-1013", print: { copies: 1, printer: 1 }, tagAdded: true },
];

function tagText(p: Product): string {
  const size = "M";
  return `${p.brand.toUpperCase()}\n${p.name}\nSIZE ${size}\n${p.price}\n${p.upc}`;
}

function matchFor(refIds: Map<string, string>, sku: string, similarity: number): MatchCandidate {
  const p = bySku(sku);
  return { reference_id: refIds.get(sku) ?? randomUUID(), similarity, metadata: productMetadata(p), thumb: productImageUrl(sku) };
}

function buildAnalysis(spec: Spec, refIds: Map<string, string>): ClientAnalysis {
  const p = bySku(spec.sku!);
  const matches = [matchFor(refIds, spec.sku!, spec.similarity!), ...(spec.extraMatches ?? []).map((m) => matchFor(refIds, m.sku, m.similarity))];
  const weakClass = CLASSES.find((c) => c.code === "2003")!;
  const classification = spec.weakClass
    ? { class: { code: weakClass.code, name: weakClass.name, score: 0.28, departmentCode: weakClass.departmentCode, departmentName: weakClass.departmentName }, color: { code: "GRY", name: "Gray", score: 0.24 } }
    : (() => {
        const meta = productMetadata(p);
        return { class: { code: meta.ClassCode!, name: meta.ClassName!, score: 0.82, departmentCode: meta.DepartmentCode!, departmentName: meta.DepartmentName! }, color: { code: meta.ColorCode!, name: meta.ColorName!, score: 0.7 } };
      })();
  let ocr: ClientAnalysis["ocr"] = null;
  if (spec.tag === "full" || spec.tag === "brand-only") {
    const text = spec.tag === "full" ? tagText(p) : `${p.brand.toUpperCase()}\n${p.name}`;
    const parsed = parseTagText(text, [p.brand]);
    ocr = { text, brand: parsed.brand, size: parsed.size, price: parsed.price, barcode: parsed.barcode, confidence: 0.94 };
  }
  const best = matches[0];
  return { model: "clip-vit-base-patch32", match: best.similarity >= 0.88 ? best : null, top_matches: matches, match_threshold: 0.88, classification, ocr, error: null };
}

function capture(name: string, bytes: number, size: number, sha: string): CaptureMetadata {
  return { fileName: name, source: "uploaded", mimeType: "image/jpeg", originalBytes: bytes, compressedBytes: bytes, width: size, height: size, sha256: sha, capturedAt: minutesAgo(5).toISOString(), device: "Demo seed data", orientation: null, gps: null, userAgent: "seed-script", blurScore: 60, brightness: 220 };
}

async function main() {
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

async function clearDemoTickets() {
  const { rowCount } = await client.query(`DELETE FROM incidents WHERE id::text LIKE $1`, [`${ID_PREFIX}%`]);
  return rowCount ?? 0;
}

try {
  if (process.argv.includes("--clear")) {
    console.log(`Removed ${await clearDemoTickets()} demo tickets.`);
    process.exit(0);
  }

  await client.query("BEGIN");


  const refIds = new Map<string, string>();
  const needEmbedding: Product[] = [];
  for (const p of PRODUCTS) {
    const cents = Math.round(parseFloat(p.price.replace("$", "")) * 100);
    await client.query(
      `INSERT INTO products (sku, upc, name, brand, class_code, color_code, price_cents) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (sku) DO UPDATE SET upc = EXCLUDED.upc, name = EXCLUDED.name, brand = EXCLUDED.brand, class_code = EXCLUDED.class_code, color_code = EXCLUDED.color_code, price_cents = EXCLUDED.price_cents`,
      [p.sku, p.upc, p.name, p.brand, p.classCode, p.colorCode, cents],
    );
    await client.query(
      `INSERT INTO product_images (sku, position, mime_type, data) VALUES ($1, 0, 'image/jpeg', $2)
       ON CONFLICT (sku, position) DO UPDATE SET data = EXCLUDED.data`,
      [p.sku, file(`public/catalog/${p.sku}.jpg`).toString("base64")],
    );
    const { rows } = await client.query(
      `INSERT INTO reference_items (id, kind, sku, metadata, thumb) VALUES ($1, 'catalog', $2, $3, $4)
       ON CONFLICT (sku) DO UPDATE SET metadata = EXCLUDED.metadata, thumb = EXCLUDED.thumb RETURNING id`,
      [randomUUID(), p.sku, JSON.stringify(productMetadata(p)), productImageUrl(p.sku)],
    );
    refIds.set(p.sku, rows[0].id);
    const has = await client.query(`SELECT 1 FROM reference_embeddings WHERE item_id = $1 LIMIT 1`, [rows[0].id]);
    if (!has.rowCount || process.argv.includes("--embeddings")) needEmbedding.push(p);
  }
  console.log(`Products: ${PRODUCTS.length}`);

  if (needEmbedding.length) {
    console.log(`Computing image embeddings for ${needEmbedding.length} products (downloads the model the first time)...`);
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import("@huggingface/transformers");
    const processor = await AutoProcessor.from_pretrained(MODEL);
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
    for (const p of needEmbedding) {
      const { image_embeds } = await vision(await processor(await RawImage.read(`public/catalog/${p.sku}.jpg`)));
      const raw = Array.from(image_embeds.data as Float32Array);
      const norm = Math.sqrt(raw.reduce((a, x) => a + x * x, 0)) || 1;
      await client.query(`DELETE FROM reference_embeddings WHERE item_id = $1`, [refIds.get(p.sku)]);
      await client.query(`INSERT INTO reference_embeddings (item_id, embedding) VALUES ($1, $2::vector)`, [refIds.get(p.sku), toVector(raw.map((x) => Math.round((x / norm) * 1e4) / 1e4))]);
    }
  }

  const embeddingsBySku = new Map<string, number[][]>();
  const stored = await client.query<{ sku: string; embedding: string }>(`SELECT i.sku, e.embedding::text AS embedding FROM reference_embeddings e JOIN reference_items i ON i.id = e.item_id WHERE i.kind = 'catalog'`);
  for (const r of stored.rows) embeddingsBySku.set(r.sku, [...(embeddingsBySku.get(r.sku) ?? []), JSON.parse(r.embedding)]);

  await clearDemoTickets();

  for (const spec of SPECS) {
    const id = `${ID_PREFIX}${String(spec.n).padStart(2, "0")}`;
    const created = minutesAgo(spec.minutes);
    const events: { type: string; actor: string; at: Date; detail?: object }[] = [{ type: "CREATED", actor: "store112", at: created, detail: { lane: "PHOTO_LANE" } }];
    const stamp = (offset: number) => new Date(created.getTime() + offset * 60_000);

    let selected: Candidate | null = null;
    const state = spec.state;

    const analysis: ClientAnalysis = buildAnalysis(spec, refIds);
    const built = buildExtraction(analysis);
    const extraction: Partial<MetadataExtraction> = { ...built, status: "completed", model_name: "clip-vit-base-patch32 + tesseract", prompt_version: "browser-v1" };
    const candidates: Candidate[] = buildCandidates(analysis, built.normalized_metadata, PRODUCTS);
    const { gating, reason: gatingReason } = gate(candidates, false);
    events.push({ type: "ANALYZED", actor: "system", at: stamp(1), detail: { gating, candidates: candidates.length } });

    if (spec.confirmed) {
      const p = bySku(spec.confirmed);
      selected = candidates.find((c) => c.key === spec.confirmed) ?? { key: p.sku, sku: p.sku, metadata: productMetadata(p), score: 0.96, evidence: "barcode", thumb: null };
      events.push({ type: "CONFIRMED", actor: "store112", at: stamp(3), detail: { sku: p.sku } });
    }

    let escalation: Escalation | null = null;
    let resolver: ResolverState | null = null;
    if (spec.escalation) {
      escalation = { reason: spec.escalation.reason, note: spec.escalation.note, item_age: spec.escalation.age, created_at: stamp(4).toISOString() };
      events.push({ type: "ESCALATED", actor: "store112", at: stamp(4), detail: { reason: spec.escalation.reason } });
    }
    if (spec.resolver) {
      const respondedAt = spec.resolver.respondedMinutesAgo !== undefined ? minutesAgo(spec.resolver.respondedMinutesAgo) : null;
      resolver = { ...spec.resolver, responded_at: respondedAt?.toISOString() ?? null };
      if (spec.resolver.status !== "NEW") events.push({ type: "CLAIMED", actor: "resolver1", at: stamp(10) });
      if (respondedAt) events.push({ type: "RESOLVED", actor: "resolver1", at: respondedAt, detail: { decision: spec.resolver.decision } });
    }
    if (spec.confirmed && spec.resolver) events.push({ type: "CONFIRMED", actor: "store112", at: stamp(5) });
    if (spec.print) events.push({ type: "PRINTED", actor: "store112", at: stamp(6), detail: spec.print });
    if (spec.tagAdded) events.push({ type: "NEW_TAG_ADDED", actor: "store112", at: stamp(8) });
    if (spec.disposition) events.push({ type: "DISPOSITION", actor: "store112", at: stamp(30), detail: { disposition: spec.disposition } });

    const hero = spec.sku;
    const images: { slot: string; path: string; name: string }[] = [];
    {
      if (hero) images.push({ slot: "front", path: `public/catalog/${hero}.jpg`, name: `${hero}-front.jpg` });
      if (spec.tag === "full" && hero) images.push({ slot: "tag", path: `public/catalog/tags/${hero}-tag.jpg`, name: `${hero}-tag.jpg` });
    }
    const thumb = hero ? dataUrl(`db/seed-assets/thumbs/${hero}.jpg`) : null;

    await client.query(
      `INSERT INTO incidents (id, number, store_id, capture_profile_id, current_state, metadata_job_id, image_count, analysis, embeddings, thumb,
                              gating, gating_reason, candidates, selected, item_age, escalation, resolver, extraction, unread_for_store, disposition, new_tag_added, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)`,
      [id, 9000 + spec.n, STORE_ID, "PHOTO_LANE", state, randomUUID(), images.length, JSON.stringify(analysis), JSON.stringify(hero ? embeddingsBySku.get(hero) ?? [] : []), thumb,
       gating, gatingReason, JSON.stringify(candidates), selected ? JSON.stringify(selected) : null, spec.escalation?.age ?? null, escalation ? JSON.stringify(escalation) : null, resolver ? JSON.stringify(resolver) : null, JSON.stringify(extraction), spec.unread ?? false, spec.disposition ?? null, spec.tagAdded ?? false, minutesAgo(Math.max(0, spec.minutes - 4))],
    );
    await client.query(`UPDATE incidents SET created_at = $2 WHERE id = $1`, [id, created]);

    for (let i = 0; i < images.length; i++) {
      const bytes = file(images[i].path);
      const sha = createHash("sha256").update(bytes).digest("hex");
      await client.query(`INSERT INTO incident_images (incident_id, position, slot, mime_type, sha256, data, capture) VALUES ($1,$2,$3,'image/jpeg',$4,$5,$6)`, [id, i, images[i].slot, sha, bytes.toString("base64"), JSON.stringify(capture(images[i].name, bytes.length, images[i].slot === "tag" ? 1200 : 900, sha))]);
    }
    for (const e of events) await client.query(`INSERT INTO incident_events (incident_id, type, actor, detail, created_at) VALUES ($1,$2,$3,$4,$5)`, [id, e.type, e.actor, JSON.stringify(e.detail ?? {}), e.at]);
    if (spec.print && selected?.metadata.Barcode) {
      await client.query(`INSERT INTO print_jobs (id, incident_id, store_id, upc, sku, printer, copies, status, message, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'accepted','Label sent to the printer',$8)`, [randomUUID(), id, STORE_ID, selected.metadata.Barcode, selected.sku, spec.print.printer, spec.print.copies, stamp(6)]);
    }
    console.log(`TK-${String(9000 + spec.n).padStart(6, "0")}  ${state.padEnd(28)} ${(gating ?? "").padEnd(10)} ${images.length} image(s)`);
  }

  await client.query("COMMIT");
  console.log(`\nSeeded ${SPECS.length} demo tickets for store ${STORE_ID}. Sign in as store112 / store123 or resolver1 / resolver123.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw err;
} finally {
  await client.end();
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
