import { describe, expect, it, vi } from "vitest";
import {
  OllamaBrowserUnsupported,
  OllamaCors,
  OllamaLocalNetworkDenied,
  OllamaUnavailable,
  type OllamaModel,
} from "../../lib/ollamaClient";
import {
  CHROME_LOCAL_NETWORK_SETTINGS_URL,
  RESUME_AI_ONBOARDING_STEPS,
  classifyResumeAiConnectionError,
  resumeAiConnectionCopy,
  testResumeAiConnection,
} from "./resumeAiConnection";

function asListModels(impl: (options: { baseUrl?: string }) => Promise<OllamaModel[]>) {
  return impl as typeof import("../../lib/ollamaClient").listModels;
}

describe("resumeAiConnectionCopy", () => {
  it("keeps Ollama-down copy distinct from CORS and LNA deny", () => {
    const copy = resumeAiConnectionCopy("unavailable");
    expect(copy.rewritingEnabled).toBe(false);
    expect(copy.headline.toLowerCase()).toContain("not running");
    expect(copy.detail.toLowerCase()).toMatch(/not a cors problem/);
    expect(copy.detail.toLowerCase()).toMatch(/not a local-network permission deny/);
  });

  it("does not call a CORS miss an install failure or an LNA deny", () => {
    const copy = resumeAiConnectionCopy("cors");
    expect(copy.headline.toLowerCase()).toContain("ollama_origins");
    expect(copy.detail.toLowerCase()).toContain("localhost:5173");
    expect(copy.detail.toLowerCase()).toMatch(/production https/);
    expect(copy.detail.toLowerCase()).toMatch(/not a local-network permission deny/);
    expect(copy.detail.toLowerCase()).toMatch(/does not mean ollama is missing/);
  });

  it("does not collapse LNA deny into CORS or Ollama-down copy", () => {
    const copy = resumeAiConnectionCopy("local_network_denied");
    expect(copy.headline.toLowerCase()).toMatch(/denied local\/loopback/);
    expect(copy.detail).toContain(CHROME_LOCAL_NETWORK_SETTINGS_URL);
    expect(copy.detail.toLowerCase()).toMatch(/not the same as ollama not being installed/);
    expect(copy.detail.toLowerCase()).toMatch(/not a cors \/ ollama_origins miss/);
  });

  it("explains mixed content / browser gaps without calling them CORS", () => {
    const copy = resumeAiConnectionCopy("browser_unsupported");
    expect(copy.headline.toLowerCase()).toMatch(/browser blocked/);
    expect(copy.detail.toLowerCase()).toMatch(/mixed content/);
    expect(copy.detail.toLowerCase()).toMatch(/127\.0\.0\.1/);
    expect(copy.detail.toLowerCase()).not.toContain("ollama_origins");
  });

  it("success copy states local inference and no paid API", () => {
    const copy = resumeAiConnectionCopy("ok");
    expect(copy.rewritingEnabled).toBe(true);
    expect(copy.detail.toLowerCase()).toMatch(/no paid inference/);
    expect(copy.detail.toLowerCase()).toMatch(/ollama on this computer/);
  });
});

describe("onboarding steps", () => {
  it("covers install, origins for Vite and production HTTPS, Allow, and no proxy", () => {
    const joined = RESUME_AI_ONBOARDING_STEPS.join(" ").toLowerCase();
    expect(joined).toContain("ollama.com");
    expect(joined).toContain("gemma4:12b");
    expect(joined).toContain("http://localhost:5173");
    expect(joined).toContain("production https");
    expect(joined).toContain("allow");
    expect(joined).toContain(CHROME_LOCAL_NETWORK_SETTINGS_URL.toLowerCase());
    expect(joined).toContain("do not proxy ollama through supabase or vercel");
    expect(joined).toContain("coverage still works");
  });

  it("does not mention paid vendors or an ATS score", () => {
    const kinds = [
      "ok",
      "unavailable",
      "cors",
      "local_network_denied",
      "browser_unsupported",
    ] as const;
    const blob = `${kinds.map((kind) => {
      const copy = resumeAiConnectionCopy(kind);
      return `${copy.headline} ${copy.detail}`;
    }).join(" ")} ${RESUME_AI_ONBOARDING_STEPS.join(" ")}`.toLowerCase();
    expect(blob).not.toContain("openai");
    expect(blob).not.toContain("anthropic");
    expect(blob).not.toContain("ats score");
    expect(blob).not.toContain("ocr-extract");
  });
});

describe("testResumeAiConnection", () => {
  it("lists models from loopback tags and prefers gemma4:12b", async () => {
    const listModelsImpl = vi.fn(
      asListModels(async () => [{ name: "llama3:8b" }, { name: "gemma4:12b" }])
    );
    const result = await testResumeAiConnection({
      baseUrl: "http://127.0.0.1:11434",
      pageOrigin: "https://app.example",
      listModelsImpl,
    });
    expect(result.kind).toBe("ok");
    expect(result.rewritingEnabled).toBe(true);
    expect(result.selectedModel).toBe("gemma4:12b");
    expect(result.originHint).toBe("https://app.example");
    expect(listModelsImpl).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:11434" });
  });

  it("maps OllamaUnavailable to down copy, not CORS", async () => {
    const result = await testResumeAiConnection({
      baseUrl: "http://127.0.0.1:11434",
      listModelsImpl: asListModels(async () => {
        throw new OllamaUnavailable();
      }),
    });
    expect(result.kind).toBe("unavailable");
    expect(result.rewritingEnabled).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.headline.toLowerCase()).toContain("not running");
    expect(result.detail.toLowerCase()).toMatch(/not a cors/);
  });

  it("maps OllamaCors without calling it a permission deny", async () => {
    const result = await testResumeAiConnection({
      baseUrl: "http://127.0.0.1:11434",
      listModelsImpl: asListModels(async () => {
        throw new OllamaCors();
      }),
    });
    expect(result.kind).toBe("cors");
    expect(result.headline.toLowerCase()).toContain("cors");
    expect(result.detail.toLowerCase()).toMatch(/not a local-network permission deny/);
  });

  it("maps OllamaLocalNetworkDenied without calling it CORS or down", async () => {
    const result = await testResumeAiConnection({
      baseUrl: "http://127.0.0.1:11434",
      listModelsImpl: asListModels(async () => {
        throw new OllamaLocalNetworkDenied();
      }),
    });
    expect(result.kind).toBe("local_network_denied");
    expect(result.headline.toLowerCase()).toMatch(/denied/);
    expect(result.detail.toLowerCase()).toMatch(/not a cors/);
    expect(result.detail.toLowerCase()).toMatch(/not the same as ollama not being installed/);
  });

  it("maps mixed-content / browser-unsupported distinctly", async () => {
    const result = await testResumeAiConnection({
      baseUrl: "http://127.0.0.1:11434",
      listModelsImpl: asListModels(async () => {
        throw new OllamaBrowserUnsupported();
      }),
    });
    expect(result.kind).toBe("browser_unsupported");
    expect(classifyResumeAiConnectionError(new OllamaBrowserUnsupported())).toBe(
      "browser_unsupported"
    );
    expect(result.detail.toLowerCase()).toMatch(/mixed content/);
  });

  it("rejects a LAN base URL as unavailable without treating it as CORS", async () => {
    const result = await testResumeAiConnection({
      baseUrl: "http://192.168.1.10:11434",
    });
    expect(result.kind).toBe("unavailable");
    expect(result.detail.toLowerCase()).toMatch(/not a cors problem/);
  });

  it("treats a non-secure context as browser unsupported without fetching", async () => {
    const listModelsImpl = vi.fn(
      asListModels(async () => [{ name: "gemma4:12b" }])
    );
    const result = await testResumeAiConnection({
      baseUrl: "http://127.0.0.1:11434",
      isSecureContext: false,
      listModelsImpl,
    });
    expect(result.kind).toBe("browser_unsupported");
    expect(listModelsImpl).not.toHaveBeenCalled();
  });
});
