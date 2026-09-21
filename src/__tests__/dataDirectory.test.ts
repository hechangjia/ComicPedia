import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDataDirectory } from "@/lib/server/dataDirectory";

const root = path.resolve("test-workspace");
describe("data directory policy", () => {
  it("keeps the existing production default", () => {
    expect(getDataDirectory({}, root)).toBe(path.join(root, "data"));
  });
  it("resolves explicit absolute and relative directories", () => {
    const absolute = path.resolve("isolated-data");
    expect(getDataDirectory({ COMICPEDIA_DATA_DIR: absolute }, root)).toBe(absolute);
    expect(getDataDirectory({ COMICPEDIA_DATA_DIR: "custom" }, root)).toBe(path.join(root, "custom"));
  });
  it.each([{ VITEST: "true" }, { NODE_ENV: "test" }])("refuses the runtime default in test mode %o", (env) => {
    expect(() => getDataDirectory(env, root)).toThrow("COMICPEDIA_DATA_DIR");
  });
  it("allows an explicitly isolated test directory", () => {
    expect(getDataDirectory({ VITEST: "true", COMICPEDIA_DATA_DIR: "isolated" }, root))
      .toBe(path.join(root, "isolated"));
  });
});
