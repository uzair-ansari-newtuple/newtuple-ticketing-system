import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool, toVector } from "@/lib/db";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import type { NormalizedMetadata } from "@/lib/types";

const EMBEDDING_DIM = 512;
const MAX_EMBEDDINGS = 5;

export async function POST(request: Request) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { metadata?: NormalizedMetadata; thumb?: string; embeddings?: number[][] } | null;
  const embeddings = body?.embeddings;
  if (!body?.metadata || !body.thumb) return jsonError(422, "metadata and thumb are required");
  if (!embeddings?.length || embeddings.length > MAX_EMBEDDINGS || embeddings.some((e) => e.length !== EMBEDDING_DIM)) {
    return jsonError(422, `embeddings must be 1 to ${MAX_EMBEDDINGS} vectors of ${EMBEDDING_DIM} numbers`);
  }

  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO reference_items (id, kind, store_id, metadata, thumb) VALUES ($1, 'user', $2, $3, $4)`, [id, storeId, JSON.stringify(body.metadata), body.thumb]);
    for (const e of embeddings) await client.query(`INSERT INTO reference_embeddings (item_id, embedding) VALUES ($1, $2::vector)`, [id, toVector(e)]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return NextResponse.json({ id }, { status: 201 });
}
