# Void AI

An AI-powered browser sidebar chat assistant. Chat with an AI directly in a sleek dark space-themed interface — supports file attachments, markdown rendering, suggestion chips, and a Document Picture-in-Picture floating mode.

## Run & Operate

- `artifacts/void-extension: web` workflow — runs the React frontend (port 20696)
- `API Server` workflow — runs the Express API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/void-extension)
- API: Express 5 (artifacts/api-server)
- AI: OpenAI via Replit AI Integrations (gpt-5-mini) — no API key required
- Validation: Zod, Drizzle-Zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/void-extension/src/App.tsx` — main React UI (chat, file upload, PiP mode)
- `artifacts/void-extension/src/index.css` — space-themed dark design system
- `artifacts/api-server/src/routes/chat.ts` — AI chat endpoint (OpenAI integration)
- `artifacts/api-server/src/routes/health.ts` — health check
- `artifacts/void-extension/public/chrome-ext/` — Chrome extension files (manifest, background, content script)
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- The frontend uses `window.location.origin` as the API base, so it works both standalone and as an iframe inside a Chrome extension sidepanel
- Chat history is stored in-memory on the server (no DB needed for MVP)
- File uploads are base64-encoded and sent directly in the chat request body (up to 5 files, 20MB limit)
- Document Picture-in-Picture (Chrome 116+) lets Void float above all tabs

## Product

- AI chat sidebar with deep-space aesthetic (purple/black, starfield background)
- Suggestion chips for quick prompts (code help, analysis, writing)
- File attachment support — images shown as thumbnails, other files as text
- Markdown rendering in AI replies (code blocks, bold, inline code)
- Settings panel to configure API URL
- Chrome extension files for sidePanel integration (manifest v3)

## User preferences

_Populate as you build._

## Gotchas

- The frontend workflow uses PORT=20696 (the artifact's assigned port), mapped externally to port 3000
- API server runs on port 8080, served at `/api` prefix through the Replit proxy
- AI model: gpt-5-mini (use `max_completion_tokens`, not `max_tokens`)
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec changes
