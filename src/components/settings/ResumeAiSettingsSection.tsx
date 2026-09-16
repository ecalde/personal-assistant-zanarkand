import { useCallback, useMemo, useState } from "react";
import { settingsStyles as s } from "./settingsStyles";
import {
  CHROME_LOCAL_NETWORK_SETTINGS_URL,
  RESUME_AI_ONBOARDING_STEPS,
  testResumeAiConnection,
  type ResumeAiConnectionResult,
} from "../../core/resume/resumeAiConnection";
import {
  DEFAULT_RESUME_AI_PREFERENCES,
  isLoopbackOllamaBaseUrl,
  loadResumeAiPreferences,
  saveResumeAiPreferences,
} from "../../core/resume/resumeAiPreferences";
import { DEFAULT_OLLAMA_BASE_URL } from "../../lib/ollamaClient";

function pageOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function isSecureContextNow(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  return window.isSecureContext;
}

export function ResumeAiSettingsSection() {
  const initial = useMemo(() => loadResumeAiPreferences(), []);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [modelName, setModelName] = useState(initial.modelName);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ResumeAiConnectionResult | null>(null);
  const origin = useMemo(() => pageOrigin(), []);

  const persist = useCallback((nextBaseUrl: string, nextModelName: string) => {
    saveResumeAiPreferences({ baseUrl: nextBaseUrl, modelName: nextModelName });
  }, []);

  const handleTest = useCallback(async () => {
    persist(baseUrl, modelName);
    setTesting(true);
    try {
      const next = await testResumeAiConnection({
        baseUrl: baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL,
        preferredModel: modelName,
        pageOrigin: origin,
        isSecureContext: isSecureContextNow(),
      });
      setResult(next);
      if (next.kind === "ok") {
        setModelName(next.selectedModel);
        persist(baseUrl, next.selectedModel);
      }
    } finally {
      setTesting(false);
    }
  }, [baseUrl, modelName, origin, persist]);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModelName(nextModel);
      persist(baseUrl, nextModel);
    },
    [baseUrl, persist]
  );

  const modelOptions = result?.kind === "ok" ? result.models : [];
  const statusStyle = result
    ? result.kind === "ok"
      ? s.statusOk
      : s.statusError
    : null;

  return (
    <>
      <section style={s.panel} aria-labelledby="resume-ai-heading">
        <div style={s.panelHeader}>
          <h2 id="resume-ai-heading" style={s.panelTitle}>
            Resume AI
          </h2>
          <p style={s.panelSubtitle}>
            Rewriting uses Ollama on this computer only. Job-match coverage still
            works if this test fails. The Resume editor is unchanged. There is no
            paid inference API and no cloud proxy.
          </p>
        </div>

        <label style={s.fieldStack}>
          <span style={s.fieldLabel}>Ollama base URL</span>
          <input
            type="url"
            value={baseUrl}
            autoComplete="off"
            spellCheck={false}
            placeholder={DEFAULT_RESUME_AI_PREFERENCES.baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            onBlur={() => persist(baseUrl, modelName)}
            style={s.fieldInput}
          />
          <p style={s.fieldHint}>
            Default is {DEFAULT_OLLAMA_BASE_URL}. Loopback only — never a LAN IP.
            {!isLoopbackOllamaBaseUrl(baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL)
              ? " This value is not loopback; Test will fail closed and will not call a LAN host."
              : null}
          </p>
        </label>

        <label style={s.fieldStack}>
          <span style={s.fieldLabel}>Model</span>
          <select
            value={modelName}
            disabled={modelOptions.length === 0}
            onChange={(event) => handleModelChange(event.target.value)}
            aria-label="Ollama model"
            style={s.fieldInput}
          >
            {modelOptions.length === 0 ? (
              <option value={modelName}>
                {modelName
                  ? `${modelName} (run Test connection to refresh)`
                  : "Run Test connection to list models"}
              </option>
            ) : (
              modelOptions.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))
            )}
          </select>
          <p style={s.fieldHint}>
            Detected at runtime from /api/tags. Prefer gemma4:12b if installed,
            else gemma4:e4b, else the first available model. Tags are never
            assumed.
          </p>
        </label>

        <div style={s.previewButtonRow}>
          <button
            type="button"
            style={s.previewButtonPrimary}
            onClick={() => void handleTest()}
            disabled={testing}
            aria-busy={testing}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {origin ? (
          <p style={s.fieldHint}>
            This page origin (put this exact value in OLLAMA_ORIGINS):{" "}
            <strong>{origin}</strong>
          </p>
        ) : null}

        {result && statusStyle ? (
          <div
            style={statusStyle}
            role={result.kind === "ok" ? "status" : "alert"}
          >
            <p style={s.statusTitle}>{result.headline}</p>
            <p style={s.statusBody}>{result.detail}</p>
            {result.kind === "ok" && result.models.length > 0 ? (
              <p style={s.statusBody}>
                Installed models: {result.models.map((model) => model.name).join(", ")}
              </p>
            ) : null}
            {result.kind === "local_network_denied" ? (
              <p style={s.statusBody}>
                Chrome reset path: {CHROME_LOCAL_NETWORK_SETTINGS_URL}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section style={s.panel} aria-labelledby="resume-ai-onboarding-heading">
        <div style={s.panelHeader}>
          <h2 id="resume-ai-onboarding-heading" style={s.panelTitle}>
            Local Ollama setup
          </h2>
          <p style={s.panelSubtitle}>
            Production HTTPS to 127.0.0.1 is a different gate than Vite. CORS,
            Local Network Access, mixed content, and Ollama being down are
            separate failures. Deny permission once to confirm rewriting stays
            off; coverage and the editor keep working.
          </p>
        </div>
        <ol style={s.onboardingList}>
          {RESUME_AI_ONBOARDING_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </>
  );
}
