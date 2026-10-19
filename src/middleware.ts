import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 中间件：注入安全响应头。
 * 覆盖所有页面和 API 路由（排除静态资源）。
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
  // Blob images are generated locally by export previews; keep other directives unchanged.
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; connect-src 'self' http: https:; font-src 'self';",
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|output/).*)"],
};
