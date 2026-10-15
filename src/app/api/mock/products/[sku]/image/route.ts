import { productPhoto } from "@/lib/sm/catalog";

export const dynamic = "force-dynamic";

/** Public on purpose: product photos are shown in <img> tags, which cannot send an Authorization header. */
export async function GET(_request: Request, ctx: RouteContext<"/api/mock/products/[sku]/image">) {
  const { sku } = await ctx.params;
  const photo = await productPhoto(sku);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.mime, "Cache-Control": "public, max-age=3600" } });
}
