# SECURITY_RULES.md

## Secret handling
- Secrets must never be committed to source control.
- Secrets must never appear in examples, tests, screenshots, comments, or docs.
- Use secret managers or deployment platform secret stores.
- `.env.example` may contain variable names only, never values.
- If a secret is leaked, rotate it immediately and remove it from history if needed.

## Environment boundaries
- Client code may only access explicitly public variables.
- Server-only keys must remain on the server.
- Never proxy secrets through client-visible endpoints.

## Input validation
- All request bodies, params, headers, cookies, uploaded files, and third-party payloads are untrusted.
- Use schema validation at system boundaries.
- Apply size, format, type, and allowlist constraints.
- Reject malformed input early.

## Output safety
- Encode/sanitize according to output context.
- Never render untrusted HTML without deliberate sanitization.
- Avoid string-built SQL, shell commands, and HTML.

## Auth and sessions
- Use trusted framework auth/session controls.
- Require authorization on all sensitive routes.
- Use secure cookies, HTTPS, and appropriate expiration policies.
- Do not expose session identifiers in URLs or logs.

## Data minimization and logging
- Store the minimum data needed.
- Avoid logging PII, tokens, secrets, raw auth payloads, or session IDs.
- Use structured logs with safe redaction.

## Dependency safety
- Prefer established packages with clear maintenance.
- Keep lockfiles committed.
- Enable Dependabot/security alerts.
- Review new dependencies before adding them.

## CI/CD and release safety
- Run lint, tests, typecheck, and security checks in CI.
- Protect main branches.
- Require code review for sensitive changes.
- Do not deploy with known critical vulnerabilities unless explicitly risk-accepted.

## Incident rules
- If a credential is exposed, treat it as compromised.
- Rotate, revoke, audit, and document remediation.
