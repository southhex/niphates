// Sanctum folder listing: GET /api/sanctum/folders?connectorId=<id>
// Returns subdirectories of the connector's vault root for the folder picker.

import { NextRequest } from "next/server";
import { listFolders } from "@/lib/sanctum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connectorId = req.nextUrl.searchParams.get("connectorId") || "";
  if (!connectorId) {
    return Response.json({ error: "connectorId query param required" }, { status: 400 });
  }
  const folders = await listFolders(connectorId);
  return Response.json({ folders });
}
