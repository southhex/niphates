// POST /api/hermes/logout
// Clear the stored session cookie. The Settings UI calls this on LOGOUT, and
// hermesFetch also calls it internally when it sees a 401.

import { clearHermesCookie, toPublicConnection } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const next = await clearHermesCookie();
  return Response.json({ ok: true, connection: toPublicConnection(next) });
}
