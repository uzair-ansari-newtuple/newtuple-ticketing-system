import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public on purpose: product photos are shown in <img> tags, which cannot send an Authorization header. */
export async function GET(_request: Request, ctx: RouteContext<"/api/mock/products/[sku]/image">) {
  const { sku } = await ctx.params;
  const { rows } = await getPool().query<{ mime_type: string; data: string }>(`SELECT mime_type, data FROM product_images WHERE sku = $1 ORDER BY position LIMIT 1`, [sku]);
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(rows[0].data, "base64"), { headers: { "Content-Type": rows[0].mime_type, "Cache-Control": "public, max-age=3600" } });
}
