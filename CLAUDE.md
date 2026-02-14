# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TTV Champions is a gamified web platform for table tennis clubs. Players earn points, track matches, and compete on leaderboards with an Elo-based ranking system.

**Stack**: Vanilla JS (ES modules) + Vite (dev only) + TailwindCSS 4 | Supabase (primary) + Firebase (legacy) | Capacitor for mobile
**Domain**: sc-champions.de

## Commands

```bash
# Development
npm run dev                    # Vite dev server at localhost:5173
npm run build                  # Tailwind CSS + esbuild vendor bundles
npm test                       # Run Vitest tests
npm test -- --watch            # Watch mode

# Formatting
npm run format                 # Apply Prettier
npm run format:check           # Check formatting

# Backend (run from functions/ directory)
cd functions && npm test       # Jest tests for Cloud Functions
npm run serve                  # Firebase emulator
npm run deploy                 # Deploy Cloud Functions

# Mobile
npm run cap:sync               # Sync with native projects
npm run android                # Open Android Studio
npm run ios                    # Open Xcode
```

## Architecture

### Static HTML + Minimal Build
The app serves static HTML from `public/`. `npm run build` only generates Tailwind CSS and bundles vendor libs (Supabase, i18next) via esbuild. No framework compilation or code splitting.

### Page Module Pattern
Each HTML page loads a corresponding JS module directly via `<script type="module">`:
```
dashboard.html  →  js/dashboard-supabase.js
coach.html      →  js/coach-supabase.js
admin.html      →  js/admin-supabase.js
```

Modules export `init*()` functions called by the page. Some modules also export `cleanup()` for SPA teardown, but this is not universal.

### SPA Enhancement
Link clicks are intercepted to load pages via fetch without full reloads. Falls back to normal page loads on error. All HTML pages remain directly accessible.

### Database Migration (Firebase → Supabase)
- Supabase is the primary database (PostgreSQL with RLS)
- Firebase/Firestore code still exists but is being phased out
- Page modules with `-supabase` suffix use the new backend

### Elo Rating System
- Starting rating: 800, K-factor: 32
- Elo Gates at [800, 850, 900, 1000, 1100, 1300, 1600] prevent rating collapse
- Season Points = Elo gain × 0.2
- H2H handicap: uses higher of head-to-head or Elo-based handicap

### Tournament System
Round Robin and Double Elimination formats. SVG bracket tree visualization, carousel slider for rounds, PDF export. Max 16 participants. Tournament matches integrate with the normal match reporting flow.

### Real-time Chat
Supabase Realtime-powered messaging between club members. Push notifications via OneSignal. RLS policies control access.

### Guardian Dashboard
Parent-facing pages for viewing children's activities, events, and stats.

### Mobile (Capacitor)
- All CDN dependencies replaced with local bundles (required for Android WebView)
- OneSignal for push notifications (replaced Firebase FCM)
- AAB (App Bundle) builds for Play Store
- Safe area handling for status bar offset across all pages
- Native storage adapter for Supabase auth persistence


## Testing

**Frontend**: Vitest with happy-dom (`public/js/__tests__/`)
**Backend**: Jest (`functions/__tests__/`)

## Roles

- `user` - regular player
- `coach` - training sessions, team stats, tournament management
- `admin` - system administration
- `guardian` - parent view of children's activities
- `labeler` - ML training data labeling (label.html)

## Code Style

Prettier config: 4-space indentation, semicolons, single quotes, 100-char line limit, trailing commas (ES5)

## Environment

Production detection via hostname (not localhost/127.0.0.1). Console logs suppressed in production via `utils/logger.js`.

## External Services

- **Supabase**: Primary DB, auth, storage, edge functions, Realtime (chat)
- **Firebase**: Legacy Firestore, Cloud Functions, hosting
- **Cloudflare R2**: Media storage (migrated from Supabase storage for egress costs)
- **OneSignal**: Push notifications (replaced Firebase FCM)
- **Resend**: Email notifications
- **Google Analytics**: gtag on all pages
- **i18next**: Translations (de, en, zh) in `public/locales/`

## Important Gotchas

- **No Vue despite package.json**: Vue 3, vue-router, pinia are listed as dependencies but never used. The app is vanilla JS with ES modules.
- **No CDN dependencies on mobile**: Android WebView can't reliably load CDNs. All JS libs must be bundled locally in `public/`.
- **Tailwind v4 syntax**: Use `bg-black/50` not `bg-black bg-opacity-50` (v3 syntax breaks).
- **Supabase public keys are intentional**: `anonKey` is protected by RLS policies, not a secret.
