import type {
  AccuracyProviderConfig,
  AccuracyProviderKind,
  AccuracyProviderSlots,
  AccuracySettings,
} from "@/lib/types";

const EMPTY_SLOTS: AccuracyProviderSlots = {
  primarySearch: null,
  fallbackSearch: null,
  primaryFetch: null,
  fallbackFetch: null,
};

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function normalizeKind(kind: AccuracyProviderKind | undefined): AccuracyProviderKind {
  return kind === "fetch" ? "fetch" : "search";
}

function normalizeProvider(input: Partial<AccuracyProviderConfig>): AccuracyProviderConfig | null {
  if (!input.id?.trim() || !input.name?.trim() || !input.baseUrl?.trim()) {
    return null;
  }

  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : undefined;
  const hasApiKey = input.hasApiKey === true || Boolean(apiKey);
  const maskedApiKey = typeof input.maskedApiKey === "string" && input.maskedApiKey.trim().length > 0
    ? input.maskedApiKey.trim()
    : apiKey
      ? maskApiKey(apiKey)
      : undefined;

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    kind: normalizeKind(input.kind),
    vendor: input.vendor === "firecrawl" || input.vendor === "tavily" ? input.vendor : "custom",
    baseUrl: input.baseUrl.trim(),
    apiKey: apiKey || undefined,
    hasApiKey,
    maskedApiKey,
    capabilities: Array.isArray(input.capabilities)
      ? Array.from(new Set(input.capabilities.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))
      : [],
    enabled: input.enabled !== false,
    priority: typeof input.priority === "number" ? input.priority : 0,
    healthStatus: input.healthStatus,
    lastCheckedAt: typeof input.lastCheckedAt === "string" ? input.lastCheckedAt : undefined,
    lastError: typeof input.lastError === "string" && input.lastError.trim().length > 0 ? input.lastError.trim() : undefined,
  };
}

function getExpectedKindForSlot(slot: keyof AccuracyProviderSlots): AccuracyProviderKind {
  return slot.toLowerCase().includes("fetch") ? "fetch" : "search";
}

function isSlotValid(slot: keyof AccuracyProviderSlots, providerId: string | null, providers: AccuracyProviderConfig[]): boolean {
  if (!providerId) return false;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider || !provider.enabled) return false;
  return provider.kind === getExpectedKindForSlot(slot);
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return "*".repeat(apiKey.length);
  return `${apiKey.slice(0, 2)}****${apiKey.slice(-4)}`;
}

export function createEmptyAccuracyConfig(): AccuracySettings {
  return {
    providers: [],
    slots: { ...EMPTY_SLOTS },
    whitelistDomains: [],
  };
}

export function dropInvalidAccuracySlots(config: AccuracySettings): AccuracySettings {
  const slots: AccuracyProviderSlots = { ...config.slots };

  (Object.keys(slots) as Array<keyof AccuracyProviderSlots>).forEach((slot) => {
    if (!isSlotValid(slot, slots[slot], config.providers)) {
      slots[slot] = null;
    }
  });

  return {
    ...config,
    slots,
  };
}

export function normalizeAccuracyConfig(config?: Partial<AccuracySettings> | null): AccuracySettings {
  const base = createEmptyAccuracyConfig();
  const providers = Array.isArray(config?.providers)
    ? config.providers
        .map((provider) => normalizeProvider(provider))
        .filter((provider): provider is AccuracyProviderConfig => provider !== null)
    : [];

  const whitelistDomains = Array.isArray(config?.whitelistDomains)
    ? Array.from(new Set(
        config.whitelistDomains
          .filter((domain): domain is string => typeof domain === "string")
          .map(normalizeDomain)
          .filter(Boolean),
      ))
    : [];

  return dropInvalidAccuracySlots({
    providers,
    slots: {
      primarySearch: config?.slots?.primarySearch ?? base.slots.primarySearch,
      fallbackSearch: config?.slots?.fallbackSearch ?? base.slots.fallbackSearch,
      primaryFetch: config?.slots?.primaryFetch ?? base.slots.primaryFetch,
      fallbackFetch: config?.slots?.fallbackFetch ?? base.slots.fallbackFetch,
    },
    whitelistDomains,
  });
}

export function sanitizeAccuracyConfigForClient(config?: Partial<AccuracySettings> | null): AccuracySettings {
  const normalized = normalizeAccuracyConfig(config);

  return {
    ...normalized,
    providers: normalized.providers.map((provider) => {
      const { apiKey, ...rest } = provider;
      return {
        ...rest,
        hasApiKey: Boolean(apiKey),
        maskedApiKey: apiKey ? maskApiKey(apiKey) : undefined,
      };
    }),
  };
}

export function mergeAccuracyProviderSecrets(
  existingConfig?: Partial<AccuracySettings> | null,
  incomingConfig?: Partial<AccuracySettings> | null,
): AccuracySettings {
  const existing = normalizeAccuracyConfig(existingConfig);
  const incoming = normalizeAccuracyConfig(incomingConfig);
  const existingProviders = new Map(existing.providers.map((provider) => [provider.id, provider]));

  const providers = incoming.providers.map((provider) => {
    const existingProvider = existingProviders.get(provider.id);
    if (!existingProvider) return provider;

    const nextApiKey = provider.apiKey && provider.apiKey.trim().length > 0
      ? provider.apiKey.trim()
      : existingProvider.apiKey;

    return {
      ...provider,
      apiKey: nextApiKey,
      hasApiKey: Boolean(nextApiKey),
      maskedApiKey: nextApiKey ? maskApiKey(nextApiKey) : provider.maskedApiKey ?? existingProvider.maskedApiKey,
      healthStatus: provider.healthStatus ?? existingProvider.healthStatus,
      lastCheckedAt: provider.lastCheckedAt ?? existingProvider.lastCheckedAt,
      lastError: provider.lastError ?? existingProvider.lastError,
    };
  });

  return normalizeAccuracyConfig({
    ...incoming,
    providers,
  });
}

export function validateAccuracyConfig(config?: Partial<AccuracySettings> | null): string[] {
  const normalized = normalizeAccuracyConfig(config);
  const errors: string[] = [];

  normalized.providers.forEach((provider) => {
    if (!provider.baseUrl.trim()) {
      errors.push(`Provider ${provider.name} 缺少 baseUrl`);
    }
  });

  return errors;
}
