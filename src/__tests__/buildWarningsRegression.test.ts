import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("build warning regressions", () => {
  it("does not keep CharacterDialog wired through a single hook bag object during render", () => {
    const source = readSource("src/components/characters/CharacterDialog.tsx");

    expect(source).not.toContain("const h = useCharacterForm");
    expect(source).not.toMatch(/\bh\./);
    expect(source).not.toContain("setSaveSuccess(true)");
  });

  it("does not reset InspirationSquare state with an effect on contentType changes", () => {
    const source = readSource("src/components/InspirationSquare.tsx");

    expect(source).not.toMatch(/\buseEffect\b/);
    expect(source).not.toContain("setActiveCategory(null)");
    expect(source).not.toContain("setExpanded(false)");
    expect(source).toContain("const presets = useMemo(() => TOPIC_PRESETS[contentType] ?? [], [contentType]);");
  });

  it("does not use lucide Image icons under the raw Image component name in warning-prone files", () => {
    const files = [
      "src/app/layout.tsx",
      "src/components/DownloadMenu.tsx",
      "src/components/OnboardingGuide.tsx",
    ];

    for (const file of files) {
      const source = readSource(file);
      expect(source).not.toMatch(/import\s*\{[^}]*\bImage\b(?!\s+as)[^}]*\}\s*from\s*"lucide-react"/);
      expect(source).not.toMatch(/<Image[\s>]/);
    }
  });

  it("does not keep stale eslint-disable directives in files that now lint cleanly", () => {
    const files = [
      "src/components/characters/RelationGraph.tsx",
      "src/components/editor/EditorPreview.tsx",
      "src/components/editor/ScriptEditor.tsx",
    ];

    for (const file of files) {
      expect(readSource(file)).not.toContain("eslint-disable-next-line");
    }
  });

  it("does not read RelationGraph node and link refs directly during render", () => {
    const source = readSource("src/components/characters/RelationGraph.tsx");

    expect(source).not.toContain("const nodes = nodesRef.current");
    expect(source).not.toContain("const links = linksRef.current");
  });
});
