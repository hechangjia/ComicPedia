import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getConfig } from "@/lib/server/db";
import {
  buildAccuracyGoldenTopicSmokeReportEntry,
  getAccuracyGoldenTopicSmokeCases,
  resolveAccuracySmokeLlmConfig,
  runAccuracyGoldenTopicSmokeCase,
} from "@/lib/accuracy/goldenTopicSmoke";

const shouldRunLiveSmoke = process.env.RUN_ACCURACY_SMOKE === "1";
const smokeBaseUrl = process.env.SMOKE_BASE_URL;
const smokeLlmId = process.env.SMOKE_LLM_ID;
const smokeCaseIds = new Set(
  (process.env.SMOKE_CASE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

describe.runIf(shouldRunLiveSmoke)("accuracy golden-topic live smoke", () => {
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    if (!smokeBaseUrl) {
      throw new Error("SMOKE_BASE_URL is required when RUN_ACCURACY_SMOKE=1");
    }

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/")) {
        return originalFetch(`${smokeBaseUrl}${input}`, init);
      }
      if (input instanceof URL && input.pathname.startsWith("/")) {
        return originalFetch(new URL(input.pathname + input.search, smokeBaseUrl), init);
      }
      return originalFetch(input, init);
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs all five golden topics through the live script-stage accuracy loop", { timeout: 15 * 60_000 }, async () => {
    const config = getConfig();
    expect(config).not.toBeNull();

    const llmConfig = resolveAccuracySmokeLlmConfig(config!, smokeLlmId);
    const smokeCases = getAccuracyGoldenTopicSmokeCases()
      .filter((item) => smokeCaseIds.size === 0 || smokeCaseIds.has(item.id));
    expect(smokeCases.length).toBeGreaterThan(0);
    const results = [];
    const reportDir = path.join(process.cwd(), "data", "smoke-reports");
    fs.mkdirSync(reportDir, { recursive: true });
    const latestReportPath = path.join(reportDir, "accuracy-golden-topics-latest.json");

    for (const smokeCase of smokeCases) {
      console.log(`[AccuracySmoke] running ${smokeCase.id} (${smokeCase.topic}, ${smokeCase.contentType})`);
      const result = await runAccuracyGoldenTopicSmokeCase({
        smokeCase,
        llmConfig,
        accuracyConfig: config!.accuracyConfig,
      });
      console.log(
        `[AccuracySmoke] finished ${smokeCase.id}: review=${result.accuracyReview.status}, final=${result.finalStatus}, hardFacts=${result.hardFactCount}, fallback=${result.wikipediaFallbackUsed}`,
      );
      results.push(buildAccuracyGoldenTopicSmokeReportEntry(result));
      fs.writeFileSync(latestReportPath, JSON.stringify(results, null, 2), "utf8");
    }

    const reportPath = path.join(reportDir, `accuracy-golden-topics-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");

    results.forEach((result) => {
      expect(result.safeToGenerate, `${result.topic}: research coverage should be sufficient`).toBe(true);
      expect(result.hardFactCount, `${result.topic}: hard fact coverage should not be thin`).toBeGreaterThanOrEqual(2);
      expect(result.reviewStatus, `${result.topic}: script should not be blocked by the factual gate`).not.toBe("blocked");
      expect(result.finalStatus, `${result.topic}: live smoke should reach script_ready`).toBe("script_ready");
      expect(result.panelCount, `${result.topic}: script should contain at least 4 panels`).toBeGreaterThanOrEqual(4);
    });
  });
});
