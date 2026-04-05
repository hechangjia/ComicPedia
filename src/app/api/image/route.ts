import { NextRequest, NextResponse } from "next/server";
import { forwardImageGenerationRequest, ImageGenerationServiceError } from "@/lib/server/imageGenerationService";

/**
 * Image generation API proxy route.
 * Forwards requests to external image generation APIs (bypasses browser CORS).
 * Includes SSRF protection, timeout control, response size limits, error sanitization.
 * Post-processes responses to convert external image URLs to base64 data URIs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUrl, headers: clientHeaders, payload } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing targetUrl" }, { status: 400 });
    }

    const result = await forwardImageGenerationRequest({
      targetUrl,
      headers: clientHeaders,
      payload,
    });

    if (typeof result === "string") {
      return new NextResponse(result, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImageGenerationServiceError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status },
      );
    }

    console.error("[Image Proxy] Error:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Request timeout, please try again" }, { status: 504 });
    }

    return NextResponse.json(
      { error: "Proxy request failed" },
      { status: 500 },
    );
  }
}
