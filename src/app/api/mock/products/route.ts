import { NextResponse } from "next/server";
import { formatPrice, productImageUrl, productMetadata } from "@/data/catalog";
import { getPool, toVector } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { searchProducts } from "@/lib/mock/products";
import { CLASSES, COLORS, isValidGtin, normalizeGtin } from "@/lib/taxonomy";

const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_000_000;
const EMBEDDING_DIM = 512;
const MAX_PRICE_CENTS = 1_000_000;

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const url = new URL(request.url);
  const pool = getPool();
  const products = await searchProducts(pool, url.searchParams.get("q") ?? "", 200);
  const embedded = await pool.query<{ sku: string }>(`SELECT i.sku FROM reference_items i WHERE i.kind = 'catalog' AND EXISTS (SELECT 1 FROM reference_embeddings e WHERE e.item_id = i.id)`);
  const withVectors = new Set(embedded.rows.map((r) => r.sku));
  return NextResponse.json({
    items: products.map((p) => ({ ...productMetadata(p), image_url: productImageUrl(p.sku), searchable: withVectors.has(p.sku) })),
  });
}

interface CreateBody {
  name?: string;
  brand?: string;
  upc?: string;
  class_code?: string;
  color_code?: string;
  price?: number;
  images?: { mime_type: string; image_base64: string }[];
  embeddings?: number[][];
}

/** Adds a product with photos. The browser computes the photo embeddings; the database stores them for vector search. */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body?.name?.trim() || !body.brand?.trim()) return jsonError(422, "Name and brand are required");
  const upc = normalizeGtin(String(body.upc ?? "").replace(/\s/g, ""));
  if (!isValidGtin(upc)) return jsonError(422, "The barcode is not valid. Check the digits.");
  if (!CLASSES.some((c) => c.code === body.class_code)) return jsonError(422, "Choose a category");
  if (!COLORS.some((c) => c.code === body.color_code)) return jsonError(422, "Choose a color");
  const cents = Math.round(Number(body.price) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > MAX_PRICE_CENTS) return jsonError(422, "Enter a valid price");
  const images = body.images ?? [];
  const embeddings = body.embeddings ?? [];
  if (!images.length || images.length > MAX_IMAGES || images.length !== embeddings.length) return jsonError(422, `Add 1 to ${MAX_IMAGES} photos`);
  if (images.some((i) => i.mime_type !== "image/jpeg" || i.image_base64.length > MAX_IMAGE_CHARS)) return jsonError(422, "Photos must be JPEG images under 1.5 MB");
  if (embeddings.some((e) => e.length !== EMBEDDING_DIM)) return jsonError(422, `Embeddings must be ${EMBEDDING_DIM}-dimensional`);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const seq = await client.query<{ n: string }>(`SELECT nextval('product_sku_seq') AS n`);
    const sku = `SKU-${seq.rows[0].n}`;
    const inserted = await client.query(`INSERT INTO products (sku, upc, name, brand, class_code, color_code, price_cents) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (upc) DO NOTHING RETURNING sku`, [sku, upc, body.name.trim(), body.brand.trim(), body.class_code, body.color_code, cents]);
    if (!inserted.rowCount) {
      await client.query("ROLLBACK");
      return jsonError(409, "A product with this barcode already exists");
    }
    const metadata = productMetadata({ sku, upc, name: body.name.trim(), brand: body.brand.trim(), classCode: body.class_code!, colorCode: body.color_code!, price: formatPrice(cents) });
    const item = await client.query<{ id: string }>(`INSERT INTO reference_items (id, kind, sku, metadata, thumb) VALUES (gen_random_uuid(), 'catalog', $1, $2, $3) RETURNING id`, [sku, JSON.stringify(metadata), productImageUrl(sku)]);
    for (let i = 0; i < images.length; i++) {
      await client.query(`INSERT INTO product_images (sku, position, mime_type, data) VALUES ($1, $2, $3, $4)`, [sku, i, images[i].mime_type, images[i].image_base64]);
      await client.query(`INSERT INTO reference_embeddings (item_id, embedding) VALUES ($1, $2::vector)`, [item.rows[0].id, toVector(embeddings[i])]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ sku }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
