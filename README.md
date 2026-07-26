# BWH Games

A small collection of browser games (2048, Block Blaster, Chick's Challenge, Hover,
Marble Sort, Math Horde, Parking Pickup, Tower Throwback) served from
`games.bherila.net`. Laravel 13 + Vite + React 19, with a server-side API for
authenticated cloud-saves.

This repo was **extracted from a private monorepo** (`bherila/2025-website`) as a
single fresh commit — see [bherila/2025-website#1803](https://github.com/bherila/2025-website/issues/1803)
for the rationale (privacy boundary, CI cost, and TypeScript program isolation) and
the decisions that shaped the split. History was intentionally not carried over: the
source repo is private and its history references tax/financial data unrelated to
these games, so starting clean avoids ever leaking any of that.

## What's here

- `resources/js/games/**` — one Vite entrypoint per game, plus shared `_shared/` and
  `pwa/` code.
- `resources/views/games/**` + `resources/views/layouts/game.blade.php` — the Blade
  shells that mount each game's React entrypoint.
- `app/Services/Games`, `app/Models/{UserGameData,TowerSaveSlot}.php`,
  `app/Http/Controllers/Api/{GameDataController,TowerSaveController}.php` — the
  authenticated save API (`/api/games/...`).
- A handful of generic shared components (`@/lib/utils`, `@/fetchWrapper`,
  `@/components/{MainTitle,container}`, six `@/components/ui/*` primitives) copied in
  from the source repo. These are expected to drift from their monorepo originals over
  time — that's an accepted tradeoff of the split, not a bug.

## Route prefix

Routes keep the `/games/*` prefix (e.g. `/games/block-blaster`) rather than dropping
to bare paths, so existing links and the installed PWA (whose service-worker scope is
`/games`) keep working unchanged. This was an explicitly open decision in #1803;
revisit if wanted.

## Auth — TODO

This app must **not** share the finance app's session cookie or database (see #1803).
It needs its own OAuth-backed identity and `users` table. That boundary is scaffolded
(`routes/api.php` gates the save API behind `web`+`auth`; `app/Models/User.php` is a
stock Laravel user model), but **no OAuth provider is wired up yet** — this was
deliberately left undone rather than guessed at. Before deploying for real use:

1. Choose and configure an OAuth provider (e.g. Laravel Socialite).
2. Fill in the `OAUTH_*` placeholders in `.env.example` / `.env`.
3. Wire provider callbacks in `routes/`.

## Running locally

```bash
composer install
pnpm install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite   # default local DB is sqlite
php artisan migrate

composer run dev   # runs php artisan serve + queue + pail + vite concurrently
```

## Testing

```bash
pnpm run type-check
pnpm run lint
pnpm run test                          # Jest (jsdom + node projects)

pnpm run build                         # required before PHPUnit (Vite manifest)
./vendor/bin/pint --test
php -d memory_limit=1G artisan test
```

E2E (Playwright) specs live under `tests/e2e/`; see `package.json`'s `test:e2e:*`
scripts. They are not part of the default PR gate — run them manually via the
`Tower Throwback Playwright` / `Parking Pickup Playwright` / `BWH Games PWA Playwright`
GitHub Actions workflows.

## Deployment

CI targets GitHub-hosted `ubuntu-24.04-arm` runners exclusively (this repo has no
access to the source repo's self-hosted pool — free hosted ARM runners for a public
repo was one of the three reasons for the split).

Production lives in the same cPanel account as the source repo, in its own directory,
subdomain, and database:

- Laravel root: `~/games-laravel`, webroot `~/games.bherila.net` (symlinked to
  `games-laravel/public`)
- Database: `bherila_games`, a separate MySQL database and user — never shared with
  the finance app's database (see #1803 for why).

`.github/workflows/ci.yml`'s `deploy` job expects three repo secrets that must be
added before the first deploy can succeed: `SSH_USERNAME`, `SSH_PASSWORD`,
`SSH_HOST`. It deploys **only** to `~/games-laravel/` on the server — never to the
finance app's directory.

## Privacy

This repo is public (or intended to be). Do not commit real names, account numbers,
or other identifying information in code, commit messages, or CI config — same rule
as the source repo, see #1803.
