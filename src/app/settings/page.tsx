"use client";

import { useState } from "react";
import Link from "next/link";
import { useAPIConfig } from "@/hooks/useAPIConfig";
import { useLLMForm, useImageForm } from "@/hooks/useConfigForm";
import { AccuracyProviderConfig, UserLLMConfig, UserImageConfig } from "@/lib/types";
import { testLLMConnection, testImageConnection, TestResult } from "@/lib/api/connectionTest";
import { LLMConfigCard } from "@/components/settings/LLMConfigCard";
import { ImageConfigCard } from "@/components/settings/ImageConfigCard";
import { LLMForm } from "@/components/settings/LLMForm";
import { ImageForm } from "@/components/settings/ImageForm";
import { AccuracyProviderSection } from "@/components/settings/AccuracyProviderSection";
import { type AccuracyProviderFormFields } from "@/components/settings/AccuracyProviderForm";
import { MaintenancePanel } from "@/components/settings/MaintenancePanel";
import { MigratePanel } from "@/components/settings/MigratePanel";
import { VLM_PRESETS, getVLMPreset } from "@/lib/config/presets";
import { BackupManager } from "@/components/settings/BackupManager";
import { ConfigImportExport, exportSingleLLM, exportSingleImage } from "@/components/settings/ConfigImportExport";
import { getWatermarkText, setWatermarkText } from "@/lib/downloadUtils";
import { testAccuracyProvider } from "@/lib/api/accuracyProviderTest";


/** 测试结果 Map：configId → TestResult */
type TestResultMap = Record<string, TestResult>;

const EMPTY_ACCURACY_PROVIDER_FORM: AccuracyProviderFormFields = {
  name: "",
  kind: "search",
  vendor: "firecrawl",
  baseUrl: "https://api.firecrawl.dev",
  apiKey: "",
  enabled: true,
  priority: 0,
};

function WatermarkInput() {
  const [text, setText] = useState(() => getWatermarkText());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setWatermarkText(text);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例：Created by Alice / @your_handle"
        className="flex-1 px-3 py-2 text-sm border rounded-lg min-h-[44px]"
        maxLength={100}
      />
      <button
        onClick={handleSave}
        className={`px-4 py-2 text-sm rounded-lg min-h-[44px] transition-colors ${
          saved
            ? "bg-success/50 text-white"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {saved ? "已保存" : "保存"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const {
    config, isLoaded,
    addLLM, updateLLMById, removeLLM, setActiveLLM,
    addImage, updateImageById, removeImage, setActiveImage,
    addVLM, updateVLMById, removeVLM, setActiveVLM,
    addAccuracyProvider, updateAccuracyProviderById, removeAccuracyProvider, assignAccuracySlot, setAccuracyWhitelistDomains,
    clearAll, validate,
  } = useAPIConfig();
  const validation = validate();

  // 消息状态
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 测试结果
  const [llmTests, setLlmTests] = useState<TestResultMap>({});
  const [imgTests, setImgTests] = useState<TestResultMap>({});
  const [vlmTests, setVlmTests] = useState<TestResultMap>({});
  const [accuracyTests, setAccuracyTests] = useState<TestResultMap>({});
  const [accuracyFormFields, setAccuracyFormFields] = useState<AccuracyProviderFormFields>(EMPTY_ACCURACY_PROVIDER_FORM);
  const [accuracyEditingId, setAccuracyEditingId] = useState<string | null>(null);
  const [showAccuracyForm, setShowAccuracyForm] = useState(false);

  // 表单状态（通过 hook 管理）
  const llmForm = useLLMForm({ addLLM, updateLLMById });
  const imgForm = useImageForm({ addImage, updateImageById });
  const vlmForm = useLLMForm({ addLLM: addVLM, updateLLMById: updateVLMById }, { getPreset: getVLMPreset, defaultProvider: "openai" });

  // 保存 LLM 配置
  const handleSaveLLM = () => {
    const result = llmForm.save();
    if (result === true) {
      setMessage({ type: "success", text: llmForm.editingId ? "LLM 配置已更新" : "LLM 配置已添加" });
    } else {
      setMessage({ type: "error", text: result });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // 保存文生图配置
  const handleSaveImage = () => {
    const result = imgForm.save();
    if (result === true) {
      setMessage({ type: "success", text: imgForm.editingId ? "文生图配置已更新" : "文生图配置已添加" });
    } else {
      setMessage({ type: "error", text: result });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // 保存 VLM 配置
  const handleSaveVLM = () => {
    const result = vlmForm.save();
    if (result === true) {
      setMessage({ type: "success", text: vlmForm.editingId ? "VLM 配置已更新" : "VLM 配置已添加" });
    } else {
      setMessage({ type: "error", text: result });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // 测试 LLM 连接
  const handleTestLLM = async (c: UserLLMConfig) => {
    setLlmTests((prev) => ({ ...prev, [c.id]: { status: "testing" } }));
    const result = await testLLMConnection(c);
    setLlmTests((prev) => ({ ...prev, [c.id]: result }));
  };

  // 测试文生图连接
  const handleTestImage = async (c: UserImageConfig) => {
    setImgTests((prev) => ({ ...prev, [c.id]: { status: "testing" } }));
    const result = await testImageConnection(c);
    setImgTests((prev) => ({ ...prev, [c.id]: result }));
  };

  // 测试 VLM 连接（复用 LLM 测试，因为 VLM = LLM with vision）
  const handleTestVLM = async (c: UserLLMConfig) => {
    setVlmTests((prev) => ({ ...prev, [c.id]: { status: "testing" } }));
    const result = await testLLMConnection(c);
    setVlmTests((prev) => ({ ...prev, [c.id]: result }));
  };

  const resetAccuracyForm = () => {
    setAccuracyFormFields(EMPTY_ACCURACY_PROVIDER_FORM);
    setAccuracyEditingId(null);
    setShowAccuracyForm(false);
  };

  const handleStartNewAccuracyProvider = () => {
    setAccuracyEditingId(null);
    setAccuracyFormFields(EMPTY_ACCURACY_PROVIDER_FORM);
    setShowAccuracyForm(true);
  };

  const handleStartEditAccuracyProvider = (provider: AccuracyProviderConfig) => {
    setAccuracyEditingId(provider.id);
    setAccuracyFormFields({
      name: provider.name,
      kind: provider.kind,
      vendor: provider.vendor,
      baseUrl: provider.baseUrl,
      apiKey: "",
      enabled: provider.enabled,
      priority: provider.priority,
    });
    setShowAccuracyForm(true);
  };

  const handleSaveAccuracyProvider = () => {
    if (!accuracyFormFields.name.trim()) {
      setMessage({ type: "error", text: "请填写 provider 名称" });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    if (!accuracyFormFields.baseUrl.trim()) {
      setMessage({ type: "error", text: "请填写 Base URL" });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const existingProvider = accuracyEditingId
      ? config.accuracyConfig.providers.find((provider) => provider.id === accuracyEditingId)
      : null;

    const providerData: Omit<AccuracyProviderConfig, "id"> = {
      name: accuracyFormFields.name.trim(),
      kind: accuracyFormFields.kind,
      vendor: accuracyFormFields.vendor,
      baseUrl: accuracyFormFields.baseUrl.trim(),
      apiKey: accuracyFormFields.apiKey.trim(),
      hasApiKey: accuracyFormFields.apiKey.trim().length > 0 || existingProvider?.hasApiKey || Boolean(existingProvider?.maskedApiKey),
      maskedApiKey: existingProvider?.maskedApiKey,
      enabled: accuracyFormFields.enabled,
      priority: accuracyFormFields.priority,
      capabilities: [accuracyFormFields.kind],
      healthStatus: existingProvider?.healthStatus,
      lastCheckedAt: existingProvider?.lastCheckedAt,
      lastError: existingProvider?.lastError,
    };

    if (accuracyEditingId) {
      updateAccuracyProviderById(accuracyEditingId, providerData);
      setMessage({ type: "success", text: "Accuracy Provider 已更新" });
    } else {
      addAccuracyProvider(providerData);
      setMessage({ type: "success", text: "Accuracy Provider 已添加" });
    }

    resetAccuracyForm();
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteAccuracyProvider = (id: string) => {
    const target = config.accuracyConfig.providers.find((provider) => provider.id === id);
    if (!target) return;
    if (confirm(`确定删除 provider「${target.name}」？`)) {
      removeAccuracyProvider(id);
      setMessage({ type: "success", text: `已删除 provider「${target.name}」` });
      setTimeout(() => setMessage(null), 3000);
      if (accuracyEditingId === id) {
        resetAccuracyForm();
      }
    }
  };

  const handleTestAccuracyProvider = async (providerId: string) => {
    setAccuracyTests((prev) => ({ ...prev, [providerId]: { status: "testing" } }));
    const result = await testAccuracyProvider(providerId);
    setAccuracyTests((prev) => ({ ...prev, [providerId]: result }));
    updateAccuracyProviderById(providerId, {
      healthStatus: result.healthStatus,
      lastCheckedAt: result.lastCheckedAt,
      lastError: result.lastError,
    });
  };

  // 清除配置
  const handleClearAll = () => {
    if (confirm("确定要清除所有 API 配置吗？此操作不可撤销。")) {
      clearAll();
      llmForm.cancel();
      imgForm.cancel();
      vlmForm.cancel();
      setMessage({ type: "success", text: "所有配置已清除" });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // ── Handler helpers ──

  const showMessage = (msg: { type: "success" | "error"; text: string }) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportSingleLLM = (c: UserLLMConfig) => exportSingleLLM(c, showMessage);
  const handleExportSingleImage = (c: UserImageConfig) => exportSingleImage(c, showMessage);

  if (!isLoaded) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* 返回首页 + 导出/导入 */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 返回首页
        </Link>
        <h1 className="text-2xl font-bold">API 设置</h1>
        <ConfigImportExport
          config={config}
          addLLM={addLLM}
          addImage={addImage}
          onMessage={showMessage}
        />
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-success/5 text-success border border-success/20"
              : "bg-error/5 text-error border border-error/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 配置状态卡片 */}
      <div className="p-4 rounded-xl border bg-card space-y-3">
        <h2 className="font-medium">配置状态</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                validation.hasLLM ? "bg-success/50" : "bg-gray-300"
              }`}
            ></span>
            <span className="text-sm">
              LLM: {config.llmConfigs.length} 个配置
              {validation.hasLLM ? "（已就绪）" : "（未配置）"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                validation.hasImage ? "bg-success/50" : "bg-gray-300"
              }`}
            ></span>
            <span className="text-sm">
              文生图: {config.imageConfigs.length} 个配置
              {validation.hasImage ? "（已就绪）" : "（未配置）"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                validation.hasVLM ? "bg-success/50" : "bg-gray-300"
              }`}
            ></span>
            <span className="text-sm">
              VLM: {(config.vlmConfigs || []).length} 个配置
              {validation.hasVLM ? "（已就绪）" : "（未配置）"}
            </span>
          </div>
        </div>
        {!validation.hasLLM && (
          <p className="text-xs text-muted-foreground">
            请先配置 LLM 才能生成漫画脚本。文生图为可选配置，未配置时将使用 prompt-only 模式。
          </p>
        )}
      </div>

      <div className="p-4 rounded-xl border bg-card space-y-3">
        <h2 className="font-medium">模型分工</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">LLM</span> 负责理解主题、规划叙事、生成分镜脚本与对白。</p>
          <p><span className="font-medium text-foreground">文生图</span> 负责把每格的 imagePrompt 生成为实际漫画画面。</p>
          <p><span className="font-medium text-foreground">VLM</span> 负责看图评分、发现视觉问题，并驱动视觉复检与自动返工判断。</p>
        </div>
      </div>

      <AccuracyProviderSection
        config={config.accuracyConfig}
        formFields={accuracyFormFields}
        editingId={accuracyEditingId}
        showForm={showAccuracyForm}
        testResults={accuracyTests}
        onChangeForm={(fields) => setAccuracyFormFields((prev) => ({ ...prev, ...fields }))}
        onStartNew={handleStartNewAccuracyProvider}
        onStartEdit={handleStartEditAccuracyProvider}
        onSave={handleSaveAccuracyProvider}
        onCancel={resetAccuracyForm}
        onDelete={handleDeleteAccuracyProvider}
        onTest={handleTestAccuracyProvider}
        onAssignSlot={assignAccuracySlot}
        onWhitelistChange={setAccuracyWhitelistDomains}
      />

      {/* LLM 配置区 */}
      <div className="p-6 rounded-xl border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">分镜脚本模型 (LLM)</h2>
            <p className="text-xs text-muted-foreground">
              用于生成漫画分镜脚本的大语言模型配置
            </p>
          </div>
          {!llmForm.showNew && !llmForm.editingId && (
            <button
              onClick={llmForm.startNew}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              + 添加
            </button>
          )}
        </div>

        {/* 配置列表 */}
        {config.llmConfigs.length > 0 && (
          <div className="space-y-2">
            {config.llmConfigs.map((c) => (
              <LLMConfigCard
                key={c.id}
                config={c}
                isActive={config.activeLLMId === c.id}
                testResult={llmTests[c.id]}
                onSetActive={setActiveLLM}
                onTest={handleTestLLM}
                onEdit={llmForm.startEdit}
                onDelete={removeLLM}
                onExport={handleExportSingleLLM}
              />
            ))}
          </div>
        )}

        {config.llmConfigs.length === 0 && !llmForm.showNew && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            暂无 LLM 配置，点击上方「+ 添加」按钮创建
          </div>
        )}

        {/* 新建 / 编辑表单 */}
        {(llmForm.showNew || llmForm.editingId) && (
          <LLMForm
            fields={llmForm.fields}
            isEditing={!!llmForm.editingId}
            onChange={llmForm.updateFields}
            onProviderChange={llmForm.handleProviderChange}
            onSave={handleSaveLLM}
            onCancel={llmForm.cancel}
          />
        )}
      </div>

      {/* 文生图配置区 */}
      <div className="p-6 rounded-xl border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">文生图模型</h2>
            <p className="text-xs text-muted-foreground">
              用于生成漫画图片的文生图 API 配置（可选）
            </p>
          </div>
          {!imgForm.showNew && !imgForm.editingId && (
            <button
              onClick={imgForm.startNew}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              + 添加
            </button>
          )}
        </div>

        {/* 配置列表 */}
        {config.imageConfigs.length > 0 && (
          <div className="space-y-2">
            {config.imageConfigs.map((c) => (
              <ImageConfigCard
                key={c.id}
                config={c}
                isActive={config.activeImageId === c.id}
                testResult={imgTests[c.id]}
                onSetActive={setActiveImage}
                onTest={handleTestImage}
                onEdit={imgForm.startEdit}
                onDelete={removeImage}
                onExport={handleExportSingleImage}
              />
            ))}
          </div>
        )}

        {config.imageConfigs.length === 0 && !imgForm.showNew && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            暂无文生图配置，点击上方「+ 添加」按钮创建
          </div>
        )}

        {(imgForm.showNew || imgForm.editingId) && (
          <ImageForm
            fields={imgForm.fields}
            isEditing={!!imgForm.editingId}
            onChange={imgForm.updateFields}
            onProviderChange={imgForm.handleProviderChange}
            onSave={handleSaveImage}
            onCancel={imgForm.cancel}
          />
        )}
      </div>

      {/* VLM 配置区 */}
      <div className="p-6 rounded-xl border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">视觉评分模型 (VLM)</h2>
            <p className="text-xs text-muted-foreground">
              用于评估生成图片质量的视觉语言模型。需要支持图片理解的模型（如 GPT-4o、Qwen-VL、Claude）。未配置时将使用 LLM 配置
            </p>
          </div>
          {!vlmForm.showNew && !vlmForm.editingId && (
            <button
              onClick={vlmForm.startNew}
              className="px-3 py-1.5 text-sm rounded-lg bg-lavender text-white hover:opacity-90 transition-opacity"
            >
              + 添加
            </button>
          )}
        </div>

        {(config.vlmConfigs || []).length > 0 && (
          <div className="space-y-2">
            {(config.vlmConfigs || []).map((c) => (
              <LLMConfigCard
                key={c.id}
                config={c}
                isActive={config.activeVLMId === c.id}
                testResult={vlmTests[c.id]}
                onSetActive={setActiveVLM}
                onTest={handleTestVLM}
                onEdit={vlmForm.startEdit}
                onDelete={removeVLM}
              />
            ))}
          </div>
        )}

        {(config.vlmConfigs || []).length === 0 && !vlmForm.showNew && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            暂无 VLM 配置。未配置时视觉评分将使用当前 LLM 配置
          </div>
        )}

        {(vlmForm.showNew || vlmForm.editingId) && (
          <LLMForm
            fields={vlmForm.fields}
            isEditing={!!vlmForm.editingId}
            onChange={vlmForm.updateFields}
            onProviderChange={vlmForm.handleProviderChange}
            onSave={handleSaveVLM}
            onCancel={vlmForm.cancel}
            presets={VLM_PRESETS}
            variant="vlm"
          />
        )}
      </div>

      {/* 数据备份 */}
      <div className="p-6 rounded-xl border bg-card">
        <BackupManager />
      </div>

      <div className="p-6 rounded-xl border bg-card">
        <MaintenancePanel />
      </div>

      {/* 数据迁移 */}
      <div className="p-6 rounded-xl border bg-card">
        <MigratePanel />
      </div>

      {/* 导出署名 */}
      <div className="p-6 rounded-xl border bg-card space-y-3">
        <h2 className="font-medium">导出署名</h2>
        <p className="text-xs text-muted-foreground">
          设置后，导出的 PNG 长图和小红书图片右下角会自动添加你的署名。留空则不添加。
        </p>
        <WatermarkInput />
      </div>

      {/* 危险区域 */}
      <div className="p-6 rounded-xl border border-error/20 bg-error/5 space-y-4">
        <h2 className="font-medium text-error">危险区域</h2>
        <p className="text-xs text-error">
          清除所有配置后，需要重新设置才能使用漫画生成功能。
        </p>
        <button
          onClick={handleClearAll}
          className="px-4 py-2 rounded-lg border border-error/30 text-error hover:bg-error/10 transition-colors text-sm"
        >
          清除所有配置
        </button>
      </div>
    </div>
  );
}
