import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("export preview image policy", () => {
  it("allows generated blob previews only as images while retaining other security headers", () => {
    const response = middleware(new NextRequest("http://localhost:3000/result/synthetic"));
    const policy = response.headers.get("Content-Security-Policy")!;
    const directives = policy.split(";").map(value => value.trim());
    expect(directives.find(value => value.startsWith("img-src "))?.split(/\s+/)).toContain("blob:");
    expect(directives.find(value => value.startsWith("script-src "))?.split(/\s+/)).not.toContain("blob:");
    expect(directives.find(value => value.startsWith("connect-src "))?.split(/\s+/)).not.toContain("blob:");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
