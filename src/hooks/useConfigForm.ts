import { useState, useCallback } from "react";
import { APIProvider, UserLLMConfig, UserImageConfig, ImageEndpointType } from "@/lib/types";
import { getLLMPreset, getImagePreset, type LLMPreset } from "@/lib/config/presets";
import { LLMFormFields } from "@/components/settings/LLMForm";
import { ImageFormFields } from "@/components/settings/ImageForm";

// ============================================================
// LLM/VLM 表单状态管理（通过 options 参数区分）
// ============================================================

export function useLLMForm(actions: {
  addLLM: (data: Omit<UserLLMConfig, "id">) => void;
  updateLLMById: (id: string, data: Partial<Omit<UserLLMConfig, "id">>) => void;
}, options?: {
  getPreset?: (id: APIProvider) => LLMPreset | undefined;
  defaultProvider?: APIProvider;
}) {
  const resolvePreset = options?.getPreset ?? getLLMPreset;
  const defaultProvider = options?.defaultProvider ?? "deepseek";

  const getDefaults = useCallback((): LLMFormFields => {
    const preset = resolvePreset(defaultProvider);
    return {
      name: "",
      provider: defaultProvider,
      apiUrl: preset?.apiUrl || "",
      apiKey: "",
      model: preset?.defaultModel || "",
      protocolType: preset?.protocolType || "openai-compatible",
    };
  }, [resolvePreset, defaultProvider]);

  const [fields, setFields] = useState<LLMFormFields>(getDefaults);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const updateFields = useCallback((partial: Partial<LLMFormFields>) => {
    setFields((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setFields(getDefaults());
  }, [getDefaults]);

  const handleProviderChange = useCallback((provider: APIProvider) => {
    const preset = resolvePreset(provider);
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
  }, [resolvePreset]);

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
    if (!fields.apiUrl.trim() || !fields.model.trim()) {
      return "请填写 API URL 和模型名称";
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

function getDefaultImageFields(): ImageFormFields {
  const preset = getImagePreset("openai");
  return {
    ...DEFAULT_IMAGE_FIELDS,
    apiUrl: preset?.apiUrl || "",
    model: preset?.defaultModel || "",
    size: preset?.defaultSize || "1024x1024",
    endpointType: preset?.defaultEndpointType || "auto",
  };
}

export function useImageForm(actions: {
  addImage: (data: Omit<UserImageConfig, "id">) => void;
  updateImageById: (id: string, data: Partial<Omit<UserImageConfig, "id">>) => void;
}) {
  const [fields, setFields] = useState<ImageFormFields>(getDefaultImageFields);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const updateFields = useCallback((partial: Partial<ImageFormFields>) => {
    setFields((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setFields(getDefaultImageFields());
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
      comfyuiWorkflow: c.comfyuiWorkflow,
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
    if (!fields.apiUrl.trim()) {
      return "请填写 API URL";
    }
    // ComfyUI 不需要 API Key，但需要 Workflow
    if (fields.endpointType === "comfyui") {
      if (!fields.comfyuiWorkflow?.trim()) return "请粘贴 ComfyUI Workflow JSON";
    } else if (!fields.apiKey.trim()) {
      return "请填写 API Key";
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
      ...(fields.endpointType === "comfyui" && fields.comfyuiWorkflow && {
        comfyuiWorkflow: fields.comfyuiWorkflow,
      }),
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
