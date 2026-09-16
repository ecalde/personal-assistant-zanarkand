/**
 * Device-local Resume AI settings (Phase 6A).
 *
 * Architecture §33 recommends localStorage for MVP Ollama prefs
 * (`pa.resume.ai.v1`) instead of a cloud table. Base URL must stay on
 * loopback; the model tag is chosen from `/api/tags` at runtime (never
 * assumed to exist).
 */
import { DEFAULT_OLLAMA_BASE_URL, isLoopbackOllamaHostname } from "../../lib/ollamaClient";

export const RESUME_AI_PREFERENCES_KEY = "pa.resume.ai.v1";
export const RESUME_AI_BASE_URL_MAX_CHARS = 200;
export const RESUME_AI_MODEL_NAME_MAX_CHARS = 120;

/** Runtime preference order from architecture §27. Not stored as a hard default. */
export const PREFERRED_OLLAMA_MODEL_TAGS = ["gemma4:12b", "gemma4:e4b"] as const;

export type ResumeAiPreferences = {
  baseUrl: string;
  modelName: string;
};

export const DEFAULT_RESUME_AI_PREFERENCES: ResumeAiPreferences = {
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  modelName: "",
};

function asTrimmedString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxChars);
}

/**
 * Drop unknown keys and invalid values. Empty base URL becomes the loopback
 * default. LAN hosts are kept as typed (so the Settings field can show them)
 * but `listModels` still rejects them on Test.
 */
export function normalizeResumeAiPreferences(value: unknown): ResumeAiPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_RESUME_AI_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  const baseUrlRaw = asTrimmedString(record.baseUrl, RESUME_AI_BASE_URL_MAX_CHARS);
  const modelName = asTrimmedString(record.modelName, RESUME_AI_MODEL_NAME_MAX_CHARS) ?? "";
  const baseUrl = baseUrlRaw === undefined || baseUrlRaw === ""
    ? DEFAULT_OLLAMA_BASE_URL
    : baseUrlRaw;
  return { baseUrl, modelName };
}

export function loadResumeAiPreferences(): ResumeAiPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_RESUME_AI_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(RESUME_AI_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_RESUME_AI_PREFERENCES };
    return normalizeResumeAiPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_RESUME_AI_PREFERENCES };
  }
}

export function saveResumeAiPreferences(prefs: ResumeAiPreferences): ResumeAiPreferences {
  const normalized = normalizeResumeAiPreferences(prefs);
  if (typeof window === "undefined") return normalized;
  try {
    window.localStorage.setItem(RESUME_AI_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    // Persistence is best-effort; the in-memory preference still applies.
  }
  return normalized;
}

export function isLoopbackOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackOllamaHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Prefer gemma4:12b, then gemma4:e4b, then the first installed tag.
 * A stored preference wins only if it is still present in `/api/tags`.
 */
export function pickDefaultOllamaModel(
  models: readonly { name: string }[],
  preferred?: string
): string {
  const names = models
    .map((model) => model.name.trim())
    .filter((name) => name.length > 0);
  const preferredTrimmed = preferred?.trim() ?? "";
  if (preferredTrimmed && names.includes(preferredTrimmed)) return preferredTrimmed;
  for (const tag of PREFERRED_OLLAMA_MODEL_TAGS) {
    if (names.includes(tag)) return tag;
  }
  return names[0] ?? "";
}
