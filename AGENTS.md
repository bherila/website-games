# AGENTS.md

Instructions for AI coding agents working in **bherila/website-games**. This file is the
source of truth and is harness-agnostic — do not add a `CLAUDE.md`; point other tools here.

## What this repo is

A small collection of browser games (2048, Block Blaster, Chick's Challenge, Hover,
Marble Sort, Marble Works, Math Horde, Parking Pickup, Plate Escape, Tower Throwback) served from
`games.bherila.net`.
Laravel 13 (PHP 8.5) + Vite + React 19 / TypeScript, with an authenticated cloud-save API.

- `resources/js/games/**` — one Vite entrypoint per game, plus shared `_shared/` and `pwa/`.
- `resources/views/games/**` + `resources/views/layouts/game.blade.php` — Blade shells that
  mount each game's React entrypoint.
- `app/Services/Games`, `app/Models/{UserGameData,TowerSaveSlot}.php`,
  `app/Http/Controllers/Api/{GameDataController,TowerSaveController}.php` — the save API.
- `docs/games/*.md` — per-game design/implementation notes; read the relevant one first.
- Routes are root-mounted (`/`, `/2048`, `/tower-throwback`, …); route *names* use the
  `games.` prefix. The API lives under `/api/games/...`.
- Auth is authorization-code + PKCE against an external identity provider, plus optional
  "Continue with Google" (`GoogleLoginController`, `App\Services\Account\GoogleAccounts`). The
  identity provider binds to its immutable `sub` (`users.oauth_provider` + `users.oauth_subject`);
  Google binds to its `sub` in `user_identities`. A Google sign-in links to an existing account
  **only** when Google verifies the address and this app has confirmed the same address
  (`email_verified_at`, set only by the account page). Never match on an unconfirmed email.
  Administering also requires the session to have signed in through the identity provider
  (`SignInMethod`, `identity-provider-session` middleware). See README "Google sign-in".
- `/account` (`App\Http\Controllers\Account\AccountController` over `App\Services\Account\AccountEmail`)
  confirms or changes the account email by emailed link; a confirmed address is no longer replaced
  at sign-in. Mail goes through Brevo (`MAIL_MAILER=brevo`, `MAILER_DSN`). See README "Account email".
  It also deletes the account (`AccountDeletion`). A new table with a `user_id` column needs a
  deletion decision in `tests/Feature/Account/AccountDeletionTest.php`. `/privacy` is the public
  privacy page. Confirming an address another confirmed account holds offers a merge
  (`AccountMerge`, also `php artisan users:merge`); see README "Merging accounts".
- Application administrator is `users.is_admin` (never set by sign-in), checked through the
  `administer` gate and changed only through `App\Services\Admin\ApplicationAdministrators`,
  which owns the last-administrator rule. See README for `php artisan users:admin`.
- The identity provider manages accounts through `POST /application-access`, answered by
  `App\Services\Admin\DelegatedApplicationAccess` (account-only: no workspaces). Off by default,
  writes off separately; contract version 3, including `remove` (clears the administrator flag,
  keeps the account). Tests in `tests/Feature/DelegatedAccess/`. See README "Delegated access".
- `/admin` (`App\Http\Controllers\Admin\AdminPanelController`, React in `resources/js/admin/`) is the
  operator panel, administrators only in every environment. Its Mandarin audio dashboard API is
  under `/api/admin/mandarin/audio` (`MandarinAudioAdminController` over `AudioCatalog` and
  `AudioOperations`); tests in `tests/Feature/Admin/`.
- Administrator, account and paid-audio changes write a row to the auth package's audit table
  through `App\Services\Admin\AccessAudit`, inside the change's transaction. See README "Access audit".

## Setup / run

```bash
composer install && pnpm install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite   # local DB is sqlite; run migrations only when asked
composer run dev                 # serve + queue + pail + vite concurrently
```

**Claude Code cloud sessions:** the `SessionStart` hook in `.claude/settings.json` runs `cloud-repo-bootstrap` (installed by the cloud environment's setup script). It seeds `.env`, installs `vendor/` from this repo's prebuilt bundle (`.github/workflows/cloud-vendor.yml` uploads one per `composer.lock` to the `cloud-vendor` draft release), sets `APP_KEY`, runs pnpm, and prints a `[cloud-repo-bootstrap]` status report. Trust that report. In the cloud never run `composer install`/`update` against the network and never call `add_repo` for a dependency repository: the cloud GitHub proxy refuses GitHub archive downloads for repositories not attached to the session, and each `add_repo` is a manual permission grant. If the report says there is no bundle for this lock, push `composer.lock` (the workflow runs on it) and rerun `cloud-repo-bootstrap --force`. Keep the `cloud-vendor` release a draft: publishing it would create a tag and fire release workflows.

## Validation (focused locally, full gate in CI)

Use CI for heavy validation: full test suites, PHPStan, mutation and coverage runs. Run these
locally only when the user explicitly requests local execution. This user preference was
confirmed on 2026-10-23 and supersedes older guidance requiring heavy local runs before committing.

Keep local checks focused: small relevant tests, formatting, linting and targeted browser
verification. Push a focused candidate promptly so CI can run the expensive jobs. All required
CI checks must pass on the exact candidate commit before merging. When an advisory mutation
job can be green despite escaped mutations, inspect its actual artifacts; do not weaken checks
or deadlines to make a candidate pass.

The full validation commands below are a CI reference, not a local checklist to run by default:

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

- **A frontend build artifact before PHPUnit is required here.** Several page tests render a real
  Blade view *without* `->withoutVite()`, so they need an actual `public/build/manifest.json`.
  CI encodes this: `backend-tests` `needs: frontend-build` and downloads its artifact. Reuse
  that artifact for focused local page checks rather than rebuilding the full app unnecessarily.
  (This is the opposite of the sibling `bwh-php` repo — do not copy that rule over.)
- Always run PHP CLI with `-d memory_limit=1G`; the 128 MB default OOMs on PHPStan.
- `Run Tests` is the aggregate gate in `.github/workflows/ci.yml`; it re-checks every job's
  result explicitly. A new CI job must be added to its `needs` *and* get a `check` line, or it
  can fail invisibly.
- E2E (Playwright) specs are in `tests/e2e/` with `pnpm run test:e2e:*` scripts. CI gates on
  `browser-pwa` and `browser-gameplay` through `Run Tests`; `Browser Regression` repeats them
  weekly. The per-game Playwright workflows still support focused manual verification.
  `.github/workflows/browser-checks.yml` owns isolated browser setup. Anonymous checks use
  file sessions/cache; only PWA checks migrate and seed an isolated SQLite fixture.
  Full gameplay runs use four measured groups, each with one worker and complete project/file
  isolation. CI and weekly share the selector's group assignments and unique report names.
  Full groups use project/file grep filters; do not also apply Playwright's native `--shard`,
  which would omit tests from each group. Selector tests enforce complete, nonduplicated
  coverage of the gameplay package script's specs and projects; update both when adding coverage.
  PRs touching only one game's exact audited UI/entrypoint files, Blade shell or registered
  gameplay specs run that game in one group; multiple affected games retain all four groups.
  `scripts/select-gameplay-tests.mjs` owns that allow-list. New or unknown paths,
  engine/types/progress/levels/maps, shared code,
  dependencies, deletions and renames retain the full run. Main and weekly always run all games,
  and PWA checks always run. Selection failures fail `Run Tests`; no browser jobs are skipped.
  `Run Tests` checks the aggregate gameplay matrix result, so every shard must succeed.
- CI runs on GitHub-hosted `ubuntu-24.04-arm`.

## Privacy

Keep credentials, account numbers, and identifying information out of the repository, commit
messages, PR/issue text, and CI configuration.
