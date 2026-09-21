import { createHash } from "node:crypto";
import type { UserAPIConfigV2 } from "@/lib/types";

/** Opaque HTTP validator over all persisted fields, not a client-controlled clock. */
export function configRevision(config: UserAPIConfigV2 | null): string {
  return config ? `"${createHash("sha256").update(JSON.stringify(config)).digest("hex")}"` : '"empty"';
}
