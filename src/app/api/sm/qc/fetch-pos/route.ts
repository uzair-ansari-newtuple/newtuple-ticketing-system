import { NextResponse } from "next/server";
import { fetchPurchaseOrders } from "@/lib/qc/sm";
import { authorizeConnector } from "@/lib/sm/stages";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const result = await fetchPurchaseOrders();
  return NextResponse.json({ ok: true, ...result });
}
