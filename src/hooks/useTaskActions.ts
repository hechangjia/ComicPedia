import { useState, useCallback, useRef } from "react";
import { ComicPanel, ComicStyle, GenerateTask, PartialImageGenConfig, PartialLLMConfig, ReferenceImageEntry } from "@/lib/types";
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
import { getStoredRequestConfigs } from "@/hooks/useAPIConfig";

/** 获取文生图配置（可按 ID 指定） */
function getImageConfig(imageId?: string): PartialImageGenConfig | undefined {
  return getStoredRequestConfigs(undefined, imageId || undefined).imageConfig;
}

/** 获取 LLM 配置（可按 ID 指定） */
function getLLMConfig(llmId?: string): PartialLLMConfig | undefined {
  return getStoredRequestConfigs(llmId || undefined, undefined).llmConfig;
}

/**
 * 封装结果页面所有操作回调。
 * 所有 handler 均使用 useCallback 避免子组件无谓重渲染。
 * actionError 提供操作失败时的用户可见错误信息。
 */
export function useTaskActions(
  taskId: string,
  setTask: React.Dispatch<React.SetStateAction<GenerateTask | null>>,
  /** Ref to the currently selected image config ID (avoids stale closure) */
  imageIdRef?: React.RefObject<string>,
  /** Ref to the currently selected LLM config ID (avoids stale closure) */
  llmIdRef?: React.RefObject<string>,
) {
  const getSelectedImageConfig = useCallback(() => {
    return getImageConfig(imageIdRef?.current || undefined);
  }, [imageIdRef]);
  const getSelectedLLMConfig = useCallback(() => {
    return getLLMConfig(llmIdRef?.current || undefined);
  }, [llmIdRef]);
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

  // 更新单个面板 (持久化到 DB)
  const handlePanelUpdate = useCallback(
    (index: number, updatedPanel: ComicPanel) => {
      // 乐观更新 UI
      setTask((prev) => {
        if (!prev?.script) return prev;
        const newPanels = [...prev.script.panels];
        newPanels[index] = updatedPanel;
        return { ...prev, script: { ...prev.script, panels: newPanels } };
      });

      // 持久化到 DB
      updatePanel(taskId, index, {
        scene: updatedPanel.scene,
        dialogue: updatedPanel.dialogue,
        imagePrompt: updatedPanel.imagePrompt,
        styleOverride: updatedPanel.styleOverride,
      }).catch((err) => {
        console.error("Failed to persist panel update:", err);
        showError("面板更新保存失败，请重试");
      });
    },
    [taskId, setTask],
  );

  // 单个面板生成/重生成
  const handleRegenerate = useCallback(
    (panelIndex: number, seedOverride?: number) => {
      const imageConfig = getSelectedImageConfig();
      regeneratePanel(taskId, panelIndex, imageConfig, seedOverride).catch((err) => {
        console.error("Panel regeneration failed:", err);
        showError(`第 ${panelIndex + 1} 格图片生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
      });
    },
    [taskId, showError, getSelectedImageConfig],
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
      const imageConfig = getSelectedImageConfig();
      const llmConfig = getSelectedLLMConfig();
      await generateAllImages(taskId, imageConfig, undefined, llmConfig);
    } catch (err) {
      console.error("Batch generation failed:", err);
      showError(`批量生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [taskId, showError, getSelectedImageConfig, getSelectedLLMConfig]);

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
      const llmConfig = getSelectedLLMConfig();
      await regenerateScript(taskId, llmConfig);
    } catch (err) {
      console.error("Script regeneration failed:", err);
      showError(`Script regeneration failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [taskId, showError, getSelectedLLMConfig]);

  // 面板排序
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      // 乐观更新 UI
      setTask((prev) => {
        if (!prev?.script) return prev;
        const panels = [...prev.script.panels];
        const [moved] = panels.splice(fromIndex, 1);
        panels.splice(toIndex, 0, moved);
        panels.forEach((p, i) => { p.id = i + 1; });
        return { ...prev, script: { ...prev.script, panels } };
      });

      reorderPanels(taskId, fromIndex, toIndex).catch((err) => {
        console.error("Panel reorder failed:", err);
        showError("面板排序失败，请重试");
      });
    },
    [taskId, setTask, showError],
  );

  // 切换风格并重新生成所有图片
  const handleChangeStyle = useCallback(async (newStyle: ComicStyle) => {
    setGeneratingAll(true);
    try {
      const imageConfig = getSelectedImageConfig();
      await changeStyleAndRegenerate(taskId, newStyle, imageConfig);
    } catch (err) {
      console.error("Style change failed:", err);
      showError(`风格切换失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setGeneratingAll(false);
    }
  }, [taskId, showError, getSelectedImageConfig]);

  return {
    handlePanelUpdate,
    handleRegenerate,
    handleCancel,
    handleVersionChange,
    handleGenerateAll,
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
    generatingAll,
    actionError,
    clearActionError,
  };
}
