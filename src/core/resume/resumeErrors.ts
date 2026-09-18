/**
 * User-facing Resume error codes without document or JD text (Phase 10E).
 *
 * Surfaces `RESUME_ZIP`, `RESUME_OLLAMA`, and `RESUME_GROUNDING` as reportable
 * codes. Never copies unknown `Error.message` into the UI (that is how JD /
 * resume plaintext would leak). Never logs payloads.
 */

import { MapperError } from "../dbMappers";
import {
  classifyOllamaFetchFailure,
  isOllamaClientError,
} from "../../lib/ollamaClient";
import { resumeAiConnectionCopy } from "./resumeAiConnection";
import { PatchError } from "./resumeOoxmlPatch";
import { ResumeOoxmlReadError } from "./resumeOoxmlRead";
import { ResumeOoxmlWriteError } from "./resumeOoxmlWrite";
import { ResumeZipError } from "./resumeZip";

export const RESUME_USER_ERROR_CODES = [
  "RESUME_ZIP",
  "RESUME_OLLAMA",
  "RESUME_GROUNDING",
] as const;

export type ResumeUserErrorCode = (typeof RESUME_USER_ERROR_CODES)[number];

export const RESUME_USER_ERROR_MESSAGES: Record<ResumeUserErrorCode, string> = {
  RESUME_ZIP: "This Word file could not be read.",
  RESUME_OLLAMA: "Local AI is unavailable. Job-match coverage still works.",
  RESUME_GROUNDING: "That wording is not supported by imported resume evidence.",
};

const MAX_TRUSTED_CANNED_MESSAGE_LENGTH = 160;

export class ResumeUserError extends Error {
  readonly resumeCode: ResumeUserErrorCode;

  constructor(code: ResumeUserErrorCode, detail?: string) {
    super(formatResumeUserError(code, detail));
    this.name = "ResumeUserError";
    this.resumeCode = code;
  }
}

export function isResumeUserErrorCode(value: unknown): value is ResumeUserErrorCode {
  return (
    typeof value === "string" &&
    (RESUME_USER_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function formatResumeUserError(
  code: ResumeUserErrorCode,
  detail: string = RESUME_USER_ERROR_MESSAGES[code]
): string {
  const trimmed = detail.trim() || RESUME_USER_ERROR_MESSAGES[code];
  if (trimmed.startsWith(`${code}:`)) return trimmed;
  return `${code}: ${trimmed}`;
}

export function classifyResumeUserError(err: unknown): ResumeUserErrorCode | null {
  if (err instanceof ResumeUserError) return err.resumeCode;
  if (err instanceof ResumeZipError) return "RESUME_ZIP";
  if (err instanceof ResumeOoxmlReadError) return "RESUME_ZIP";
  if (err instanceof ResumeOoxmlWriteError) return "RESUME_ZIP";
  if (err instanceof PatchError) return "RESUME_ZIP";
  if (isOllamaClientError(err)) return "RESUME_OLLAMA";
  if (hasResumeCode(err, "RESUME_GROUNDING")) return "RESUME_GROUNDING";
  if (hasResumeCode(err, "RESUME_ZIP")) return "RESUME_ZIP";
  if (hasResumeCode(err, "RESUME_OLLAMA")) return "RESUME_OLLAMA";
  return null;
}

/**
 * Map any thrown value to UI copy. Unknown errors use `fallback` only — never
 * `err.message`, MapperError text, or Supabase payloads.
 */
export function resumeSafeMessage(err: unknown, fallback: string): string {
  if (err instanceof ResumeUserError) return err.message;

  const classified = classifyResumeUserError(err);
  if (classified === "RESUME_OLLAMA") {
    const kind = isOllamaClientError(err)
      ? classifyOllamaFetchFailure(err)
      : "unavailable";
    return formatResumeUserError("RESUME_OLLAMA", resumeAiConnectionCopy(kind).headline);
  }
  if (classified === "RESUME_ZIP") {
    if (err instanceof PatchError) {
      return formatResumeUserError(
        "RESUME_ZIP",
        "This paragraph's formatting cannot be updated safely. Try a smaller change, or edit in Microsoft Word."
      );
    }
    return formatResumeUserError("RESUME_ZIP");
  }
  if (classified === "RESUME_GROUNDING") {
    return formatResumeUserError("RESUME_GROUNDING");
  }

  const trusted = trustedCannedMessage(err);
  if (trusted) return trusted;

  return fallback;
}

export function resumeZipUserMessage(cannedDetail?: string): string {
  return formatResumeUserError("RESUME_ZIP", cannedDetail);
}

export function resumeOllamaUserMessage(cannedDetail?: string): string {
  return formatResumeUserError("RESUME_OLLAMA", cannedDetail);
}

export function resumeGroundingUserMessage(cannedDetail?: string): string {
  return formatResumeUserError("RESUME_GROUNDING", cannedDetail);
}

function hasResumeCode(err: unknown, code: ResumeUserErrorCode): boolean {
  if (!err || typeof err !== "object") return false;
  if (!("resumeCode" in err)) return false;
  return err.resumeCode === code;
}

function trustedCannedMessage(err: unknown): string | null {
  if (err instanceof MapperError) return null;
  if (!(err instanceof Error)) return null;
  if (
    err.name !== "ResumeRemoteError" &&
    err.name !== "ResumeDiffError" &&
    err.name !== "ResumeJobDescriptionTooLongError"
  ) {
    return null;
  }
  const text = err.message.trim();
  if (!text || text.length > MAX_TRUSTED_CANNED_MESSAGE_LENGTH) return null;
  if (text.includes("\n") || text.includes("\r")) return null;
  return text;
}
