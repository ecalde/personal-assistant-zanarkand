# PROJECT_RULES.md

## Core principles
- Prioritize security, maintainability, performance, accessibility, and consistency.
- Prefer small, reviewable changes over broad rewrites.
- Follow existing repository patterns before introducing new abstractions.
- Reuse shared utilities/components before creating duplicates.

## Security non-negotiables
- Never hardcode secrets, tokens, passwords, API keys, private keys, or certificates.
- Never expose server-only environment variables to client code.
- Treat all external input as untrusted and validate it server-side.
- Sanitize or encode untrusted output appropriately for its context.
- Use framework-provided auth/session/security features when available.
- Enforce authorization on every sensitive request.
- Use least privilege for services, APIs, database users, and infrastructure.
- Do not log secrets, tokens, session identifiers, or sensitive personal data.
- Do not weaken security controls for convenience without explicit approval.

## Code quality
- Write clear, readable, strongly typed code where supported.
- Prefer explicit logic over clever shortcuts.
- Keep functions focused and modules cohesive.
- Do not swallow errors.
- Keep comments focused on intent and tradeoffs, not obvious behavior.
- Remove dead code and avoid speculative abstractions.

## Performance
- Avoid unnecessary dependencies and heavy client-side code.
- Minimize repeated work, redundant queries, and unnecessary network calls.
- Use pagination, limits, and selective field loading for scalable data access.
- Optimize bundle size, images, fonts, and third-party scripts.
- Prefer measured improvements over assumed optimizations.

## Testing
- Add or update tests for behavior changes and bug fixes.
- Prefer fast deterministic unit tests, then integration tests, with only a small number of end-to-end tests.
- Validate changed code with formatting, linting, type checking, tests, and build commands as appropriate.

## Accessibility and UX
- Prefer semantic HTML and accessible components.
- Ensure keyboard usability and visible focus states.
- Use labels and accessible names for interactive elements.
- Keep layouts, spacing, and interaction patterns consistent across the project.

## Workflow
- Inspect nearby code and existing patterns before editing.
- Keep changes scoped to the task.
- Do not modify unrelated files.
- Update docs when setup, architecture, or behavior changes.
- Preserve backward compatibility unless the task explicitly allows breaking changes.

## Dependency and release discipline
- Add new dependencies only when justified.
- Prefer mature, maintained libraries.
- Keep lockfiles committed.
- Enable secret scanning, push protection, dependency alerts, and automated dependency updates.
