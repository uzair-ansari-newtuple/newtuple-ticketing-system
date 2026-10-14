import { NextResponse } from "next/server";
import { authorizeConnector, incidentIdFrom, runAnalyze } from "@/lib/sm/stages";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const id = await incidentIdFrom(request);
  if (id instanceof NextResponse) return id;
  const result = await runAnalyze(id);
  return result ? NextResponse.json(result) : NextResponse.json({ detail: "Ticket not found" }, { status: 404 });
}
