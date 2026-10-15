import { NextResponse } from "next/server";
import { syncResolver } from "@/lib/sm/actions";
import { authorizeConnector, incidentIdFrom } from "@/lib/sm/stages";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const id = await incidentIdFrom(request);
  if (id instanceof NextResponse) return id;
  const result = await syncResolver(id);
  return NextResponse.json(result.body, { status: result.status });
}
