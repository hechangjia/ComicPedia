export interface PersistedImageLocation {
  ref: string;
  url: string;
  key: string;
  size?: number;
}

interface PersistImageInput {
  taskId: string;
  panelIndex?: number;
  refIndex?: number;
  title?: string;
  type?: "panel" | "reference";
  base64Data: string;
}

export async function persistClientImage(input: PersistImageInput): Promise<PersistedImageLocation | null> {
  if (!input.base64Data.startsWith("data:image")) {
    return null;
  }

  const response = await fetch("/api/save-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return null;
  }

  const body = await response.json().catch(() => null);
  return body?.url ? body as PersistedImageLocation : null;
}
