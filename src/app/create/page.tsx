"use client";

import { Suspense } from "react";
import { FormLayout } from "@/components/FormLayout";

export default function CreatePage() {
  return (
    <Suspense>
      <FormLayout defaultTab="science" />
    </Suspense>
  );
}
