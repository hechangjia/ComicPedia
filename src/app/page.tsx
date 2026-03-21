"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormLayout } from "@/components/FormLayout";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SHOWCASE_MODE === "true") {
      router.replace("/gallery");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;
  return (
    <Suspense>
      <FormLayout defaultTab="wikipedia" />
    </Suspense>
  );
}
