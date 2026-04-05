"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Image, Users, Settings } from "lucide-react";

const TABS = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/create", icon: PlusCircle, label: "创建" },
  { href: "/gallery", icon: Image, label: "作品" },
  { href: "/characters", icon: Users, label: "角色" },
  { href: "/settings", icon: Settings, label: "设置" },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 sm:hidden border-t border-border bg-surface/95 dark:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 dark:supports-[backdrop-filter]:bg-background/80 no-print" aria-label="移动端导航">
      <div className="flex items-center justify-around h-14 px-2">
        {TABS.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 w-14 h-12 rounded-lg transition-colors ${
                isActive
                  ? "text-teal"
                  : "text-muted-foreground hover:text-secondary-text"
              }`}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
