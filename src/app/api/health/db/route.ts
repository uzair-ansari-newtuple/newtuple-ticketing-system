import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await getPool().query(
      `SELECT now() AS server_time, current_database() AS database,
              (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector`,
    );
    return NextResponse.json({ ok: true, ...rows[0] });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unreachable" }, { status: 503 });
  }
}
