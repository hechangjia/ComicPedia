import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ComicPedia - AI 漫画生成器",
  description: "AI 驱动的漫画生成工具：科普、诗词、小说、小红书图文",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ComicPedia",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isShowcase = process.env.SHOWCASE_MODE === "true";

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>
          {/* Skip to content link — keyboard accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm"
          >
            跳转到主内容
          </a>

          {/* 导航栏 */}
          <nav className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 no-print" aria-label="主导航">
            <div className="container mx-auto px-4 h-14 flex items-center justify-between">
              {/* Logo */}
              <Link href={isShowcase ? "/gallery" : "/"} className="flex items-center gap-2 font-bold text-lg group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <span className="hidden sm:inline bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                  ComicPedia{isShowcase ? " Gallery" : ""}
                </span>
              </Link>

              {/* 导航链接 */}
              <div className="flex items-center gap-2 sm:gap-4">
                <Link
                  href="/gallery"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                  aria-label="作品库"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden sm:inline">作品</span>
                </Link>
                <Link
                  href="/characters"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                  aria-label="角色库"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="hidden sm:inline">角色</span>
                </Link>
                <Link
                  href="/series"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                  aria-label="连载系列"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="hidden sm:inline">连载</span>
                </Link>
                {!isShowcase && (
                  <>
                    <Link
                      href="/history"
                      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                      aria-label="历史记录"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="hidden sm:inline">历史记录</span>
                    </Link>
                    <Link
                      href="/settings"
                      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                      aria-label="设置"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="hidden sm:inline">设置</span>
                    </Link>
                  </>
                )}
                <ThemeToggle />
              </div>
            </div>
          </nav>

          {/* 主内容 */}
          <main id="main-content" className="container mx-auto px-4 py-6 sm:py-8" role="main">
            <GlobalErrorBoundary>
              {children}
            </GlobalErrorBoundary>
          </main>
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
