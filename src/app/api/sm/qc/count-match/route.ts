import { NextResponse } from "next/server";
import { recordIdFrom } from "@/lib/qc/connector";
import { matchLineCount } from "@/lib/qc/sm";
import { authorizeConnector } from "@/lib/sm/stages";

export async function POST(request: Request) {
  const denied = authorizeConnector(request);
  if (denied) return denied;
  const parsed = await recordIdFrom(request);
  if (parsed instanceof NextResponse) return parsed;
  const result = await matchLineCount(parsed.id);
  return NextResponse.json(result.body, { status: result.status });
}
