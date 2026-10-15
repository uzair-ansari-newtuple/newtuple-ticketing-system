/**
 * Seeds Neon with the product catalog: the products, their photos and the image vectors used to match photos to products.
 * Tickets, photos taken by stores and users all live in the State Machine, so nothing here creates them.
 *
 *   npm run db:seed                 add or refresh the catalog
 *   npm run db:seed -- --embeddings recompute every catalog image vector
 *
 * Run `npm run db:migrate` first. Product photos come from public/catalog/<SKU>.jpg and products from db/seed/products.json.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { productImageUrl, productMetadata, type Product } from "@/data/catalog";

process.loadEnvFile(".env");

const PRODUCTS: Product[] = JSON.parse(readFileSync("db/seed/products.json", "utf8"));
const MODEL = "Xenova/clip-vit-base-patch32";
const toVector = (v: number[]) => `[${v.join(",")}]`;
const file = (path: string) => readFileSync(path);

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  await client.connect();
  try {
    await client.query("BEGIN");
    // The catalog is exactly the products in the seed file. Anything else from an earlier seed is removed, with its photos and vectors.
    const skus = PRODUCTS.map((p) => p.sku);
    await client.query(`DELETE FROM reference_items WHERE kind = 'catalog' AND sku <> ALL($1::text[])`, [skus]);
    await client.query(`DELETE FROM products WHERE sku <> ALL($1::text[])`, [skus]);
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

    await client.query("COMMIT");
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
