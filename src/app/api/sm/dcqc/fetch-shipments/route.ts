import { NextResponse } from "next/server";
import { fetchShipments } from "@/lib/qc/sm";
import { authorizeConnector } from "@/lib/sm/stages";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await fetchShipments()) });
}
