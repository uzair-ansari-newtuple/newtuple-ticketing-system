import { NextResponse } from "next/server";
import { productImageUrl, productMetadata } from "@/data/catalog";
import { getPool } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { searchProducts } from "@/lib/mock/products";


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
