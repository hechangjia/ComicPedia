import path from "node:path";

/** Resolve once at startup. Tests must explicitly opt into disposable storage. */
export function getDataDirectory(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env.COMICPEDIA_DATA_DIR?.trim();
  if (!configured && (env.VITEST || env.NODE_ENV === "test")) {
    throw new Error("Tests require an isolated COMICPEDIA_DATA_DIR; refusing to open runtime data");
  }
  return path.resolve(cwd, configured || "data");
}
