import { NextResponse } from "next/server";

/**
 * GET /api/health — Liveness / readiness probe for Docker & orchestrators.
 * Returns 200 with basic status info.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
