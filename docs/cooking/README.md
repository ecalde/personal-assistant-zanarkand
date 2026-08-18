# Cooking System — Planning Index

This folder contains the complete planning artifacts for introducing **Cooking** as a first-class life domain in Personal Assistant, alongside Skills, Fitness, Career, Events, and People.

> Status: **Planning approved. Implementation NOT started.** These documents are the source of truth. Future Cursor sessions should execute the roadmap phase-by-phase without deviating from the vision captured here.

## How to use this folder

1. Read [`00-vision.md`](00-vision.md) to understand the product intent and the non-negotiable rules (e.g. "adding recipes grants 0 XP; cooking grants XP").
2. Read [`01-architecture.md`](01-architecture.md) for the end-to-end system design and how Cooking maps onto the existing app.
3. Execute [`02-roadmap.md`](02-roadmap.md) one phase at a time. Each phase is independently shippable and has acceptance criteria + tests.
4. When implementing a phase, consult the relevant deep-dive document(s) below.

## Document set

| Doc | Purpose |
| --- | --- |
| [`00-vision.md`](00-vision.md) | Cooking Vision Document — product philosophy, scope, principles |
| [`01-architecture.md`](01-architecture.md) | Cooking Architecture Document — system design, data stores, infra |
| [`02-roadmap.md`](02-roadmap.md) | Phased roadmap — 12 phases, milestones, acceptance criteria, dependencies |
| [`03-progression-design.md`](03-progression-design.md) | XP axis decision, recipe mastery, XP curves |
| [`04-supabase-schema.md`](04-supabase-schema.md) | Supabase table + RLS proposal |
| [`05-sanity-schema.md`](05-sanity-schema.md) | Sanity media-asset model + integration |
| [`06-calendar-integration.md`](06-calendar-integration.md) | Calendar category, planned vs historical cooks |
| [`07-nutrition-architecture.md`](07-nutrition-architecture.md) | USDA/OFF, conversions, retention, confidence |
| [`08-ocr-import-architecture.md`](08-ocr-import-architecture.md) | Assisted import (OCR + vision LLM extraction) |
| [`09-guided-cooking-architecture.md`](09-guided-cooking-architecture.md) | Guided mode, step workflow, timer persistence |
| [`10-data-models.md`](10-data-models.md) | TypeScript domain types + `AppPayload` extensions |
| [`11-integration-points.md`](11-integration-points.md) | Exact files/functions to touch per existing system |
| [`12-risks-dependencies.md`](12-risks-dependencies.md) | Risks, dependencies, recommended order |
| [`13-future-ai.md`](13-future-ai.md) | AI opportunities mapped to phases |

## Locked decisions (quick reference)

These were decided during planning and should not be re-litigated without a new decision record:

- **Progression axis**: Cooking does NOT add a 6th RPG axis. It routes XP primarily to the existing unused `creative` axis, with a smaller secondary grant to `body`. See [`03-progression-design.md`](03-progression-design.md).
- **Recipe mastery**: count-based tier system + a dedicated `recipe:{id}` XP track. Adding a recipe grants 0 XP; only completed cooking sessions grant XP.
- **Sanity = images only**: Sanity is the media/asset CDN for recipe images (curated and user). All recipe text/ingredients/steps/logs/nutrition live in Supabase.
- **Curated catalog content lives in Supabase** (`recipe_catalog`, global read), referencing Sanity image assets. Users clone catalog recipes into their private library.
- **New backend infra**: OCR/vision extraction, USDA fetching, and Sanity asset uploads run through Supabase Edge Functions (the only place secrets live). Isolated to Phases 8-10.
- **Calendar**: Cooking is a new top-level `CalendarCategoryKey`, not a new `EventType`.
- **Notifications**: in-app Daily Focus + toasts first; real Web Push / service worker is a later phase.
