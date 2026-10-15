import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool, toVector } from "@/lib/db";
import { jsonError, userFromRequest } from "@/lib/mock/http";
import { loadRow } from "@/lib/mock/incidents";
import { embedImage } from "@/lib/ml/clip";
import { downloadPhoto, listPhotos } from "@/lib/sm/records";

const TEXT_SLOTS = ["tag", "label"];

/** Saves a ticket's item to the reference library so the next photo of it matches. The image vectors are made here from the ticket's photos. */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (user?.role !== "store" || !user.store_id) return jsonError(401, "Could not validate credentials");
  const body = (await request.json().catch(() => null)) as { incident_id?: string } | null;
  const row = body?.incident_id ? await loadRow(body.incident_id, user) : null;
  if (!row) return jsonError(404, "Ticket not found");
  const metadata = row.extraction?.normalized_metadata;
  if (!metadata || !row.thumb) return jsonError(422, "This ticket has no item details to save yet");

  const files = (await listPhotos(row.id)).filter((f) => !TEXT_SLOTS.includes(String(f.metadata.slot)));
  if (!files.length) return jsonError(422, "This ticket has no item photos to save");
  const embeddings: number[][] = [];
  for (const f of files) embeddings.push(await embedImage(new Blob([new Uint8Array(await downloadPhoto(f.file_id))], { type: f.content_type })));

  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO reference_items (id, kind, store_id, metadata, thumb) VALUES ($1, 'user', $2, $3, $4)`, [id, user.store_id, JSON.stringify(metadata), row.thumb]);
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
