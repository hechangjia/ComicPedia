import type {
  AccuracyProviderConfig,
  AccuracyProviderKind,
  AccuracyProviderSlots,
  AccuracySettings,
} from "@/lib/types";
import { normalizeAccuracyConfig } from "@/lib/accuracy/providerConfig";

export type AccuracyProviderSlotName = keyof AccuracyProviderSlots;

function getSlotKind(slot: AccuracyProviderSlotName): AccuracyProviderKind {
  return slot.toLowerCase().includes("fetch") ? "fetch" : "search";
}

function getSlotNamesForKind(kind: AccuracyProviderKind): AccuracyProviderSlotName[] {
  return kind === "fetch"
    ? ["primaryFetch", "fallbackFetch"]
    : ["primarySearch", "fallbackSearch"];
}

function isValidProviderForSlot(provider: AccuracyProviderConfig | undefined, slot: AccuracyProviderSlotName): provider is AccuracyProviderConfig {
  return Boolean(provider && provider.enabled && provider.kind === getSlotKind(slot));
}

export function getAssignedProvider(
  config: Partial<AccuracySettings> | null | undefined,
  slot: AccuracyProviderSlotName,
): AccuracyProviderConfig | null {
  const normalized = normalizeAccuracyConfig(config);
  const providerId = normalized.slots[slot];
  const provider = normalized.providers.find((item) => item.id === providerId);
  return isValidProviderForSlot(provider, slot) ? provider : null;
}

export function resolveAccuracyProviders(
  config: Partial<AccuracySettings> | null | undefined,
  kind: AccuracyProviderKind,
): AccuracyProviderConfig[] {
  const normalized = normalizeAccuracyConfig(config);
  const slotted = getSlotNamesForKind(kind)
    .map((slot) => getAssignedProvider(normalized, slot))
    .filter((provider): provider is AccuracyProviderConfig => provider !== null);

  const slottedIds = new Set(slotted.map((provider) => provider.id));
  const remaining = normalized.providers
    .filter((provider) => provider.enabled && provider.kind === kind && !slottedIds.has(provider.id))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  return [...slotted, ...remaining];
}

export function getWhitelistDomains(config: Partial<AccuracySettings> | null | undefined): string[] {
  return normalizeAccuracyConfig(config).whitelistDomains;
}
