import type { Pool, PoolClient } from "pg";
import { formatPrice, type Product } from "@/data/catalog";

interface ProductRow {
  sku: string;
  upc: string;
  name: string;
  brand: string;
  class_code: string;
  color_code: string;
  price_cents: number;
}

const COLUMNS = "sku, upc, name, brand, class_code, color_code, price_cents";
const toProduct = (r: ProductRow): Product => ({ sku: r.sku, upc: r.upc, name: r.name, brand: r.brand, classCode: r.class_code, colorCode: r.color_code, price: formatPrice(r.price_cents) });

type Db = Pool | PoolClient;

export async function listProducts(db: Db): Promise<Product[]> {
  const { rows } = await db.query<ProductRow>(`SELECT ${COLUMNS} FROM products WHERE active ORDER BY sku`);
  return rows.map(toProduct);
}

export async function getProductByUpc(db: Db, upc: string): Promise<Product | null> {
  const { rows } = await db.query<ProductRow>(`SELECT ${COLUMNS} FROM products WHERE active AND upc = $1`, [upc]);
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function getProductBySku(db: Db, sku: string): Promise<Product | null> {
  const { rows } = await db.query<ProductRow>(`SELECT ${COLUMNS} FROM products WHERE active AND sku = $1`, [sku]);
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function searchProducts(db: Db, q: string, limit = 20): Promise<Product[]> {
  const like = `%${q.trim().toLowerCase()}%`;
  const { rows } = await db.query<ProductRow>(
    `SELECT ${COLUMNS} FROM products WHERE active AND (lower(name) LIKE $1 OR lower(brand) LIKE $1 OR lower(sku) LIKE $1 OR upc LIKE $1) ORDER BY name LIMIT $2`,
    [like, limit],
  );
  return rows.map(toProduct);
}
