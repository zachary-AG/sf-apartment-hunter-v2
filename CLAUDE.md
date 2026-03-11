# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build (also acts as type-check)
npm run lint     # ESLint
```

There are no tests. Use `npm run build` to catch TypeScript errors before considering a change done.

## Architecture

**Stack:** Next.js 16.1.6 (App Router) / React 19 / Tailwind CSS v4 / TypeScript

### Auth
Clerk handles auth via `proxy.ts` — this is the middleware file (Next.js 16 renamed `middleware.ts` to `proxy.ts` in this project to avoid a conflict). All routes except `/sign-in`, `/sign-up`, and `/api/gmail/callback` are protected. API routes call `await auth()` from `@clerk/nextjs/server` and check `userId`.

### Database
Supabase with two clients:
- `lib/supabase.ts` — server-only, uses `SUPABASE_SERVICE_ROLE_KEY`, bypasses RLS
- `lib/supabase-client.ts` — browser, uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`

All server components and API routes use the service role client. RLS is enabled on all tables but policies allow all operations (Clerk JWTs are not Supabase JWTs, so RLS is enforced by checking `user_id` in application code, not at the DB level).

Schema is in `supabase/migrations/001_initial_schema.sql`. Additional migrations are numbered sequentially (e.g. `002_add_price_max.sql`) and must be run manually in the Supabase SQL editor — there is no migration runner.

### Page / Component Split
Server components fetch from Supabase directly and pass data to `'use client'` components:
- `app/dashboard/page.tsx` (server) → `DashboardClient.tsx` (client)
- `app/dashboard/[id]/page.tsx` (server) → `ListingDetailClient.tsx` (client)
- `app/settings/page.tsx` (server) → `SettingsClient.tsx` (client)

Next.js 16 dynamic route params are Promises — always `await params` before accessing.

### Listing Ingest Pipeline (`app/api/ingest/route.ts`)
The core flow for adding a listing from a URL:
1. Fetch HTML — direct fetch first, then Bright Data (`BRIGHT_DATA_API_KEY`) as fallback
2. Detect source (craigslist / zillow / apartments)
3. Parse with Cheerio-based parser (`scrapers/parsers/`)
4. **Zillow special case:** Zillow is JS-rendered so Cheerio can't find address or price. Instead: call `extractZillowData()` (Claude Haiku) to extract `building_name`, `address`, `description`, and a `units[]` array. Cheerio still runs for images.
   - If `units.length > 1`: return `{ units, buildingData, url, source }` to the frontend without saving — the `UnitSelectorModal` lets the user pick which units to save, then POSTs to `/api/ingest/save-units`
   - If `units.length <= 1`: save directly
5. Non-Zillow: fall back to `extractListingWithClaude()` (Claude Haiku) if address is missing
6. Geocode address via Google Maps Geocoding API (`lib/geocode.ts`) — uses server-side `GOOGLE_MAPS_API_KEY`
7. Insert into `listings` table

### Claude Usage (`lib/claude.ts`)
All Claude calls use `claude-haiku-4-5-20251001`. Three functions:
- `extractListingWithClaude(html)` — general fallback, strips HTML, extracts full listing fields
- `extractZillowData(html)` — Zillow-specific, extracts `building_name`, `address`, `description`, `units[]`
- `draftInquiryEmail(listing)` — generates email subject + body for listings without a price

### Crime Heatmap (`components/Map.tsx`, `lib/sfcrime.ts`, `app/api/crime/route.ts`)
- Fetches last 12 months from SF OpenData API (`wg3w-h783` dataset), limit 10,000 points
- Rendered as a Google Maps `HeatmapLayer` (requires `visualization` library)
- `dissipating: true` with zoom-dependent radius via a `zoom_changed` listener — `heatmapRadiusForZoom()` maps zoom levels to pixel radii (zoom 11→15px, 12→20, 13→30, 14→45, 15+→60)
- Gradient: transparent → green → yellow-green → yellow → orange → red

### Gmail Integration (`lib/gmail.ts`, `app/api/gmail/`, `app/api/email/`)
OAuth flow: `/api/gmail/connect` → Google OAuth → `/api/gmail/callback` stores refresh token in `user_tokens` table. `/api/email/send` sends inquiry emails and records the Gmail message ID. `/api/email/poll` checks Gmail threads for replies and uses Claude Haiku to extract prices from email text.

### Tailwind v4
No `tailwind.config.js`. Uses `@import "tailwindcss"` and `@theme inline {}` in `app/globals.css`. All theme customization goes in that `@theme` block.

### Map Component
`components/Map.tsx` must stay `'use client'` — `@react-google-maps/api` components cannot be used in server components. The `LIBRARIES` constant is defined at module scope (not inline) to prevent re-renders from recreating the array reference.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
ANTHROPIC_API_KEY
GOOGLE_MAPS_API_KEY              # server-side geocoding
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY  # client-side map rendering
GOOGLE_CLIENT_ID                 # Gmail OAuth
GOOGLE_CLIENT_SECRET
WALKSCORE_API_KEY
BRIGHT_DATA_API_KEY              # optional, proxy for JS-rendered pages
```
