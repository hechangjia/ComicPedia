import http from "node:http";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import {
  deleteTask,
  getTaskById,
  listReplayableScriptTasks,
  patchTask,
  upsertTask,
} from "@/lib/server/db";
import { runResearchAndScriptTask } from "@/lib/server/taskOrchestrator/scriptRunner";
import type { GenerateRequest, GenerateTask } from "@/lib/types";

// Actual HTTP SSE, provider adapter, parser, validator and SQLite. No module mocks.
const script = {
  title: "本地生命周期验收",
  topic: "合成素材",
  style: "flat",
  panels: [
    {
      id: 1,
      scene: "桌上的蓝色圆球",
      dialogue: "蓝色圆球在桌上。",
      imagePrompt:
        "flat vector illustration, close-up of a blue sphere on a table, text-free image, no watermark",
    },
  ],
};
async function upstream() {
  const requests: Array<{
    response: http.ServerResponse;
    body: Record<string, unknown>;
  }> = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ response: res, body: JSON.parse(body) });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    requests,
    url: `http://127.0.0.1:${port}/v1`,
    finish(index: number, status = 200) {
      const res = requests[index].response;
      if (status !== 200) {
        res.writeHead(status);
        res.end("synthetic failure");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(script) } }] })}\n\ndata: [DONE]\n\n`,
      );
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
function seed(id: string, url: string) {
  const request: GenerateRequest = {
    topic: "合成素材",
    style: "flat",
    panelCount: 1,
    quality: "fast",
    llmConfig: {
      apiUrl: url,
      model: "synthetic",
      provider: "openai-compatible",
    },
    presetSnapshot: { presetId: "test", pauseAfterScript: true },
  };
  const task: GenerateTask = {
    id,
    status: "created",
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  upsertTask({
    ...task,
    serverScriptReplay: { request, llm: { fallback: request.llmConfig } },
  } as GenerateTask);
  return request;
}
describe("script lifecycle real HTTP and SQLite integration", () => {
  it("keeps replay data and concurrent tags through a real SSE generation", async () => {
    const host = await upstream();
    let running: Promise<void> | undefined;
    try {
      const request = seed("http-script", host.url);
      running = runResearchAndScriptTask("http-script", request);
      await vi.waitFor(() => expect(host.requests).toHaveLength(1));
      expect(host.requests[0].body.stream).toBe(true);
      expect(
        listReplayableScriptTasks().find((t) => t.taskId === "http-script")
          ?.replayPayload.request.topic,
      ).toBe("合成素材");
      patchTask("http-script", { tags: ["keep-http"], favorited: true });
      host.finish(0);
      await running;
      expect(host.requests).toHaveLength(1);
      expect(getTaskById("http-script")).toMatchObject({
        status: "script_ready",
        tags: ["keep-http"],
        favorited: true,
        script: { title: script.title },
      });
      const reader = new Database(
        path.join(process.env.COMICPEDIA_DATA_DIR!, "comicpedia.db"),
        { readonly: true },
      );
      try {
        const row = reader
          .prepare("SELECT status,metadata FROM tasks WHERE id=?")
          .get("http-script") as { status: string; metadata: string };
        const meta = JSON.parse(row.metadata);
        expect(row.status).toBe("script_ready");
        expect(meta.serverScriptReplay.request.topic).toBe("合成素材");
        expect(meta).not.toHaveProperty("serverScriptRunId");
        expect(meta.pipelineTrace).toContainEqual(
          expect.objectContaining({ stage: "script", status: "completed" }),
        );
      } finally {
        reader.close();
      }
    } finally {
      deleteTask("http-script");
      deleteTask("http-delete-200");
      deleteTask("http-delete-400");
      deleteTask("http-open-stream");
      await host.close();
      await running?.catch(() => {});
    }
  });
  it.each([200, 400])(
    "does not recreate or retry a deleted task after HTTP %s",
    async (status) => {
      const host = await upstream();
      let running: Promise<void> | undefined;
      try {
        const id = `http-delete-${status}`;
        const request = seed(id, host.url);
        running = runResearchAndScriptTask(id, request);
        await vi.waitFor(() => expect(host.requests).toHaveLength(1));
        deleteTask(id);
        host.finish(0, status);
        await running;
        expect(host.requests).toHaveLength(1);
        expect(getTaskById(id)).toBeNull();
      } finally {
        deleteTask("http-script");
        deleteTask("http-delete-200");
        deleteTask("http-delete-400");
        deleteTask("http-open-stream");
        await host.close();
        await running?.catch(() => {});
      }
    },
  );
  it("exits on the next streamed chunk after deletion without waiting for upstream EOF", async () => {
    const host = await upstream();
    let running: Promise<void> | undefined;
    try {
      const request = seed("http-open-stream", host.url);
      running = runResearchAndScriptTask("http-open-stream", request);
      await vi.waitFor(() => expect(host.requests).toHaveLength(1));
      deleteTask("http-open-stream");
      const response = host.requests[0].response;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "late chunk" } }] })}\n\n`,
      );
      let finished = false;
      void running.then(() => {
        finished = true;
      });
      await vi.waitFor(() => expect(finished).toBe(true));
      await running;
      expect(getTaskById("http-open-stream")).toBeNull();
      expect(host.requests).toHaveLength(1);
    } finally {
      deleteTask("http-open-stream");
      await host.close();
      await running?.catch(() => {});
    }
  });
});
