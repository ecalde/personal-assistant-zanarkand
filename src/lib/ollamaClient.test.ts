import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OLLAMA_BASE_URL,
  OllamaBrowserUnsupported,
  OllamaCors,
  OllamaLocalNetworkDenied,
  OllamaUnavailable,
  chatCompletion,
  classifyOllamaFetchFailure,
  isLoopbackOllamaHostname,
  listModels,
  mapOllamaFetchFailure,
  ollamaChatUrl,
  ollamaTagsUrl,
  supportsLoopbackTargetAddressSpace,
  withLoopbackTargetAddressSpace,
  type OllamaRequestInit,
} from "./ollamaClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return impl as typeof fetch;
}

describe("ollamaClient loopback URL", () => {
  it("defaults tags to 127.0.0.1:11434/api/tags", () => {
    expect(DEFAULT_OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434");
    expect(ollamaTagsUrl()).toBe("http://127.0.0.1:11434/api/tags");
  });

  it("accepts localhost and IPv6 loopback, rejects LAN hosts", () => {
    expect(isLoopbackOllamaHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackOllamaHostname("localhost")).toBe(true);
    expect(isLoopbackOllamaHostname("::1")).toBe(true);
    expect(isLoopbackOllamaHostname("192.168.1.10")).toBe(false);
    expect(isLoopbackOllamaHostname("0.0.0.0")).toBe(false);
    expect(() => ollamaTagsUrl("http://192.168.1.10:11434")).toThrow(OllamaUnavailable);
    expect(ollamaTagsUrl("http://localhost:11434/")).toBe("http://localhost:11434/api/tags");
  });
});

describe("targetAddressSpace feature-detect", () => {
  it("adds loopback when Request accepts the option", () => {
    const init = withLoopbackTargetAddressSpace({ method: "GET" });
    if (supportsLoopbackTargetAddressSpace()) {
      expect((init as OllamaRequestInit).targetAddressSpace).toBe("loopback");
    } else {
      expect((init as OllamaRequestInit).targetAddressSpace).toBeUndefined();
    }
  });

  it("omits the option when Request construction throws", () => {
    const ThrowingRequest = function ThrowingRequest() {
      throw new TypeError("Unknown option targetAddressSpace");
    } as unknown as typeof Request;
    const init = withLoopbackTargetAddressSpace({ method: "GET" }, ThrowingRequest);
    expect((init as OllamaRequestInit).targetAddressSpace).toBeUndefined();
    expect(init.method).toBe("GET");
  });
});

describe("classifyOllamaFetchFailure", () => {
  it("maps NotAllowedError to local network denied", () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    expect(classifyOllamaFetchFailure(error)).toBe("local_network_denied");
    expect(mapOllamaFetchFailure(error)).toBeInstanceOf(OllamaLocalNetworkDenied);
  });

  it("maps Local Network Access messages to local network denied", () => {
    const error = new TypeError(
      "Access to fetch at 'http://127.0.0.1:11434/api/tags' from origin 'https://example.com' has been blocked by Local Network Access"
    );
    expect(classifyOllamaFetchFailure(error)).toBe("local_network_denied");
  });

  it("maps CORS-shaped TypeErrors to cors, not LNA", () => {
    const error = new TypeError(
      "Access to fetch at 'http://127.0.0.1:11434/api/tags' from origin 'https://example.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource."
    );
    expect(classifyOllamaFetchFailure(error)).toBe("cors");
    expect(mapOllamaFetchFailure(error)).toBeInstanceOf(OllamaCors);
  });

  it("maps generic Failed to fetch to unavailable, not CORS", () => {
    const error = new TypeError("Failed to fetch");
    expect(classifyOllamaFetchFailure(error)).toBe("unavailable");
    expect(mapOllamaFetchFailure(error)).toBeInstanceOf(OllamaUnavailable);
  });

  it("maps mixed-content failures to browser unsupported, not CORS or LNA", () => {
    const error = new TypeError(
      "Mixed Content: The page at 'https://example.com/' was loaded over HTTPS, but requested an insecure resource 'http://127.0.0.1:11434/api/tags'."
    );
    expect(classifyOllamaFetchFailure(error)).toBe("browser_unsupported");
    expect(mapOllamaFetchFailure(error)).toBeInstanceOf(OllamaBrowserUnsupported);
    expect(mapOllamaFetchFailure(error)).not.toBeInstanceOf(OllamaCors);
    expect(mapOllamaFetchFailure(error)).not.toBeInstanceOf(OllamaLocalNetworkDenied);
  });
});

describe("listModels", () => {
  it("GETs /api/tags with no secrets and loopback address space when supported", async () => {
    const fetchImpl = vi.fn(
      asFetch(async () => jsonResponse({ models: [{ name: "gemma4:12b" }, { name: "  " }] }))
    );

    await expect(listModels({ fetchImpl })).resolves.toEqual([{ name: "gemma4:12b" }]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:11434/api/tags");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("omit");
    expect(init?.headers).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBeNull();
    if (supportsLoopbackTargetAddressSpace()) {
      expect((init as OllamaRequestInit | undefined)?.targetAddressSpace).toBe("loopback");
    }
  });

  it("maps connection failures to OllamaUnavailable", async () => {
    const fetchImpl = asFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(listModels({ fetchImpl })).rejects.toBeInstanceOf(OllamaUnavailable);
  });

  it("maps CORS-shaped failures to OllamaCors", async () => {
    const fetchImpl = asFetch(async () => {
      throw new TypeError(
        "Failed to fetch: blocked by CORS policy because Access-Control-Allow-Origin is missing"
      );
    });
    await expect(listModels({ fetchImpl })).rejects.toBeInstanceOf(OllamaCors);
  });

  it("maps NotAllowedError to OllamaLocalNetworkDenied", async () => {
    const fetchImpl = asFetch(async () => {
      throw new DOMException("The user denied local network access.", "NotAllowedError");
    });
    await expect(listModels({ fetchImpl })).rejects.toBeInstanceOf(OllamaLocalNetworkDenied);
  });

  it("maps mixed-content failures to OllamaBrowserUnsupported", async () => {
    const fetchImpl = asFetch(async () => {
      throw new TypeError(
        "Mixed Content: The page at 'https://example.com/' was loaded over HTTPS, but requested an insecure resource."
      );
    });
    await expect(listModels({ fetchImpl })).rejects.toBeInstanceOf(OllamaBrowserUnsupported);
  });

  it("does not treat LNA deny as CORS", async () => {
    const fetchImpl = asFetch(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    await expect(listModels({ fetchImpl })).rejects.not.toBeInstanceOf(OllamaCors);
  });

  it("retries without targetAddressSpace when the runtime rejects the option", async () => {
    const fetchImpl = vi.fn(
      asFetch(async (_url, init) => {
        if (init && "targetAddressSpace" in init) {
          throw new TypeError("Unknown option targetAddressSpace");
        }
        return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
      })
    );

    await expect(listModels({ fetchImpl })).resolves.toEqual([{ name: "gemma4:e4b" }]);
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(1);
    const lastInit = fetchImpl.mock.calls.at(-1)?.[1] as OllamaRequestInit | undefined;
    expect(lastInit?.targetAddressSpace).toBeUndefined();
  });

  it("maps timeout abort to OllamaUnavailable", async () => {
    const fetchImpl = asFetch(async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    await expect(listModels({ fetchImpl, timeoutMs: 20 })).rejects.toBeInstanceOf(OllamaUnavailable);
  });

  it("maps HTTP error JSON to OllamaUnavailable", async () => {
    const fetchImpl = asFetch(async () => jsonResponse({ error: "model not found" }, 500));
    await expect(listModels({ fetchImpl })).rejects.toMatchObject({
      name: "OllamaUnavailable",
      message: "model not found",
    });
  });

  it("rejects a LAN base URL without calling fetch", async () => {
    const fetchImpl = vi.fn(asFetch(async () => jsonResponse({ models: [] })));
    await expect(listModels({ fetchImpl, baseUrl: "http://10.0.0.2:11434" })).rejects.toBeInstanceOf(
      OllamaUnavailable
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call a real Ollama process", async () => {
    const fetchImpl = vi.fn(
      asFetch(async () => {
        throw new Error("test must mock fetch");
      })
    );
    await expect(listModels({ fetchImpl })).rejects.toBeInstanceOf(OllamaUnavailable);
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe("chatCompletion", () => {
  it("posts JSON chat to loopback /api/chat and returns message content", async () => {
    const fetchImpl = vi.fn(
      asFetch(async (url, init) => {
        expect(String(url)).toBe(ollamaChatUrl());
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          format?: string;
          stream: boolean;
          messages: { role: string; content: string }[];
        };
        expect(body.model).toBe("gemma4:12b");
        expect(body.format).toBe("json");
        expect(body.stream).toBe(false);
        expect(body.messages).toHaveLength(2);
        return jsonResponse({
          message: { role: "assistant", content: '{"proposedText":"Built REST APIs."}' },
        });
      })
    );

    const content = await chatCompletion({
      fetchImpl,
      model: "gemma4:12b",
      format: "json",
      messages: [
        { role: "system", content: "policy" },
        { role: "user", content: "{}" },
      ],
    });
    expect(content).toBe('{"proposedText":"Built REST APIs."}');
  });
});
