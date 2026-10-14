import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, storeIdFromRequest } from "@/lib/mock/http";
import { searchLibrary } from "@/lib/mock/library";

const EMBEDDING_DIM = 512;

export async function POST(request: Request) {
  const storeId = await storeIdFromRequest(request);
  if (!storeId) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { embeddings?: number[][] } | null;
  const queries = body?.embeddings;
  if (!queries?.length || queries.some((q) => q.length !== EMBEDDING_DIM)) return jsonError(422, `embeddings must be ${EMBEDDING_DIM}-dimensional vectors`);

  return NextResponse.json(await searchLibrary(getPool(), storeId, queries));
}
