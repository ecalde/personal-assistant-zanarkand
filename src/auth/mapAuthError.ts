import { AuthError } from "@supabase/supabase-js";

const GENERIC = "Something went wrong. Try again.";

const KNOWN_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  email_not_confirmed: "Confirm your email address before signing in.",
  /** Legacy / alternate client wording */
  user_already_registered: "An account with this email already exists. Try signing in.",
  /** Current GoTrue-style codes */
  email_exists: "An account with this email already exists. Try signing in.",
  user_already_exists: "An account with this email already exists. Try signing in.",
  weak_password: "Password is too weak. Use a stronger password.",
  invalid_email: "Enter a valid email address.",
  validation_failed: "Check your email and password and try again.",
  over_email_send_rate_limit: "Too many attempts. Wait a moment and try again.",
  over_request_rate_limit: "Too many attempts. Wait a moment and try again.",
  signup_disabled: "Sign up is not available.",
  captcha_failed: "Captcha check failed. Try again.",
};

/**
 * When `code` is missing, map known SDK class names only (never use err.message).
 * Names are fixed strings from `@supabase/auth-js`, not user input.
 */
const NAME_MESSAGES: Record<string, string> = {
  AuthUnknownError:
    "Sign-up could not be completed. Check your network connection and Supabase URL in your environment.",
  AuthRetryableFetchError: "Could not reach the authentication service. Try again.",
  AuthInvalidCredentialsError: "Invalid email or password.",
};

/** SDK marks auth errors; `instanceof` can fail across duplicate bundles so we check both. */
function isSupabaseAuthError(err: unknown): boolean {
  if (err instanceof AuthError) return true;
  return isRecord(err) && "__isAuthError" in err;
}

/** Allow only Supabase-style snake_case codes; blocks odd payloads from becoming UI text. */
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_CODE_LEN = 64;

/** GoTrue sets `AuthError.name` / subclass names — allowlist avoids spoofed UI strings */
const SAFE_ERROR_NAME_PATTERN = /^Auth[A-Za-z0-9]{2,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSafeCode(err: unknown): string | null {
  if (!isSupabaseAuthError(err) || !isRecord(err) || !("code" in err)) {
    return null;
  }

  const raw = err.code;
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CODE_LEN) {
    return null;
  }

  if (!SAFE_CODE_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function safeMessageFromErrorName(err: unknown): string | null {
  if (!isSupabaseAuthError(err) || !isRecord(err)) {
    return null;
  }
  const rawName = err.name;
  if (typeof rawName !== "string" || !SAFE_ERROR_NAME_PATTERN.test(rawName)) {
    return null;
  }
  return NAME_MESSAGES[rawName] ?? null;
}

export function mapAuthError(err: unknown): string {
  const code = extractSafeCode(err);
  if (code !== null) {
    return KNOWN_MESSAGES[code] ?? `Authentication failed. Code: ${code}`;
  }

  const byName = safeMessageFromErrorName(err);
  if (byName !== null) {
    return byName;
  }

  return GENERIC;
}
