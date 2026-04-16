"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect legacy /trash URL to /history with trash tab */
export default function TrashRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/history?tab=trash");
  }, [router]);
  return null;
}
