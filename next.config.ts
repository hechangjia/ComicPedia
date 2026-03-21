import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  env: {
    // 展示模式：服务端 SHOWCASE_MODE → 客户端 NEXT_PUBLIC_SHOWCASE_MODE
    NEXT_PUBLIC_SHOWCASE_MODE: process.env.SHOWCASE_MODE || "false",
  },
  experimental: {
    middlewareClientMaxBodySize: 104857600, // 100MB — 角色 API 需传输含 base64 图片的大型请求体
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
