import { NextResponse } from "next/server";
import { recordIdFrom } from "@/lib/qc/connector";
import { notifyQc } from "@/lib/qc/sm";
import { authorizeConnector } from "@/lib/sm/stages";

const EVENTS = ["QC_STARTED", "QC_COMPLETE", "RECEIPT_CLOSED", "UPC_FLAGGED"];

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const parsed = await recordIdFrom(request);
  if (parsed instanceof NextResponse) return parsed;
  const event = String(parsed.body.event ?? "");
  if (!EVENTS.includes(event)) return NextResponse.json({ detail: `event must be one of ${EVENTS.join(", ")}` }, { status: 422 });
  const result = await notifyQc(parsed.id, event);
  return NextResponse.json(result.body, { status: result.status });
}
