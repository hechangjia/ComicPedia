import fs from "node:fs";
import path from "node:path";

/** A single portable filename component, not a URL or filesystem path. */
export function isStorageSegment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && value !== "." && value !== ".."
    && !/[<>:"/\\|?*\x00-\x1f]/.test(value)
    && !/[. ]$/.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}

export function assertStorageSegment(value: string): void {
  if (!isStorageSegment(value)) throw new Error("Invalid storage identifier");
}

export function isPathWithin(base: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

/** Refuse links/junctions as well as lexical escapes. Check before any I/O. */
export function isSafeStoragePath(base: string, candidate: string): boolean {
  if (!isPathWithin(base, candidate)) return false;
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  let current = path.resolve(base);
  try {
    for (const part of ["", ...relative.split(path.sep)]) {
      current = path.join(current, part);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
