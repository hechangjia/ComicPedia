import type { GenerateTask, TaskJobRecord } from "@/lib/types";

/** Advanced visual repair waits for the same durable worker used by ordinary retries. */
export async function waitForPanelImageJob(taskId: string, panelIndex: number): Promise<GenerateTask> {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取图片队列，请在作品页查看进度");
    const task = await response.json() as GenerateTask & { queueJobs?: TaskJobRecord[] };
    const job = task.queueJobs?.filter(item => item.kind === "panel_image" && item.panelIndex === panelIndex)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (job?.status === "completed" && task.script?.panels[panelIndex]?.imageUrl) return task;
    if (job && ["failed", "attach_failed", "paused", "calibrating"].includes(job.status)) {
      throw new Error(job.lastError || "图片队列已暂停，请在作品页继续生成");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("图片仍在后台处理，请在作品页查看进度，无需重复提交");
}
