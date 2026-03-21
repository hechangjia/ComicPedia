"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PoetryRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?mode=poetry");
  }, [router]);

  return null;
}
