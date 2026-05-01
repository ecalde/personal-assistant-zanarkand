# Architecture

## Overview
This project is a Next.js App Router application using:
- Next.js (frontend + API routes)
- Tailwind CSS (styling)
- Sanity CMS (content)
- Vercel (deployment)

## Folder Structure

/app
- pages and routes

/components
- reusable UI components

/lib
- utilities, helpers, CMS queries

/styles
- global styles

## Data Flow

User → UI (components) → API route → external service / CMS → response → UI

## Patterns

### Components
- Reusable and small
- No business logic inside UI components

### API Routes
- Handle validation
- Call external services
- Return structured responses

### CMS (Sanity)
- All content fetched via lib/sanity queries
- No direct CMS logic inside components

## Environment Variables

Used for:
- Sanity config
- API tokens

Never exposed in client unless prefixed with NEXT_PUBLIC_

## Deployment

- Hosted on Vercel
- Auto-deploy on Git push
