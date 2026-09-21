import http from "node:http";
import { describe, expect, it } from "vitest";
import {
  upsertTask,
  saveConfig,
  getConfig,
  getTaskById,
  listTaskJobsByTaskId,
  mutateTaskReviewState,
  patchTask,
} from "@/lib/server/db";
import { saveImageFile } from "@/lib/server/imageStorage";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { startDeepReview } from "@/lib/server/taskOrchestrator/deepReviewRunner";
import { runPanelLightCheck } from "@/lib/server/taskOrchestrator/lightCheck";
import { runTaskDeepReviewQueue } from "@/lib/server/taskOrchestrator/reviewRunner";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=";
async function host(
  status = 200,
  reply?: (
    body: Record<string, any>,
    index: number,
  ) => unknown | Promise<unknown>,
) {
  const bodies: Record<string, any>[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      bodies.push(JSON.parse(body));
      res.writeHead(status, { "Content-Type": "application/json" });
      const content = reply
        ? await reply(bodies.at(-1)!, bodies.length)
        : bodies.length === 1
          ? {
              textImageAlignment: 5,
              styleAdherence: 5,
              artifactScore: 5,
              compositionQuality: 5,
              issues: ["synthetic concern"],
            }
          : { issues: [], repair: { rationale: "synthetic check" } };
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(content) } }],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    bodies,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
async function setup(id: string, url: string, missing = false) {
  saveConfig({
    ...createEmptyUserConfig(),
    vlmConfigs: [
      {
        id: "vlm-http",
        name: "Synthetic",
        provider: "custom",
        protocolType: "openai-compatible",
        apiUrl: url,
        apiKey: "",
        model: "synthetic",
      },
    ],
    activeVLMId: "vlm-http",
  });
  if (!missing) saveImageFile(`${id}_panel0_cur`, image);
  upsertTask({
    id,
    status: "completed",
    progress: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    script: {
      title: "real image QA",
      topic: "synthetic",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "synthetic",
          dialogue: "test",
          imagePrompt: "blue sphere",
          imageUrl: `file://${id}_panel0_cur`,
          status: "completed",
        },
      ],
    },
  });
  await startDeepReview(id, {
    vlmConfig: { configId: "vlm-http", configRole: "vlm" },
  });
}
describe("durable review real file HTTP and SQLite integration", () => {
  it("reads stored image bytes on the server and calls scoring plus diagnosis", async () => {
    const server = await host();
    try {
      await setup("review-http", server.url);
      await runTaskDeepReviewQueue("review-http");
      expect(server.bodies).toHaveLength(2);
      expect(server.bodies[0].messages[0].content[1].image_url.url).toBe(image);
      expect(getTaskById("review-http")?.visualQualityScore?.overall).toBe(5);
      expect(getTaskById("review-http")?.visualDiagnosisState).toBe(
        "succeeded",
      );
      expect(listTaskJobsByTaskId("review-http")[0].status).toBe("completed");
    } finally {
      await server.close();
    }
  });
  it("records a failed provider call rather than fabricated neutral scores", async () => {
    const server = await host(500);
    try {
      await setup("review-error", server.url);
      await runTaskDeepReviewQueue("review-error");
      expect(listTaskJobsByTaskId("review-error")[0].status).toBe("failed");
      expect(getTaskById("review-error")?.visualQualityScore).toBeUndefined();
      expect(server.bodies).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
  it("does not claim success for an unreadable image", async () => {
    const server = await host();
    try {
      await setup("review-missing", server.url, true);
      await runTaskDeepReviewQueue("review-missing");
      expect(listTaskJobsByTaskId("review-missing")[0].status).toBe("failed");
      expect(server.bodies).toHaveLength(0);
      expect(getTaskById("review-missing")?.visualQualityScore).toBeUndefined();
    } finally {
      await server.close();
    }
  });
  it("rejects invalid score JSON instead of persisting a neutral score", async () => {
    const server = await host(200, () => ({ unexpected: true }));
    try {
      await setup("review-invalid", server.url);
      await runTaskDeepReviewQueue("review-invalid");
      expect(listTaskJobsByTaskId("review-invalid")[0].status).toBe("failed");
      expect(getTaskById("review-invalid")?.visualQualityScore).toBeUndefined();
      expect(server.bodies).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
  it("does not write a score if bytes at the same local key change during HTTP", async () => {
    const server = await host(200, () => {
      saveImageFile(
        "review-byte-change_panel0_cur",
        image.replace("AAAABCAQ", "AAAABCAA"),
      );
      return {
        textImageAlignment: 8,
        styleAdherence: 8,
        artifactScore: 8,
        compositionQuality: 8,
        issues: [],
      };
    });
    try {
      await setup("review-byte-change", server.url);
      await runTaskDeepReviewQueue("review-byte-change");
      expect(listTaskJobsByTaskId("review-byte-change")[0]).toMatchObject({
        status: "failed",
        lastError: expect.stringContaining("变更"),
      });
      expect(
        getTaskById("review-byte-change")?.visualQualityScore,
      ).toBeUndefined();
      expect(server.bodies).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
  it("reuses scores only when both structured inputs and image bytes match", async () => {
    const server = await host(200, (body) =>
      String(body.messages[0].content[0].text).includes(
        "Evaluate this image (panel",
      )
        ? {
            textImageAlignment: 5,
            styleAdherence: 5,
            artifactScore: 5,
            compositionQuality: 5,
            issues: ["synthetic concern"],
          }
        : { issues: [], repair: { rationale: "synthetic check" } },
    );
    try {
      await setup("review-cache", server.url);
      await runTaskDeepReviewQueue("review-cache");
      expect(server.bodies).toHaveLength(2);
      await startDeepReview("review-cache", {
        vlmConfig: { configId: "vlm-http", configRole: "vlm" },
      });
      await runTaskDeepReviewQueue("review-cache");
      expect(server.bodies).toHaveLength(3);
      saveImageFile(
        "review-cache_panel0_cur",
        image.replace("AAAABCAQ", "AAAABCAA"),
      );
      await startDeepReview("review-cache", {
        vlmConfig: { configId: "vlm-http", configRole: "vlm" },
      });
      await runTaskDeepReviewQueue("review-cache");
      expect(server.bodies).toHaveLength(5);
      expect(
        listTaskJobsByTaskId("review-cache").every(
          (job) => job.status === "completed",
        ),
      ).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("does not reuse a score made by a different configured model", async () => {
    const server = await host(200, (body) =>
      String(body.messages[0].content[0].text).includes(
        "Evaluate this image (panel",
      )
        ? {
            textImageAlignment: 5,
            styleAdherence: 5,
            artifactScore: 5,
            compositionQuality: 5,
            issues: ["synthetic concern"],
          }
        : { issues: [], repair: { rationale: "synthetic check" } },
    );
    try {
      await setup("review-model-change", server.url);
      await runTaskDeepReviewQueue("review-model-change");
      expect(server.bodies).toHaveLength(2);
      const config = getConfig()!;
      config.vlmConfigs![0].model = "different-model";
      saveConfig(config);
      await startDeepReview("review-model-change", {
        vlmConfig: { configId: "vlm-http", configRole: "vlm" },
      });
      await runTaskDeepReviewQueue("review-model-change");
      expect(server.bodies).toHaveLength(4);
    } finally {
      await server.close();
    }
  });
  it("uses server I/O for multi-panel scoring, cross-panel analysis and targeted diagnosis", async () => {
    const server = await host(200, (body) => {
      const prompt = String(body.messages[0].content[0].text);
      if (prompt.includes("Evaluate this image (panel"))
        return {
          textImageAlignment: 5,
          styleAdherence: 5,
          artifactScore: 5,
          compositionQuality: 5,
          issues: ["synthetic concern"],
        };
      if (
        body.messages[0].content.filter(
          (item: Record<string, unknown>) => item.type === "image_url",
        ).length > 1
      )
        return {
          characterConsistency: 7,
          styleDrift: 7,
          colorPaletteCoherence: 7,
          issues: [],
        };
      return { issues: [], repair: { rationale: "synthetic diagnosis" } };
    });
    try {
      await setup("review-multi", server.url);
      saveImageFile("review-multi_panel1_cur", image);
      const task = getTaskById("review-multi")!;
      task.script!.panels.push({
        ...task.script!.panels[0],
        id: 2,
        imageUrl: "/api/images/review-multi_panel1_cur",
        imagePrompt: "another sphere",
      });
      upsertTask(task);
      patchTask(task.id, { tags: ["keep"], favorited: true });
      await runTaskDeepReviewQueue(task.id);
      expect(server.bodies).toHaveLength(5);
      expect(getTaskById(task.id)).toMatchObject({
        status: "completed",
        tags: ["keep"],
        favorited: true,
      });
      expect(
        getTaskById(task.id)?.visualQualityScore?.crossPanelConsistency,
      ).toBe(7);
      expect(
        getTaskById(task.id)?.visualDiagnosisReport?.panels.map(
          (panel) => panel.panelIndex,
        ),
      ).toEqual([0, 1]);
      await startDeepReview(task.id, {
        vlmConfig: { configId: "vlm-http", configRole: "vlm" },
        panelIndices: [1],
      });
      await runTaskDeepReviewQueue(task.id);
      expect(server.bodies).toHaveLength(6);
      expect(
        getTaskById(task.id)?.visualDiagnosisReport?.panels.map(
          (panel) => panel.panelIndex,
        ),
      ).toEqual([0, 1]);
    } finally {
      await server.close();
    }
  });
  it("rolls back both task and job changes when a transactional mutation fails", async () => {
    const server = await host();
    try {
      await setup("review-rollback", server.url);
      const before = getTaskById("review-rollback");
      const jobs = listTaskJobsByTaskId("review-rollback");
      expect(() =>
        mutateTaskReviewState("review-rollback", (task, currentJobs) => {
          task.status = "failed";
          currentJobs.push({
            ...currentJobs[0],
            id: "invalid-job",
            taskId: "different-task",
          });
        }),
      ).toThrow("Invalid task job mutation");
      expect(getTaskById("review-rollback")).toEqual(before);
      expect(listTaskJobsByTaskId("review-rollback")).toEqual(jobs);
    } finally {
      await server.close();
    }
  });

  it("uses the same server transport for a single-panel image-queue light check", async () => {
    const server = await host();
    try {
      await setup("light-check-http", server.url);
      const task = await runPanelLightCheck(
        getTaskById("light-check-http")!,
        0,
        {
          apiUrl: server.url,
          provider: "openai-compatible",
          model: "synthetic",
        },
      );
      expect(server.bodies).toHaveLength(1);
      expect(task.panelReview?.[0]).toMatchObject({
        panelIndex: 0,
        score: 5,
        status: "needs_repair",
      });
    } finally {
      await server.close();
    }
  });
});
