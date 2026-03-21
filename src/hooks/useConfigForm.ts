import { useState, useCallback } from "react";
import { APIProvider, UserLLMConfig, UserImageConfig, ImageEndpointType } from "@/lib/types";
import { getLLMPreset, getImagePreset } from "@/lib/config/presets";
import { LLMFormFields } from "@/components/settings/LLMForm";
import { ImageFormFields } from "@/components/settings/ImageForm";

// ============================================================
// LLM 表单状态管理
// ============================================================

const DEFAULT_LLM_FIELDS: LLMFormFields = {
  name: "",
  provider: "deepseek",
  apiUrl: "",
  apiKey: "",
  model: "",
  protocolType: "openai-compatible",
};

export function useLLMForm(actions: {
  addLLM: (data: Omit<UserLLMConfig, "id">) => void;
  updateLLMById: (id: string, data: Partial<Omit<UserLLMConfig, "id">>) => void;
}) {
  const [fields, setFields] = useState<LLMFormFields>(() => {
    const preset = getLLMPreset("deepseek");
    return {
      ...DEFAULT_LLM_FIELDS,
      apiUrl: preset?.apiUrl || "",
      model: preset?.defaultModel || "",
      protocolType: preset?.protocolType || "openai-compatible",
    };
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const updateFields = useCallback((partial: Partial<LLMFormFields>) => {
    setFields((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    const preset = getLLMPreset("deepseek");
    setFields({
      ...DEFAULT_LLM_FIELDS,
      apiUrl: preset?.apiUrl || "",
      model: preset?.defaultModel || "",
      protocolType: preset?.protocolType || "openai-compatible",
    });
  }, []);

  const handleProviderChange = useCallback((provider: APIProvider) => {
    const preset = getLLMPreset(provider);
    setFields((prev) => {
      const next = { ...prev, provider };
      if (preset && provider !== "custom") {
        next.apiUrl = preset.apiUrl;
        next.model = preset.defaultModel;
        next.protocolType = preset.protocolType;
        if (!prev.name) next.name = preset.name;
      }
      return next;
    });
  }, []);

  const populate = useCallback((c: UserLLMConfig) => {
    setFields({
      name: c.name,
      provider: c.provider,
      apiUrl: c.apiUrl,
      apiKey: c.apiKey,
      model: c.model,
      protocolType: c.protocolType,
    });
  }, []);

  const startNew = useCallback(() => {
    setEditingId(null);
    reset();
    setShowNew(true);
  }, [reset]);

  const startEdit = useCallback((c: UserLLMConfig) => {
    setShowNew(false);
    setEditingId(c.id);
    populate(c);
  }, [populate]);

  const cancel = useCallback(() => {
    setEditingId(null);
    setShowNew(false);
    reset();
  }, [reset]);

  /** 保存。返回 true 表示成功，返回错误信息字符串表示失败。 */
  const save = useCallback((): true | string => {
    if (!fields.apiUrl.trim() || !fields.apiKey.trim() || !fields.model.trim()) {
      return "请填写完整的 LLM 配置";
    }

    const name = fields.name.trim() || `${fields.provider} - ${fields.model.trim()}`;
    const data = {
      name,
      provider: fields.provider,
      apiUrl: fields.apiUrl.trim(),
      apiKey: fields.apiKey.trim(),
      model: fields.model.trim(),
      protocolType: fields.protocolType,
    };

    if (editingId) {
      actions.updateLLMById(editingId, data);
      setEditingId(null);
    } else {
      actions.addLLM(data);
      setShowNew(false);
    }
    reset();
    return true;
  }, [fields, editingId, actions, reset]);

  return {
    fields,
    editingId,
    showNew,
    updateFields,
    handleProviderChange,
    startNew,
    startEdit,
    cancel,
    save,
  };
}

// ============================================================
// 文生图表单状态管理
// ============================================================

const DEFAULT_IMAGE_FIELDS: ImageFormFields = {
  name: "",
  provider: "openai",
  apiUrl: "",
  apiKey: "",
  model: "",
  size: "1024x1024",
  endpointType: "auto",
};

export function useImageForm(actions: {
  addImage: (data: Omit<UserImageConfig, "id">) => void;
  updateImageById: (id: string, data: Partial<Omit<UserImageConfig, "id">>) => void;
}) {
  const [fields, setFields] = useState<ImageFormFields>(() => {
    const preset = getImagePreset("openai");
    return {
      ...DEFAULT_IMAGE_FIELDS,
      apiUrl: preset?.apiUrl || "",
      model: preset?.defaultModel || "",
      size: preset?.defaultSize || "1024x1024",
      endpointType: preset?.defaultEndpointType || "auto",
    };
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const updateFields = useCallback((partial: Partial<ImageFormFields>) => {
    setFields((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    const preset = getImagePreset("openai");
    setFields({
      ...DEFAULT_IMAGE_FIELDS,
      apiUrl: preset?.apiUrl || "",
      model: preset?.defaultModel || "",
      size: preset?.defaultSize || "1024x1024",
      endpointType: preset?.defaultEndpointType || "auto",
    });
  }, []);

  const handleProviderChange = useCallback((provider: APIProvider) => {
    const preset = getImagePreset(provider);
    setFields((prev) => {
      const next = { ...prev, provider };
      if (preset && provider !== "custom") {
        next.apiUrl = preset.apiUrl;
        next.model = preset.defaultModel;
        next.size = preset.defaultSize;
        next.endpointType = preset.defaultEndpointType;
        if (!prev.name) next.name = preset.name;
      }
      return next;
    });
  }, []);

  const populate = useCallback((c: UserImageConfig) => {
    setFields({
      name: c.name,
      provider: c.provider,
      apiUrl: c.apiUrl,
      apiKey: c.apiKey,
      model: c.model,
      size: c.size,
      endpointType: c.endpointType || "auto",
    });
  }, []);

  const startNew = useCallback(() => {
    setEditingId(null);
    reset();
    setShowNew(true);
  }, [reset]);

  const startEdit = useCallback((c: UserImageConfig) => {
    setShowNew(false);
    setEditingId(c.id);
    populate(c);
  }, [populate]);

  const cancel = useCallback(() => {
    setEditingId(null);
    setShowNew(false);
    reset();
  }, [reset]);

  /** 保存。返回 true 表示成功，返回错误信息字符串表示失败。 */
  const save = useCallback((): true | string => {
    if (!fields.apiUrl.trim() || !fields.apiKey.trim()) {
      return "请填写完整的文生图配置";
    }

    const name = fields.name.trim() || `${fields.provider} - ${fields.model.trim() || "default"}`;
    const data = {
      name,
      provider: fields.provider,
      apiUrl: fields.apiUrl.trim(),
      apiKey: fields.apiKey.trim(),
      model: fields.model.trim() || "default",
      size: fields.size.trim() || "1024x1024",
      endpointType: fields.endpointType,
    };

    if (editingId) {
      actions.updateImageById(editingId, data);
      setEditingId(null);
    } else {
      actions.addImage(data);
      setShowNew(false);
    }
    reset();
    return true;
  }, [fields, editingId, actions, reset]);

  return {
    fields,
    editingId,
    showNew,
    updateFields,
    handleProviderChange,
    startNew,
    startEdit,
    cancel,
    save,
  };
}
