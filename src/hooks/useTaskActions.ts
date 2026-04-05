import { useState, useCallback, useRef } from "react";
import {
  ComicPanel,
  ComicStyle,
  GenerateTask,
  PartialImageGenConfig,
  PartialLLMConfig,
  ReferenceImageEntry,
  VisualDiagnosisReport,
  VisualQualityScore,
  VisualRepairExecutionMode,
  VisualRepairExecutionOutcome,
} from "@/lib/types";
import type { QualityScore } from "@/lib/qualityScore";
import {
  regeneratePanel,
  generateAllImages,
  updatePanel,
  cancelGeneration,
  setActiveVersion,
  reorderPanels,
  updateReferenceImage,
  updateReferenceImages,
  updateControlMode,
  regenerateRefImage,
  img2imgGenerate,
  setRefActiveVersion,
  updateReferenceEntries,
  regenerateScript,
  changeStyleAndRegenerate,
} from "@/lib/client/generator";
import { getTask, saveTask } from "@/lib/client/db";
import { notifyListeners } from "@/lib/client/eventBus";
import { getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { buildPanelReview, buildTaskReviewStatus, type PromptPatch } from "@/lib/vlmRetry";
import { invalidateDiagnosis, markDiagnosisFailed, markDiagnosisSucceeded } from "@/lib/vlmDiagnosisState";

interface TaskActionResponse {
  success?: boolean;
  task?: GenerateTask;
  error?: string;
}

interface TaskActionBody {
  action: string;
  panelIndices?: number[];
  forceAll?: boolean;
  imageConfigId?: string;
  imageConfig?: PartialImageGenConfig;
  llmConfig?: PartialLLMConfig;
}

export function applyVisualQualityScoreUpdate(task: GenerateTask, visualQualityScore: VisualQualityScore): GenerateTask {
  task.visualQualityScore = visualQualityScore;
  task.panelReview = buildPanelReview(visualQualityScore);
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
  task.lastReviewAt = visualQualityScore.evaluatedAt;
  return task;
}

export function applyVisualDiagnosisReportUpdate(task: GenerateTask, report: VisualDiagnosisReport): GenerateTask {
  markDiagnosisSucceeded(task, report);
  return task;
}

export function applyDiagnosisInvalidation(task: GenerateTask): GenerateTask {
  invalidateDiagnosis(task);
  return task;
}

export function applyVisualDiagnosisFailureUpdate(task: GenerateTask): GenerateTask {
  markDiagnosisFailed(task);
  return task;
}

export function beginVisualRepairExecution(
  task: GenerateTask,
  params: { panelIndices: number[]; mode: VisualRepairExecutionMode; startedAt: string },
): GenerateTask {
  task.visualRepairExecution = {
    status: "running",
    panelIndices: params.panelIndices,
    mode: params.mode,
    startedAt: params.startedAt,
  };
  task.visualDiagnosisStale = true;
  return task;
}

export function completeVisualRepairExecution(
  task: GenerateTask,
  visualQualityScore: VisualQualityScore,
  outcome: VisualRepairExecutionOutcome,
  finishedAt: string,
): GenerateTask {
  const previousScore = task.visualQualityScore?.overall;
  const existingExecution = task.visualRepairExecution ?? {
    panelIndices: [],
    mode: "patch" as VisualRepairExecutionMode,
    startedAt: finishedAt,
  };

  applyVisualQualityScoreUpdate(task, visualQualityScore);

  task.visualRepairExecution = {
    ...existingExecution,
    status: "completed",
    scoreBefore: previousScore,
    scoreAfter: visualQualityScore.overall,
    outcome,
    finishedAt,
  };
  task.visualDiagnosisStale = true;
  return task;
}

export function failVisualRepairExecution(task: GenerateTask, finishedAt: string): GenerateTask {
  if (!task.visualRepairExecution) {
    task.visualRepairExecution = {
      status: "failed",
      panelIndices: [],
      mode: "patch",
      startedAt: finishedAt,
      finishedAt,
    };
  } else {
    task.visualRepairExecution = {
      ...task.visualRepairExecution,
      status: "failed",
      finishedAt,
    };
  }
  task.visualDiagnosisStale = true;
  return task;
}

/** 获取文生图配置（可按 ID 指定） */
function getImageConfig(imageId?: string): PartialImageGenConfig | undefined {
  return getStoredRequestConfigs(undefined, imageId || undefined).imageConfig;
}

/** 获取 LLM 配置（可按 ID 指定） */
function getLLMConfig(llmId?: string): PartialLLMConfig | undefined {
  return getStoredRequestConfigs(llmId || undefined, undefined).llmConfig;
}

function mergeNegativeTermsIntoImageConfig(
  imageConfig: PartialImageGenConfig | undefined,
  negativeTerms: string[] | undefined,
): PartialImageGenConfig | undefined {
  const additions = (negativeTerms ?? []).map((term) => term.trim()).filter(Boolean);
  if (additions.length === 0) return imageConfig;

  const existingNegative = imageConfig?.extraBody?.negative_prompt || "";
  const mergedAdditions = additions.filter((term) => !existingNegative.toLowerCase().includes(term.toLowerCase()));
  if (mergedAdditions.length === 0) return imageConfig;

  return {
    ...imageConfig,
    extraBody: {
      ...imageConfig?.extraBody,
      negative_prompt: existingNegative ? `${existingNegative}, ${mergedAdditions.join(", ")}` : mergedAdditions.join(", "),
    },
  };
}

/**
 * 封装结果页面所有操作回调。
 * 所有 handler 均使用 useCallback 避免子组件无谓重渲染。
 * actionError 提供操作失败时的用户可见错误信息。
 */
export function useTaskActions(
  taskId: string,
  setTask: React.Dispatch<React.SetStateAction<GenerateTask | null>>,
  selectedImageId?: string | null,
  selectedLLMId?: string | null,
) {
  const getSelectedImageConfig = useCallback(() => {
    return getImageConfig(selectedImageId || undefined);
  }, [selectedImageId]);
  const getSelectedLLMConfig = useCallback(() => {
    return getLLMConfig(selectedLLMId || undefined);
  }, [selectedLLMId]);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** 设置瞬态错误（5 秒后自动清除） */
  const showError = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setActionError(msg);
    errorTimerRef.current = setTimeout(() => setActionError(null), 5000);
  }, []);

  const clearActionError = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setActionError(null);
  }, []);

  const syncTaskSnapshot = useCallback(
    async (nextTask: GenerateTask | undefined) => {
      if (!nextTask) return undefined;
      await saveTask(nextTask);
      notifyListeners(nextTask);
      setTask(nextTask);
      return nextTask;
    },
    [setTask],
  );

  const getSelectedQueueActionBody = useCallback(() => {
    return {
      imageConfigId: selectedImageId || undefined,
      imageConfig: getSelectedImageConfig(),
      llmConfig: getSelectedLLMConfig(),
    };
  }, [getSelectedImageConfig, getSelectedLLMConfig, selectedImageId]);

  const postTaskAction = useCallback(
    async (body: TaskActionBody) => {
      const response = await fetch(`/api/tasks/${taskId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({} as TaskActionResponse));

      if (!response.ok) {
        throw new Error(payload.error || `任务操作失败 (${response.status})`);
      }

      await syncTaskSnapshot(payload.task);
      return payload;
    },
    [syncTaskSnapshot, taskId],
  );

  const persistTaskUpdate = useCallback(
    async (updater: (task: GenerateTask) => GenerateTask | void) => {
      const freshTask = await getTask(taskId);
      if (!freshTask) throw new Error("任务不存在");

      const updatedTask = updater(freshTask) ?? freshTask;
      updatedTask.updatedAt = new Date();

      await saveTask(updatedTask);
      notifyListeners(updatedTask);
      setTask(updatedTask);
      return updatedTask;
    },
    [taskId, setTask],
  );

  const handleSaveQualityScore = useCallback(
    async (qualityScore: QualityScore) => {
      try {
        await persistTaskUpdate((task) => {
          task.qualityScore = qualityScore;
        });
      } catch (err) {
        console.error("Quality score persistence failed:", err);
        showError(`文本评分保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
        throw err;
      }
    },
    [persistTaskUpdate, showError],
  );

  const handleSaveVisualQualityScore = useCallback(
    async (visualQualityScore: VisualQualityScore) => {
      try {
        await persistTaskUpdate((task) => {
          applyVisualQualityScoreUpdate(task, visualQualityScore);
        });
      } catch (err) {
        console.error("Visual quality score persistence failed:", err);
        showError(`视觉评分保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
        throw err;
      }
    },
    [persistTaskUpdate, showError],
  );

  const handleSaveVisualDiagnosisReport = useCallback(
    async (report: VisualDiagnosisReport) => {
      try {
        await persistTaskUpdate((task) => {
          applyVisualDiagnosisReportUpdate(task, report);
        });
      } catch (err) {
        console.error("Visual diagnosis persistence failed:", err);
        showError(`深入诊断保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
        throw err;
      }
    },
    [persistTaskUpdate, showError],
  );

  const handleSaveVisualDiagnosisFailure = useCallback(
    async () => {
      try {
        await persistTaskUpdate((task) => {
          applyVisualDiagnosisFailureUpdate(task);
        });
      } catch (err) {
        console.error("Visual diagnosis failure persistence failed:", err);
        throw err;
      }
    },
    [persistTaskUpdate],
  );

  const handleBeginVisualRepairExecution = useCallback(
    async (params: { panelIndices: number[]; mode: VisualRepairExecutionMode; startedAt: string }) => {
      try {
        await persistTaskUpdate((task) => {
          beginVisualRepairExecution(task, params);
        });
      } catch (err) {
        console.error("Visual repair start persistence failed:", err);
        showError(`修复状态保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
        throw err;
      }
    },
    [persistTaskUpdate, showError],
  );

  const handleCompleteVisualRepairExecution = useCallback(
    async (visualQualityScore: VisualQualityScore, outcome: VisualRepairExecutionOutcome, finishedAt: string) => {
      try {
        await persistTaskUpdate((task) => {
          completeVisualRepairExecution(task, visualQualityScore, outcome, finishedAt);
        });
      } catch (err) {
        console.error("Visual repair completion persistence failed:", err);
        showError(`修复结果保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
        throw err;
      }
    },
    [persistTaskUpdate, showError],
  );

  const handleFailVisualRepairExecution = useCallback(
    async (finishedAt: string) => {
      try {
        await persistTaskUpdate((task) => {
          failVisualRepairExecution(task, finishedAt);
        });
      } catch (err) {
        console.error("Visual repair failure persistence failed:", err);
        throw err;
      }
    },
    [persistTaskUpdate],
  );

  const persistDiagnosisInvalidation = useCallback(async () => {
    await persistTaskUpdate((task) => {
      applyDiagnosisInvalidation(task);
    });
  }, [persistTaskUpdate]);

  // 更新单个面板 (持久化到 DB)
  const handlePanelUpdate = useCallback(
    (index: number, updatedPanel: ComicPanel) => {
      // 乐观更新 UI
      setTask((prev) => {
        if (!prev?.script) return prev;
        const newPanels = [...prev.script.panels];
        newPanels[index] = updatedPanel;
        const nextTask = { ...prev, script: { ...prev.script, panels: newPanels } };
        applyDiagnosisInvalidation(nextTask);
        return nextTask;
      });

      void (async () => {
        try {
          await persistDiagnosisInvalidation();
          await updatePanel(taskId, index, {
            scene: updatedPanel.scene,
            dialogue: updatedPanel.dialogue,
            imagePrompt: updatedPanel.imagePrompt,
            styleOverride: updatedPanel.styleOverride,
          });
        } catch (err) {
          console.error("Failed to persist panel update:", err);
          showError("面板更新保存失败，请重试");
        }
      })();
    },
    [taskId, setTask, showError, persistDiagnosisInvalidation],
  );

  // 单个面板生成/重生成
  const handleRegenerate = useCallback(
    (panelIndex: number, seedOverride?: number) => {
      void (async () => {
        try {
          await persistDiagnosisInvalidation();
          const imageConfig = getSelectedImageConfig();
          await regeneratePanel(taskId, panelIndex, imageConfig, seedOverride);
        } catch (err) {
          console.error("Panel regeneration failed:", err);
          showError(`第 ${panelIndex + 1} 格图片生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
        }
      })();
    },
    [taskId, showError, getSelectedImageConfig, persistDiagnosisInvalidation],
  );

  // 取消面板生成
  const handleCancel = useCallback(
    (panelIndex: number) => {
      cancelGeneration(taskId, panelIndex);
    },
    [taskId],
  );

  // 切换面板图片版本
  const handleVersionChange = useCallback(
    (panelIndex: number, versionIndex: number) => {
      setActiveVersion(taskId, panelIndex, versionIndex).catch((err) => {
        console.error("Version switch failed:", err);
        showError("版本切换失败，请重试");
      });
    },
    [taskId, showError],
  );

  // 全部生成
  const handleGenerateAll = useCallback(async () => {
    setGeneratingAll(true);
    try {
      await postTaskAction({
        action: "generate_all_images",
        forceAll: false,
        ...getSelectedQueueActionBody(),
      });
    } catch (err) {
      console.error("Batch generation failed:", err);
      showError(`批量生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [getSelectedQueueActionBody, postTaskAction, showError]);

  // 仅重试失败/待处理的面板
  const handleRetryFailed = useCallback(async () => {
    setGeneratingAll(true);
    try {
      const imageConfig = getSelectedImageConfig();
      const llmConfig = getSelectedLLMConfig();
      // forceAll=false 只会生成 status !== "completed" 的面板
      await generateAllImages(taskId, imageConfig, false, llmConfig);
    } catch (err) {
      console.error("Retry failed panels failed:", err);
      showError(`重试失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [taskId, showError, getSelectedImageConfig, getSelectedLLMConfig]);

  const handleQueuePanel = useCallback(async (panelIndex: number) => {
    setGeneratingAll(true);
    try {
      await postTaskAction({
        action: "queue_panel_images",
        panelIndices: [panelIndex],
        ...getSelectedQueueActionBody(),
      });
    } catch (err) {
      console.error("Queue single panel failed:", err);
      showError(`第 ${panelIndex + 1} 格入队失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [getSelectedQueueActionBody, postTaskAction, showError]);

  const handleQueueSelectedPanels = useCallback(async (panelIndices: number[]) => {
    if (panelIndices.length === 0) return;

    setGeneratingAll(true);
    try {
      await postTaskAction({
        action: "queue_panel_images",
        panelIndices,
        ...getSelectedQueueActionBody(),
      });
    } catch (err) {
      console.error("Queue selected panels failed:", err);
      showError(`选中面板入队失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [getSelectedQueueActionBody, postTaskAction, showError]);

  const handleContinueRemaining = useCallback(async () => {
    setGeneratingAll(true);
    try {
      await postTaskAction({
        action: "generate_all_images",
        forceAll: false,
        ...getSelectedQueueActionBody(),
      });
    } catch (err) {
      console.error("Continue remaining panels failed:", err);
      showError(`继续剩余失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [getSelectedQueueActionBody, postTaskAction, showError]);

  const handlePauseQueue = useCallback(async () => {
    setGeneratingAll(true);
    try {
      await postTaskAction({ action: "pause" });
    } catch (err) {
      console.error("Pause queue failed:", err);
      showError(`暂停队列失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [postTaskAction, showError]);

  const handleResumeQueue = useCallback(async () => {
    setGeneratingAll(true);
    try {
      await postTaskAction({ action: "resume" });
    } catch (err) {
      console.error("Resume queue failed:", err);
      showError(`恢复队列失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [postTaskAction, showError]);

  // 参考图变更
  const handleReferenceImageChange = useCallback(
    (base64: string | undefined) => {
      updateReferenceImage(taskId, base64).catch(console.error);
    },
    [taskId],
  );

  // 多参考图变更
  const handleReferenceImagesChange = useCallback(
    (images: string[]) => {
      updateReferenceImages(taskId, images).catch(console.error);
    },
    [taskId],
  );

  // 控制模式变更
  const handleControlModeChange = useCallback(
    (mode: "HED" | "Canny" | "Depth") => {
      updateControlMode(taskId, mode).catch(console.error);
    },
    [taskId],
  );

  // 参考图重新生成
  const handleRegenerateRef = useCallback(
    async (refIndex: number, prompt: string) => {
      const imageConfig = getSelectedImageConfig();
      await regenerateRefImage(taskId, refIndex, imageConfig, prompt);
    },
    [taskId, getSelectedImageConfig],
  );

  // 参考图图生图
  const handleImg2Img = useCallback(
    async (refIndex: number, sourceImage: string, prompt: string, strength: number) => {
      const imageConfig = getSelectedImageConfig();
      await img2imgGenerate(taskId, refIndex, sourceImage, prompt, strength, imageConfig);
    },
    [taskId, getSelectedImageConfig],
  );

  // 参考图版本切换
  const handleRefVersionChange = useCallback(
    (refIndex: number, versionIndex: number) => {
      setRefActiveVersion(taskId, refIndex, versionIndex).catch(console.error);
    },
    [taskId],
  );

  // 参考图 entries 更新
  const handleRefEntriesChange = useCallback(
    (entries: ReferenceImageEntry[]) => {
      updateReferenceEntries(taskId, entries).catch(console.error);
    },
    [taskId],
  );

  // 重新生成脚本（使用不同 LLM 配置）
  const handleRegenerateScript = useCallback(async () => {
    try {
      await persistDiagnosisInvalidation();
      const llmConfig = getSelectedLLMConfig();
      await regenerateScript(taskId, llmConfig);
    } catch (err) {
      console.error("Script regeneration failed:", err);
      showError(`Script regeneration failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [taskId, showError, getSelectedLLMConfig, persistDiagnosisInvalidation]);

  // 面板排序
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      // 乐观更新 UI
      setTask((prev) => {
        if (!prev?.script) return prev;
        const panels = [...prev.script.panels];
        const [moved] = panels.splice(fromIndex, 1);
        panels.splice(toIndex, 0, moved);
        const nextTask = { ...prev, script: { ...prev.script, panels } };
        applyDiagnosisInvalidation(nextTask);
        return nextTask;
      });

      void (async () => {
        try {
          await persistDiagnosisInvalidation();
          await reorderPanels(taskId, fromIndex, toIndex);
        } catch (err) {
          console.error("Panel reorder failed:", err);
          showError("面板排序失败，请重试");
        }
      })();
    },
    [taskId, setTask, showError, persistDiagnosisInvalidation],
  );

  // 切换风格并重新生成所有图片
  const handleChangeStyle = useCallback(async (newStyle: ComicStyle) => {
    setGeneratingAll(true);
    try {
      await persistDiagnosisInvalidation();
      const imageConfig = getSelectedImageConfig();
      await changeStyleAndRegenerate(taskId, newStyle, imageConfig);
    } catch (err) {
      console.error("Style change failed:", err);
      showError(`风格切换失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [taskId, showError, getSelectedImageConfig, persistDiagnosisInvalidation]);

  // VLM 一键修复：根据 VLM 评分结果重新生成低分面板
  const handleVlmRetry = useCallback(
    async (panelIndices: number[], patchedPrompts: Map<number, string>, patches?: Map<number, PromptPatch>) => {
      setGeneratingAll(true);
      try {
        await persistDiagnosisInvalidation();
        // 先更新面板 prompt
        for (const [idx, prompt] of patchedPrompts) {
          await updatePanel(taskId, idx, { imagePrompt: prompt });
        }
        // 然后逐面板重新生成（注入 negative patch 到 imageConfig）
        const baseImageConfig = getSelectedImageConfig();
        for (const idx of panelIndices) {
          const patch = patches?.get(idx);
          const imageConfig = mergeNegativeTermsIntoImageConfig(baseImageConfig, patch?.negative);
          await regeneratePanel(taskId, idx, imageConfig);
        }
      } catch (err) {
        console.error("VLM retry failed:", err);
        showError(`VLM 修复失败: ${err instanceof Error ? err.message : "未知错误"}`);
      } finally {
        setGeneratingAll(false);
      }
    },
    [taskId, showError, getSelectedImageConfig, persistDiagnosisInvalidation],
  );

  const handleRunDiagnosisRepair = useCallback(
    async (
      panelIndices: number[],
      promptUpdates: Map<number, string>,
      negativeTermsByPanel?: Map<number, string[]>,
    ): Promise<GenerateTask> => {
      setGeneratingAll(true);
      try {
        for (const [idx, prompt] of promptUpdates) {
          await updatePanel(taskId, idx, { imagePrompt: prompt });
        }

        const baseImageConfig = getSelectedImageConfig();
        for (const idx of panelIndices) {
          const imageConfig = mergeNegativeTermsIntoImageConfig(baseImageConfig, negativeTermsByPanel?.get(idx));
          await regeneratePanel(taskId, idx, imageConfig);
        }

        const refreshedTask = await getTask(taskId);
        if (!refreshedTask) {
          throw new Error("任务不存在");
        }

        setTask(refreshedTask);
        notifyListeners(refreshedTask);
        return refreshedTask;
      } catch (err) {
        console.error("Diagnosis repair failed:", err);
        showError(`诊断修复失败: ${err instanceof Error ? err.message : "未知错误"}`);
        throw err;
      } finally {
        setGeneratingAll(false);
      }
    },
    [taskId, getSelectedImageConfig, setTask, showError],
  );

  return {
    handleSaveQualityScore,
    handleSaveVisualQualityScore,
    handleSaveVisualDiagnosisReport,
    handleSaveVisualDiagnosisFailure,
    handleBeginVisualRepairExecution,
    handleCompleteVisualRepairExecution,
    handleFailVisualRepairExecution,
    handlePanelUpdate,
    handleRegenerate,
    handleCancel,
    handleVersionChange,
    handleGenerateAll,
    handleQueuePanel,
    handleQueueSelectedPanels,
    handleContinueRemaining,
    handlePauseQueue,
    handleResumeQueue,
    handleRetryFailed,
    handleReferenceImageChange,
    handleReferenceImagesChange,
    handleControlModeChange,
    handleRegenerateRef,
    handleImg2Img,
    handleRefVersionChange,
    handleRefEntriesChange,
    handleRegenerateScript,
    handleChangeStyle,
    handleReorder,
    handleVlmRetry,
    handleRunDiagnosisRepair,
    generatingAll,
    actionError,
    clearActionError,
  };
}
