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

Routes are root-mounted — `/`, `/2048`, `/block-blaster`, `/chicks-challenge`,
`/hover`, `/marble-sort`, `/math-horde`, `/parking-pickup`, `/tower-throwback` — with
no `/games` prefix. #1803 originally kept `/games/*` (an explicitly open decision) to
preserve existing URLs and the installed PWA's service-worker scope, but no PWA
installs existed yet, so a follow-up dropped the prefix while it was still free to
change. Route *names* still use the `games.` prefix (`games.index`, `games.2048`,
...) — that's an internal identifier, not a URL, so keeping it avoided pure churn.
The service worker's scope is now `/` (was `/games`); the API is unaffected — it was
always under `/api/games/...` and stays there, since it's a namespaced API path, not
a user-facing route.

## Auth

This app must **not** share the finance app's session cookie or database (see #1803).
It has its own `users` table and signs in through the identity provider over an
authorization-code flow with PKCE, configured by the `OAUTH_*` keys in `.env`.

Accounts bind to the provider's immutable `sub` claim, stored as
`users.oauth_provider` + `users.oauth_subject` — **never** to the email address. An
address is user-mutable and can be reassigned, so matching on one would orphan an
account when its owner changes theirs, and hand over the previous owner's saved games
when an address is reused. The provider does not assert `email_verified`, so there is
nothing that raises a matching address above an unverified claim.

### Linking an account copied from the provider's database

Rows copied across before OAuth existed carry an address but no subject, so no sign-in
can reach them: the first login tries to create a second account, collides with the
unique index on the address, and is refused with a 409 (with a redacted explanation in
the log). Sign-in deliberately will not resolve this itself. Confirm out of band that
the local row and the provider account are the same person, then link it once:

```bash
php artisan oauth:bind-subject <local-users-id> <provider-sub>
```

The command refuses to re-point an account that is already linked, and refuses to give
one subject to a second account. It is safe to re-run.

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

`.github/workflows/ci.yml`'s `deploy` job authenticates with a dedicated SSH key (not
a password) and expects four repo secrets: `SSH_PRIVATE_KEY` (the deploy key's full
PEM, header/footer included), `SSH_HOST`, `SSH_USERNAME`, and `SSH_KNOWN_HOSTS`
(`ssh-keyscan -H` output for the host, so the deploy pins the host key instead of
disabling verification). It deploys **only** to `~/games-laravel/` on the server —
never to the finance app's directory.

## Privacy

This repo is public (or intended to be). Do not commit real names, account numbers,
or other identifying information in code, commit messages, or CI config — same rule
as the source repo, see #1803.
