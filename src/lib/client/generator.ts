/**
 * Generator Facade — 统一导出入口。
 *
 * 内部拆分为 5 个职责单一的模块：
 *   eventBus.ts        — Zustand 通知 / DB 写入节流
 *   abortManager.ts    — AbortController 注册 / 取消 / 僵尸恢复
 *   taskLifecycle.ts   — 任务创建 / 脚本生成 / 批量图片生成
 *   panelManager.ts    — 面板编辑 / 版本切换 / 单面板重生成
 *   referenceManager.ts — 参考图 CRUD / img2img / 版本管理
 *
 * 所有消费端继续 `import from "@/lib/client/generator"` 即可，无需修改。
 */

// abortManager
export { cancelGeneration, recoverZombieTask } from "./abortManager";

// taskLifecycle
export { startGeneration, generateAllImages, regenerateScript, changeStyleAndRegenerate } from "./taskLifecycle";

// panelManager
export { updatePanel, setActiveVersion, regeneratePanel } from "./panelManager";

// referenceManager
export {
  updateReferenceImage,
  updateReferenceImages,
  updateControlMode,
  setRefActiveVersion,
  regenerateRefImage,
  img2imgGenerate,
  updateRefImagePrompt,
  updateReferenceEntries,
} from "./referenceManager";
