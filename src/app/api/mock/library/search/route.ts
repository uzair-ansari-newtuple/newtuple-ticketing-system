import { NextResponse } from "next/server";
import { getPool, toVector } from "@/lib/db";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import type { MatchCandidate, NormalizedMetadata } from "@/lib/types";

const PER_QUERY = 5;
const TOP_MATCHES = 3;
const EMBEDDING_DIM = 512;

interface Row {
  id: string;
  metadata: NormalizedMetadata;
  thumb: string;
  similarity: number;
}

export async function POST(request: Request) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { embeddings?: number[][] } | null;
  const queries = body?.embeddings;
  if (!queries?.length || queries.some((q) => q.length !== EMBEDDING_DIM)) return jsonError(422, `embeddings must be ${EMBEDDING_DIM}-dimensional vectors`);

  const pool = getPool();
  const best = new Map<string, Row>();
  for (const q of queries) {
    const { rows } = await pool.query<Row>(
      `SELECT i.id, i.metadata, i.thumb, 1 - (e.embedding <=> $1::vector) AS similarity
       FROM reference_embeddings e
       JOIN reference_items i ON i.id = e.item_id
       WHERE i.kind = 'catalog' OR i.store_id = $2
       ORDER BY e.embedding <=> $1::vector
       LIMIT $3`,
      [toVector(q), storeId, PER_QUERY],
    );
    for (const row of rows) {
      const similarity = Number(row.similarity);
      const current = best.get(row.id);
      if (!current || similarity > current.similarity) best.set(row.id, { ...row, similarity });
    }
  }

  const matches: MatchCandidate[] = [...best.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_MATCHES)
    .map((r) => ({ reference_id: r.id, similarity: r.similarity, metadata: r.metadata, thumb: r.thumb }));

  const brands = await pool.query<{ brand: string }>(
    `SELECT DISTINCT metadata->>'Brand' AS brand FROM reference_items
     WHERE (kind = 'catalog' OR store_id = $1) AND metadata->>'Brand' IS NOT NULL`,
    [storeId],
  );
  return NextResponse.json({ matches, brands: brands.rows.map((b) => b.brand) });
}
