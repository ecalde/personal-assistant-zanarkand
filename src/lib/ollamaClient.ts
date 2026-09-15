/**
 * Browser → loopback Ollama client (Phase 0F).
 *
 * Production HTTPS → http://127.0.0.1:11434 can fail independently of Vite CORS:
 * Ollama down, missing OLLAMA_ORIGINS, Chromium Local Network / loopback
 * permission, or mixed content. Those failures must stay distinct so Settings
 * (Wave 6) can onboard instead of collapsing everything into “CORS.”
 *
 * No secrets. No paid inference. Never proxy through Supabase/Vercel.
 */

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 8_000;
export const OLLAMA_TAGS_PATH = "/api/tags";

const LOOPBACK_ADDRESS_SPACE = "loopback" as const;

type FetchAddressSpace = "loopback" | "local" | "private" | "public";

export type OllamaRequestInit = RequestInit & {
  targetAddressSpace?: FetchAddressSpace;
};

export class OllamaUnavailable extends Error {
  readonly code = "unavailable" as const;

  constructor(message = "Ollama is not reachable on loopback.") {
    super(message);
    this.name = "OllamaUnavailable";
  }
}

export class OllamaCors extends Error {
  readonly code = "cors" as const;

  constructor(
    message = "The browser blocked this origin from calling Ollama (CORS / OLLAMA_ORIGINS)."
  ) {
    super(message);
    this.name = "OllamaCors";
  }
}

export class OllamaLocalNetworkDenied extends Error {
  readonly code = "local_network_denied" as const;

  constructor(
    message = "The browser denied local/loopback network access to Ollama."
  ) {
    super(message);
    this.name = "OllamaLocalNetworkDenied";
  }
}

export type OllamaClientError = OllamaUnavailable | OllamaCors | OllamaLocalNetworkDenied;

export type OllamaModel = {
  name: string;
};

export type ListModelsOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  RequestCtor?: typeof Request;
};

export function isOllamaClientError(error: unknown): error is OllamaClientError {
  return (
    error instanceof OllamaUnavailable ||
    error instanceof OllamaCors ||
    error instanceof OllamaLocalNetworkDenied
  );
}

export function isLoopbackOllamaHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function resolveOllamaBaseUrl(baseUrl = DEFAULT_OLLAMA_BASE_URL): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new OllamaUnavailable("Ollama base URL is empty.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new OllamaUnavailable("Ollama base URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OllamaUnavailable("Ollama base URL must be http or https.");
  }
  if (!isLoopbackOllamaHostname(parsed.hostname)) {
    throw new OllamaUnavailable(
      "Ollama must be reached on loopback (127.0.0.1), not a LAN address."
    );
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${path === "/" ? "" : path}`;
}

export function ollamaTagsUrl(baseUrl = DEFAULT_OLLAMA_BASE_URL): string {
  return `${resolveOllamaBaseUrl(baseUrl)}${OLLAMA_TAGS_PATH}`;
}

export function supportsLoopbackTargetAddressSpace(
  RequestCtor: typeof Request | undefined = globalThis.Request
): boolean {
  if (typeof RequestCtor !== "function") return false;
  try {
    const init: OllamaRequestInit = { targetAddressSpace: LOOPBACK_ADDRESS_SPACE };
    new RequestCtor("http://127.0.0.1/", init);
    return true;
  } catch {
    return false;
  }
}

export function withLoopbackTargetAddressSpace(
  init: RequestInit = {},
  RequestCtor: typeof Request | undefined = globalThis.Request
): RequestInit {
  if (!supportsLoopbackTargetAddressSpace(RequestCtor)) {
    return { ...init };
  }
  const withSpace: OllamaRequestInit = {
    ...init,
    targetAddressSpace: LOOPBACK_ADDRESS_SPACE,
  };
  return withSpace;
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

function errorCause(error: unknown): unknown {
  if (error && typeof error === "object" && "cause" in error) {
    return error.cause;
  }
  return undefined;
}

function combinedFailureText(error: unknown): string {
  const parts = [errorName(error), errorMessage(error)];
  const cause = errorCause(error);
  if (cause !== undefined) {
    parts.push(errorName(cause), errorMessage(cause));
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function isAbortFailure(error: unknown): boolean {
  const name = errorName(error);
  if (name === "AbortError" || name === "TimeoutError") return true;
  const text = combinedFailureText(error);
  return text.includes("aborted") || text.includes("timeout");
}

function isUnknownTargetAddressSpaceFailure(error: unknown): boolean {
  const text = combinedFailureText(error);
  return (
    text.includes("targetaddressspace") ||
    (text.includes("unknown") && text.includes("address space")) ||
    (text.includes("unexpected") && text.includes("targetaddressspace"))
  );
}

export function classifyOllamaFetchFailure(
  error: unknown
): "local_network_denied" | "cors" | "unavailable" {
  if (isOllamaClientError(error)) {
    if (error instanceof OllamaLocalNetworkDenied) return "local_network_denied";
    if (error instanceof OllamaCors) return "cors";
    return "unavailable";
  }

  const name = errorName(error);
  const text = combinedFailureText(error);

  if (name === "NotAllowedError") return "local_network_denied";
  if (
    text.includes("local network access") ||
    text.includes("loopback-network") ||
    text.includes("loopback network") ||
    (text.includes("permission") && text.includes("loopback")) ||
    (name === "SecurityError" && (text.includes("local network") || text.includes("loopback")))
  ) {
    return "local_network_denied";
  }

  if (
    text.includes("cors") ||
    text.includes("access-control-allow-origin") ||
    text.includes("cross-origin")
  ) {
    return "cors";
  }

  return "unavailable";
}

export function mapOllamaFetchFailure(error: unknown): OllamaClientError {
  if (isOllamaClientError(error)) return error;
  const kind = classifyOllamaFetchFailure(error);
  if (kind === "local_network_denied") {
    return new OllamaLocalNetworkDenied();
  }
  if (kind === "cors") {
    return new OllamaCors();
  }
  if (isAbortFailure(error)) {
    return new OllamaUnavailable("Ollama did not respond before the timeout.");
  }
  return new OllamaUnavailable();
}

function parseOllamaErrorBody(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const error = (data as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error.trim();
  return undefined;
}

function parseTagsPayload(data: unknown): OllamaModel[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new OllamaUnavailable("Ollama returned an unexpected tags payload.");
  }
  const models = (data as { models?: unknown }).models;
  if (!Array.isArray(models)) {
    throw new OllamaUnavailable("Ollama returned an unexpected tags payload.");
  }
  const result: OllamaModel[] = [];
  for (const item of models) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const name = (item as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      result.push({ name: name.trim() });
    }
  }
  return result;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OllamaUnavailable("Ollama returned non-JSON.");
  }
}

async function fetchOllama(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  RequestCtor: typeof Request | undefined
): Promise<Response> {
  const withLoopback = withLoopbackTargetAddressSpace(init, RequestCtor);
  try {
    return await fetchImpl(url, withLoopback);
  } catch (error) {
    if (
      isUnknownTargetAddressSpaceFailure(error) &&
      "targetAddressSpace" in (withLoopback as OllamaRequestInit)
    ) {
      return await fetchImpl(url, init);
    }
    throw mapOllamaFetchFailure(error);
  }
}

export async function listModels(options: ListModelsOptions = {}): Promise<OllamaModel[]> {
  const url = ollamaTagsUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new OllamaUnavailable("fetch is not available.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchOllama(
      url,
      {
        method: "GET",
        signal: controller.signal,
        credentials: "omit",
      },
      fetchImpl,
      options.RequestCtor
    );

    const payload = await readJsonBody(response);
    if (!response.ok) {
      const mapped = parseOllamaErrorBody(payload);
      throw new OllamaUnavailable(mapped ?? `Ollama returned HTTP ${response.status}.`);
    }
    return parseTagsPayload(payload);
  } catch (error) {
    throw mapOllamaFetchFailure(error);
  } finally {
    clearTimeout(timer);
  }
}
