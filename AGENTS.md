# AGENTS.md

Instructions for AI coding agents working in **bherila/website-games**. This file is the
source of truth and is harness-agnostic — do not add a `CLAUDE.md`; point other tools here.

## What this repo is

A small collection of browser games (2048, Block Blaster, Chick's Challenge, Hover,
Marble Sort, Math Horde, Parking Pickup, Tower Throwback) served from `games.bherila.net`.
Laravel 13 (PHP 8.5) + Vite + React 19 / TypeScript, with an authenticated cloud-save API.

- `resources/js/games/**` — one Vite entrypoint per game, plus shared `_shared/` and `pwa/`.
- `resources/views/games/**` + `resources/views/layouts/game.blade.php` — Blade shells that
  mount each game's React entrypoint.
- `app/Services/Games`, `app/Models/{UserGameData,TowerSaveSlot}.php`,
  `app/Http/Controllers/Api/{GameDataController,TowerSaveController}.php` — the save API.
- `docs/games/*.md` — per-game design/implementation notes; read the relevant one first.
- Routes are root-mounted (`/`, `/2048`, `/tower-throwback`, …); route *names* use the
  `games.` prefix. The API lives under `/api/games/...`.
- Auth is authorization-code + PKCE against an external identity provider. Accounts bind to
  the immutable `sub` claim (`users.oauth_provider` + `users.oauth_subject`), **never** to the
  email address. See README for `php artisan oauth:bind-subject`.

## Setup / run

```bash
composer install && pnpm install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite   # local DB is sqlite; run migrations only when asked
composer run dev                 # serve + queue + pail + vite concurrently
```

## Validation (all must pass before committing)

```bash
pnpm run type-check
pnpm run lint
pnpm run test                 # Jest
pnpm run scan-sensitive       # blocks credentials/PII from landing in the repo

pnpm run build                # REQUIRED before PHPUnit — see note
./vendor/bin/pint --test
vendor/bin/phpstan analyse --no-progress --memory-limit=1G
php -d memory_limit=1G artisan test --compact
```

Non-obvious, verified:

- **`pnpm run build` before PHPUnit is required here.** Several page tests render a real
  Blade view *without* `->withoutVite()`, so they need an actual `public/build/manifest.json`.
  CI encodes this: `backend-tests` `needs: frontend-build` and downloads its artifact.
  (This is the opposite of the sibling `bwh-php` repo — do not copy that rule over.)
- Always run PHP CLI with `-d memory_limit=1G`; the 128 MB default OOMs on PHPStan.
- `Run Tests` is the aggregate gate in `.github/workflows/ci.yml`; it re-checks every job's
  result explicitly. A new CI job must be added to its `needs` *and* get a `check` line, or it
  can fail invisibly.
- E2E (Playwright) specs are in `tests/e2e/` with `pnpm run test:e2e:*` scripts. They are not
  part of the PR gate — trigger the per-game Playwright workflows manually when touching those
  surfaces.
- CI runs on GitHub-hosted `ubuntu-24.04-arm`.

## Privacy

Keep credentials, account numbers, and identifying information out of the repository, commit
messages, PR/issue text, and CI configuration.

## Codex PR review

GOAL: never mistake a Codex **security-review** quota message for a failed or unavailable
**code** review.

1. A bot comment reading "You have reached your Codex usage limits for security reviews.
   Please try again later." is scoped to **security reviews only**. It says nothing about
   code-review availability. Disregard it when judging whether a code review ran, and never
   report "no review / out of quota" on the strength of that comment.

2. Checking for a review means checking **all three** endpoints, because findings usually land
   as review comments rather than issue comments:

   ```bash
   gh api repos/<owner>/<repo>/issues/<n>/comments   # issue-level comments
   gh api repos/<owner>/<repo>/pulls/<n>/reviews     # review submissions
   gh api repos/<owner>/<repo>/pulls/<n>/comments    # INLINE review comments — where findings appear
   ```

   A 👀 reaction means a review is in progress. Absence of issue comments proves nothing.
