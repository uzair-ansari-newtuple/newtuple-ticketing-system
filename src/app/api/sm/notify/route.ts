import { NextResponse } from "next/server";
import { isNotifyEvent, notifyFor } from "@/lib/sm/actions";
import { authorizeConnector, incidentIdFrom } from "@/lib/sm/stages";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const clone = request.clone();
  const id = await incidentIdFrom(request);
  if (id instanceof NextResponse) return id;
  const body = (await clone.json().catch(() => ({}))) as { event?: string; message?: string };
  if (!isNotifyEvent(body.event)) return NextResponse.json({ detail: "event must be one of TICKET_ESCALATED, RESOLUTION_SENT, L2_ESCALATED, NEW_COMMENT" }, { status: 422 });
  const result = await notifyFor(id, body.event, body.message);
  return NextResponse.json(result.body, { status: result.status });
}
