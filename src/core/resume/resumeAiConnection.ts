/**
 * Settings → Resume AI connection test (Phase 6A).
 *
 * Distinct user-facing copy for Ollama down, CORS / OLLAMA_ORIGINS, Local
 * Network / loopback permission deny, and mixed-content / browser gaps.
 * Coverage stays deterministic-only when the test fails. Never proxy Ollama
 * through Supabase or Vercel. Never log resume or JD text.
 */
import {
  classifyOllamaFetchFailure,
  listModels,
  type OllamaFailureKind,
  type OllamaModel,
} from "../../lib/ollamaClient";
import { pickDefaultOllamaModel } from "./resumeAiPreferences";

export type ResumeAiConnectionKind = "ok" | OllamaFailureKind;

export type ResumeAiConnectionCopy = {
  headline: string;
  detail: string;
  rewritingEnabled: boolean;
};

export type ResumeAiConnectionResult = ResumeAiConnectionCopy & {
  kind: ResumeAiConnectionKind;
  models: OllamaModel[];
  selectedModel: string;
  originHint: string;
};

export const CHROME_LOCAL_NETWORK_SETTINGS_URL =
  "chrome://settings/content/localNetworkAccess";

export const RESUME_AI_ONBOARDING_STEPS = [
  "Install Ollama on the same computer that will run the browser: https://ollama.com",
  "Pull a model: `ollama pull gemma4:12b` (or `gemma4:e4b` on a constrained Mac).",
  "Set OLLAMA_ORIGINS to the exact SPA origins, including scheme and port: `http://localhost:5173` (Vite) and the production HTTPS origin you actually use. Persist it (macOS example: launchctl setenv) and restart Ollama.",
  "Keep Ollama bound to loopback (default). Do not expose 0.0.0.0 for this personal tool. Use http://127.0.0.1:11434, not a LAN IP.",
  "Open Test connection from the same origin you will use for real work. Production HTTPS is the real gate, not only Vite.",
  "When the browser asks to allow local or loopback network access, choose Allow.",
  "If you chose Block: rewriting stays off. Re-enable via Chrome site settings (chrome://settings/content/localNetworkAccess or the equivalent loopback permission) and retry.",
  "If Test fails: job-match coverage still works. Rewriting stays off. Do not proxy Ollama through Supabase or Vercel.",
] as const;

const COPY: Record<ResumeAiConnectionKind, ResumeAiConnectionCopy> = {
  ok: {
    headline: "Connected to Ollama on this computer.",
    detail:
      "Models listed from this machine's loopback /api/tags. Resume files stay in your cloud account; AI rewriting uses Ollama on this computer. No paid inference API.",
    rewritingEnabled: true,
  },
  unavailable: {
    headline: "Ollama is not running on this computer.",
    detail:
      "Install Ollama, start it, and keep it on loopback (http://127.0.0.1:11434), then retry Test connection. Job-match coverage still works; rewriting stays off. This is not a CORS problem and not a local-network permission deny.",
    rewritingEnabled: false,
  },
  cors: {
    headline: "This page origin is not allowed by Ollama (CORS / OLLAMA_ORIGINS).",
    detail:
      "Set OLLAMA_ORIGINS to this exact origin (scheme, host, and port), including http://localhost:5173 for Vite and the production HTTPS origin you use for real work. Restart Ollama, then retry. This is not a local-network permission deny and does not mean Ollama is missing.",
    rewritingEnabled: false,
  },
  local_network_denied: {
    headline: "The browser denied local/loopback network access to Ollama.",
    detail:
      "When the browser asks to allow local or loopback network access, choose Allow. If you chose Block, re-enable it in Chrome site settings (chrome://settings/content/localNetworkAccess or the equivalent loopback permission) and retry. Rewriting stays off. This is not the same as Ollama not being installed, and it is not a CORS / OLLAMA_ORIGINS miss.",
    rewritingEnabled: false,
  },
  browser_unsupported: {
    headline: "This browser blocked the loopback request.",
    detail:
      "HTTPS pages cannot call arbitrary LAN HTTP. Use 127.0.0.1 (loopback), never a LAN IP, and pass loopback targeting when the browser supports it. Some browsers still block mixed content or lack Local Network Access. Try Chrome on this same origin. Coverage still works; rewriting stays off.",
    rewritingEnabled: false,
  },
};

export function resumeAiConnectionCopy(kind: ResumeAiConnectionKind): ResumeAiConnectionCopy {
  return COPY[kind];
}

export function classifyResumeAiConnectionError(error: unknown): OllamaFailureKind {
  return classifyOllamaFetchFailure(error);
}

export type TestResumeAiConnectionInput = {
  baseUrl: string;
  preferredModel?: string;
  pageOrigin?: string;
  isSecureContext?: boolean;
  listModelsImpl?: typeof listModels;
};

function pageOriginHint(pageOrigin: string | undefined): string {
  const origin = pageOrigin?.trim() ?? "";
  return origin;
}

function resultForKind(
  kind: ResumeAiConnectionKind,
  extras: {
    models?: OllamaModel[];
    selectedModel?: string;
    originHint: string;
  }
): ResumeAiConnectionResult {
  const copy = resumeAiConnectionCopy(kind);
  return {
    kind,
    ...copy,
    models: extras.models ?? [],
    selectedModel: extras.selectedModel ?? "",
    originHint: extras.originHint,
  };
}

export async function testResumeAiConnection(
  input: TestResumeAiConnectionInput
): Promise<ResumeAiConnectionResult> {
  const originHint = pageOriginHint(input.pageOrigin);
  if (input.isSecureContext === false) {
    return resultForKind("browser_unsupported", { originHint });
  }

  const list = input.listModelsImpl ?? listModels;
  try {
    const models = await list({ baseUrl: input.baseUrl });
    const selectedModel = pickDefaultOllamaModel(models, input.preferredModel);
    return resultForKind("ok", { models, selectedModel, originHint });
  } catch (error) {
    const kind = classifyResumeAiConnectionError(error);
    return resultForKind(kind, { originHint });
  }
}
