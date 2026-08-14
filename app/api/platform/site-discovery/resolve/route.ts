import { NextResponse, type NextRequest } from "next/server";
import { runSmartWebsiteDiscovery } from "@/lib/audit/v1/smart-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/site-discovery/resolve
 * Fast, bounded website crawl & discovery endpoint.
 * Returns explicit state machine status (IDLE, VALIDATING, FETCHING, DISCOVERING, EXTRACTING, COMPLETE, PARTIAL, FAILED, TIMEOUT).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { websiteUrl?: unknown };
    const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";

    if (!websiteUrl) {
      return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
    }

    const result = await runSmartWebsiteDiscovery(websiteUrl);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website discovery failed";
    return NextResponse.json(
      {
        operationId: `disc_err_${Date.now()}`,
        finalState: "FAILED",
        isSuccess: false,
        isPartial: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
