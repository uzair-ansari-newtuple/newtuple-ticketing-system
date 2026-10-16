import { NextResponse } from "next/server";
import { authorizeConnector, incidentIdFrom, runIdentify } from "@/lib/sm/stages";

export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const id = await incidentIdFrom(request);
  if (id instanceof NextResponse) return id;
  const result = await runIdentify(id);
  return result ? NextResponse.json(result) : NextResponse.json({ detail: "Ticket not found" }, { status: 404 });
}
