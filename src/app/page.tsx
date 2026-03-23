"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FormLayout } from "@/components/FormLayout";

export default function HomePage() {
  const router = useRouter();
  const isShowcaseMode = process.env.NEXT_PUBLIC_SHOWCASE_MODE === "true";

  useEffect(() => {
    if (isShowcaseMode) {
      router.replace("/gallery");
    }
  }, [isShowcaseMode, router]);

  if (isShowcaseMode) return null;
  return (
    <Suspense>
      <FormLayout defaultTab="wikipedia" />
    </Suspense>
  );
}
