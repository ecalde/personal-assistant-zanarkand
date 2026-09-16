import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OLLAMA_BASE_URL } from "../../lib/ollamaClient";
import {
  DEFAULT_RESUME_AI_PREFERENCES,
  RESUME_AI_PREFERENCES_KEY,
  isLoopbackOllamaBaseUrl,
  loadResumeAiPreferences,
  normalizeResumeAiPreferences,
  pickDefaultOllamaModel,
  saveResumeAiPreferences,
} from "./resumeAiPreferences";

function mockLocalStorage(getItem: ReturnType<typeof vi.fn>, setItem: ReturnType<typeof vi.fn>) {
  const storage = { getItem, setItem };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
}

describe("normalizeResumeAiPreferences", () => {
  it("defaults empty or invalid values to loopback with no assumed model", () => {
    expect(normalizeResumeAiPreferences(null)).toEqual(DEFAULT_RESUME_AI_PREFERENCES);
    expect(normalizeResumeAiPreferences({ baseUrl: "   ", modelName: 12 })).toEqual({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      modelName: "",
    });
  });

  it("keeps a typed loopback URL and drops unknown keys", () => {
    expect(
      normalizeResumeAiPreferences({
        baseUrl: " http://localhost:11434/ ",
        modelName: "gemma4:e4b",
        apiKey: "secret",
      })
    ).toEqual({
      baseUrl: "http://localhost:11434/",
      modelName: "gemma4:e4b",
    });
  });
});

describe("loopback URL guard", () => {
  it("accepts 127.0.0.1 and localhost, rejects LAN", () => {
    expect(isLoopbackOllamaBaseUrl(DEFAULT_OLLAMA_BASE_URL)).toBe(true);
    expect(isLoopbackOllamaBaseUrl("http://localhost:11434")).toBe(true);
    expect(isLoopbackOllamaBaseUrl("http://192.168.1.10:11434")).toBe(false);
    expect(isLoopbackOllamaBaseUrl("not a url")).toBe(false);
  });
});

describe("pickDefaultOllamaModel", () => {
  it("prefers gemma4:12b, then e4b, then first available; never assumes a missing tag", () => {
    expect(pickDefaultOllamaModel([])).toBe("");
    expect(pickDefaultOllamaModel([{ name: "llama3:8b" }])).toBe("llama3:8b");
    expect(
      pickDefaultOllamaModel([{ name: "llama3:8b" }, { name: "gemma4:e4b" }, { name: "gemma4:12b" }])
    ).toBe("gemma4:12b");
    expect(pickDefaultOllamaModel([{ name: "llama3:8b" }, { name: "gemma4:e4b" }])).toBe(
      "gemma4:e4b"
    );
  });

  it("keeps a stored preference only when that tag is still installed", () => {
    expect(pickDefaultOllamaModel([{ name: "gemma4:12b" }, { name: "custom:tag" }], "custom:tag")).toBe(
      "custom:tag"
    );
    expect(pickDefaultOllamaModel([{ name: "gemma4:12b" }], "missing:tag")).toBe("gemma4:12b");
  });
});

describe("resume AI preference persistence", () => {
  beforeEach(() => {
    mockLocalStorage(vi.fn(() => null), vi.fn());
  });

  it("loads defaults when nothing is stored", () => {
    expect(loadResumeAiPreferences()).toEqual(DEFAULT_RESUME_AI_PREFERENCES);
  });

  it("reads stored JSON from pa.resume.ai.v1", () => {
    const getItem = vi.fn((key: string) =>
      key === RESUME_AI_PREFERENCES_KEY
        ? JSON.stringify({ baseUrl: "http://127.0.0.1:11434", modelName: "gemma4:12b" })
        : null
    );
    mockLocalStorage(getItem, vi.fn());
    expect(loadResumeAiPreferences()).toEqual({
      baseUrl: "http://127.0.0.1:11434",
      modelName: "gemma4:12b",
    });
  });

  it("ignores corrupt JSON", () => {
    mockLocalStorage(vi.fn(() => "{"), vi.fn());
    expect(loadResumeAiPreferences()).toEqual(DEFAULT_RESUME_AI_PREFERENCES);
  });

  it("persists a normalized snapshot without extra keys", () => {
    const setItem = vi.fn();
    mockLocalStorage(vi.fn(() => null), setItem);
    saveResumeAiPreferences({
      baseUrl: "http://127.0.0.1:11434",
      modelName: "gemma4:12b",
    });
    expect(setItem).toHaveBeenCalledWith(
      RESUME_AI_PREFERENCES_KEY,
      JSON.stringify({
        baseUrl: "http://127.0.0.1:11434",
        modelName: "gemma4:12b",
      })
    );
  });
});
