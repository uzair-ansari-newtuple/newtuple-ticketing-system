import { randomUUID } from "node:crypto";
import { formatPrice, productImageUrl, productMetadata, type Product } from "@/data/catalog";
import type { MatchCandidate, NormalizedMetadata } from "@/lib/types";
import { smDownload, smFetch, smUpload } from "./client";
import { createRecord, deleteRecord, enroll, listTickets, putRecord } from "./records";

export const CATALOG_ENTITY_TYPE = "catalog_product";
export const CATALOG_PHOTO_TYPE = "product_photo";
export const catalogMachine = () => process.env.SM_CATALOG_MACHINE_NAME ?? "workflow_xdcauuj7_hnd6zp";

const PAGE = 200;
const TTL_MS = 60_000;
const PER_QUERY = 5;
const TOP_MATCHES = 3;
const FIELDS = ["sku", "upc", "name", "brand", "class_code", "color_code", "price_cents", "active", "kind", "store_id", "metadata", "thumb", "embeddings"];

interface Entry {
  id: string;
  sku: string;
  kind: "catalog" | "user";
  storeId: string;
  active: boolean;
  product: Product;
  metadata: NormalizedMetadata;
  thumb: string;
  embeddings: number[][];
}

const globalCache = globalThis as unknown as { __catalog?: { at: number; entries: Promise<Entry[]> } };
const invalidate = () => {
  globalCache.__catalog = undefined;
};

const parse = <T>(value: unknown, fallback: T): T => {
  try {
    return typeof value === "string" && value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

async function fetchAll(): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await listTickets({ fields: FIELDS, machine: catalogMachine(), entityType: CATALOG_ENTITY_TYPE, limit: PAGE, offset });
    for (const { id, fields: f } of page.items) {
      const kind = f.kind === "user" ? "user" : "catalog";
      const product: Product = {
        sku: String(f.sku ?? ""),
        upc: String(f.upc ?? ""),
        name: String(f.name ?? ""),
        brand: String(f.brand ?? ""),
        classCode: String(f.class_code ?? ""),
        colorCode: String(f.color_code ?? ""),
        price: formatPrice(Number(f.price_cents ?? 0)),
      };
      entries.push({
        id,
        sku: product.sku,
        kind,
        storeId: String(f.store_id ?? ""),
        active: f.active !== "false",
        product,
        metadata: parse<NormalizedMetadata>(f.metadata, productMetadata(product)),
        thumb: String(f.thumb ?? ""),
        embeddings: parse<number[][]>(f.embeddings, []),
      });
    }
    if (page.items.length < PAGE) return entries;
  }
}

/** Every catalog item, cached for a minute. Writes through this module clear the cache. */
function load(): Promise<Entry[]> {
  const cached = globalCache.__catalog;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.entries;
  const entries = fetchAll().catch((err) => {
    globalCache.__catalog = undefined;
    throw err;
  });
  globalCache.__catalog = { at: Date.now(), entries };
  return entries;
}

const products = async () => (await load()).filter((e) => e.kind === "catalog" && e.active);

export async function listProducts(): Promise<Product[]> {
  return (await products()).map((e) => e.product).sort((a, b) => a.sku.localeCompare(b.sku));
}

export async function getProductByUpc(upc: string): Promise<Product | null> {
  return (await products()).find((e) => e.product.upc === upc)?.product ?? null;
}

export async function getProductBySku(sku: string): Promise<Product | null> {
  return (await products()).find((e) => e.sku === sku)?.product ?? null;
}

export async function searchProducts(q: string, limit = 20): Promise<{ product: Product; searchable: boolean }[]> {
  const needle = q.trim().toLowerCase();
  return (await products())
    .filter((e) => !needle || [e.product.name, e.product.brand, e.sku].some((v) => v.toLowerCase().includes(needle)) || e.product.upc.includes(needle))
    .sort((a, b) => a.product.name.localeCompare(b.product.name))
    .slice(0, limit)
    .map((e) => ({ product: e.product, searchable: e.embeddings.length > 0 }));
}

const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);

/** Finds the closest catalog and store-saved items to each photo embedding, and lists the brands the library knows. */
export async function searchLibrary(storeId: string, queries: number[][]): Promise<{ matches: MatchCandidate[]; brands: string[] }> {
  const visible = (await load()).filter((e) => e.active && (e.kind === "catalog" || e.storeId === storeId));
  const best = new Map<string, { entry: Entry; similarity: number }>();
  for (const q of queries) {
    const scored: { entry: Entry; similarity: number }[] = [];
    for (const entry of visible) for (const e of entry.embeddings) scored.push({ entry, similarity: dot(q, e) });
    scored.sort((a, b) => b.similarity - a.similarity);
    for (const hit of scored.slice(0, PER_QUERY)) {
      const current = best.get(hit.entry.id);
      if (!current || hit.similarity > current.similarity) best.set(hit.entry.id, hit);
    }
  }
  const matches = [...best.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_MATCHES)
    .map<MatchCandidate>(({ entry, similarity }) => ({ reference_id: entry.id, similarity, metadata: entry.metadata, thumb: entry.thumb }));
  const brands = [...new Set(visible.map((e) => e.metadata.Brand).filter((b): b is string => Boolean(b)))];
  return { matches, brands };
}

/** Saves a store's item so the next photo of it matches. */
export async function addUserItem(storeId: string, metadata: NormalizedMetadata, thumb: string, embeddings: number[][]): Promise<string> {
  const sku = `user-${randomUUID()}`;
  const record = await createRecord(CATALOG_ENTITY_TYPE, {
    identifier: sku,
    sku,
    kind: "user",
    active: "true",
    store_id: storeId,
    name: String(metadata.ProductName ?? "Store item"),
    metadata: JSON.stringify(metadata),
    thumb,
    embeddings: JSON.stringify(embeddings),
  });
  await enroll(record.id, catalogMachine());
  invalidate();
  return record.id;
}

export interface CatalogInput {
  product: Product;
  embeddings: number[][];
}

/** Creates or refreshes a catalog product, and replaces its photo. Used by the import script. */
export async function upsertProduct({ product: p, embeddings }: CatalogInput, photo: Buffer): Promise<"created" | "updated"> {
  invalidate();
  const existing = (await fetchAll()).find((e) => e.sku === p.sku && e.kind === "catalog");
  const data = {
    identifier: p.sku,
    sku: p.sku,
    upc: p.upc,
    name: p.name,
    brand: p.brand,
    class_code: p.classCode,
    color_code: p.colorCode,
    price_cents: Math.round(parseFloat(p.price.replace("$", "")) * 100),
    active: "true",
    kind: "catalog",
    metadata: JSON.stringify(productMetadata(p)),
    thumb: productImageUrl(p.sku),
    embeddings: JSON.stringify(embeddings),
  };
  const id = existing ? (await putRecord(existing.id, data), existing.id) : (await createRecord(CATALOG_ENTITY_TYPE, data)).id;
  if (!existing) await enroll(id, catalogMachine());
  const old = await smFetch<{ items: { file_id: string }[] }>("POST", "/filehandler/list", { owner_entity_id: id, type_id: CATALOG_PHOTO_TYPE });
  for (const f of old.items) await smFetch("DELETE", `/filehandler/${f.file_id}`);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), `${p.sku}.jpg`);
  const query = new URLSearchParams({ type_id: CATALOG_PHOTO_TYPE, owner_entity_id: id, owner_entity_type: CATALOG_ENTITY_TYPE, metadata: JSON.stringify({ sku: p.sku }) });
  await smUpload(`/filehandler/upload?${query}`, form);
  invalidate();
  return existing ? "updated" : "created";
}

/** Removes catalog products that are not in the given SKU list. */
export async function pruneProducts(keep: string[]): Promise<number> {
  const stale = (await fetchAll()).filter((e) => e.kind === "catalog" && !keep.includes(e.sku));
  for (const e of stale) await deleteRecord(e.id);
  invalidate();
  return stale.length;
}

export async function productPhoto(sku: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const entry = (await load()).find((e) => e.sku === sku);
  if (!entry) return null;
  const { items } = await smFetch<{ items: { file_id: string; content_type: string }[] }>("POST", "/filehandler/list", { owner_entity_id: entry.id, type_id: CATALOG_PHOTO_TYPE, limit: 1 });
  if (!items[0]) return null;
  const { bytes } = await smDownload(`/filehandler/${items[0].file_id}/download`);
  return { bytes, mime: items[0].content_type || "image/jpeg" };
}
