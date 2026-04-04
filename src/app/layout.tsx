import type { Metadata, Viewport } from "next";
import { DM_Sans, Noto_Sans_SC, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ToastProvider } from "@/components/ui/Toast";
import Link from "next/link";
import { BookImage, Image, Users, Library, Clock, Settings } from "lucide-react";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
  themeColor: "#3d8b84",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isShowcase = process.env.NEXT_PUBLIC_SHOWCASE_MODE === "true";

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`min-h-screen bg-background antialiased ${dmSans.variable} ${notoSansSC.variable} ${jetbrainsMono.variable}`}>
        <ThemeProvider>
          <ToastProvider>
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
                <div className="w-8 h-8 rounded-lg bg-[#3d8b84] flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                  <BookImage className="w-5 h-5 text-white" />
                </div>
                <span className="hidden sm:inline text-[#3d8b84] dark:text-[#5cb8ae]">
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
                  <Image className="w-4 h-4" />
                  <span className="hidden sm:inline">作品</span>
                </Link>
                <Link
                  href="/characters"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                  aria-label="角色库"
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">角色</span>
                </Link>
                <Link
                  href="/series"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                  aria-label="连载系列"
                >
                  <Library className="w-4 h-4" />
                  <span className="hidden sm:inline">连载</span>
                </Link>
                {!isShowcase && (
                  <>
                    <Link
                      href="/history"
                      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                      aria-label="历史记录"
                    >
                      <Clock className="w-4 h-4" />
                      <span className="hidden sm:inline">历史记录</span>
                    </Link>
                    <Link
                      href="/settings"
                      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 min-h-[44px]"
                      aria-label="设置"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="hidden sm:inline">设置</span>
                    </Link>
                  </>
                )}
                <ThemeToggle />
              </div>
            </div>
          </nav>

          {/* 主内容 */}
          <main id="main-content" className="container mx-auto px-4 py-6 sm:py-8 pb-20 sm:pb-8" role="main">
              <GlobalErrorBoundary>
                {children}
              </GlobalErrorBoundary>
          </main>
          <BottomTabBar />
          <ServiceWorkerRegistrar />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
