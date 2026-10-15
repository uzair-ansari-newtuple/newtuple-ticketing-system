import { NextResponse } from "next/server";
import { productImageUrl, productMetadata } from "@/data/catalog";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { searchProducts } from "@/lib/sm/catalog";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Could not validate credentials");
  const products = await searchProducts(new URL(request.url).searchParams.get("q") ?? "", 200);
  return NextResponse.json({
    items: products.map(({ product, searchable }) => ({ ...productMetadata(product), image_url: productImageUrl(product.sku), searchable })),
  });
}
