/**
 * Loads the product catalog into the State Machine: the products, their photos and the image vectors used to match photos.
 *
 *   npm run catalog            add or refresh the catalog
 *
 * Run `node scripts/sm-data.mjs` first. Products come from data/products.json and photos from public/catalog/<SKU>.jpg.
 */
import { readFileSync } from "node:fs";
import type { Product } from "@/data/catalog";

process.loadEnvFile(".env");

async function main() {
  const { embedImage } = await import("@/lib/ml/clip");
  const { pruneProducts, upsertProduct } = await import("@/lib/sm/catalog");
  const products: Product[] = JSON.parse(readFileSync("data/products.json", "utf8"));
  for (const p of products) {
    const photo = readFileSync(`public/catalog/${p.sku}.jpg`);
    const vector = await embedImage(new Blob([new Uint8Array(photo)], { type: "image/jpeg" }));
    const embeddings = [vector.map((x) => Math.round(x * 1e4) / 1e4)];
    console.log(`${await upsertProduct({ product: p, embeddings }, photo)}  ${p.sku}  ${p.name}`);
  }
  console.log(`removed ${await pruneProducts(products.map((p) => p.sku))} stale products`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
