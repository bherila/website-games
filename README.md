# BWH Games

A small collection of browser games (2048, Block Blaster, Chick's Challenge, Hover,
Marble Sort, Math Horde, Parking Pickup, Tower Throwback) served from
`games.bherila.net`. Laravel 13 + Vite + React 19, with a server-side API for
authenticated cloud-saves.

## What's here

- `resources/js/games/**` — one Vite entrypoint per game, plus shared `_shared/` and
  `pwa/` code.
- `resources/views/games/**` + `resources/views/layouts/game.blade.php` — the Blade
  shells that mount each game's React entrypoint.
- `app/Services/Games`, `app/Models/{UserGameData,TowerSaveSlot}.php`,
  `app/Http/Controllers/Api/{GameDataController,TowerSaveController}.php` — the
  authenticated save API (`/api/games/...`).
- A handful of generic shared components (`@/lib/utils`, `@/fetchWrapper`,
  `@/components/{MainTitle,container}`, and six `@/components/ui/*` primitives).

## Route prefix

Routes are root-mounted — `/`, `/2048`, `/block-blaster`, `/chicks-challenge`,
`/hover`, `/marble-sort`, `/marble-works`, `/math-horde`, `/parking-pickup`,
`/tower-throwback` — with
no `/games` prefix. Route *names* use the `games.` prefix (`games.index`,
`games.2048`, ...), while the service worker and user-facing routes are rooted at `/`.
The API remains under `/api/games/...` as a namespaced API path.

## Auth

This app has its own `users` table and signs in through the identity provider over an
authorization-code flow with PKCE, configured by the `OAUTH_*` keys in `.env`.

Accounts bind to the provider's immutable `sub` claim, stored as
`users.oauth_provider` + `users.oauth_subject` — **never** to the email address. An
address is user-mutable and can be reassigned, so matching on one would orphan an
account when its owner changes theirs, and hand over the previous owner's saved games
when an address is reused. The provider does not assert `email_verified`, so there is
nothing that raises a matching address above an unverified claim.

### Linking an existing account

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

### Application administrators

`users.is_admin` marks an application administrator. Sign-in never sets it: every account,
including the very first one, starts as an ordinary player. It gates only operator surfaces
(the `administer` gate): queueing paid Mandarin audio generation (everyone else gets cache
hits only) and the Mandarin audio QA page, in every environment. Everything
else an operator does here is an artisan command on the server.

```bash
php artisan users:admin grant  <local-users-id>
php artisan users:admin revoke <local-users-id>
php artisan users:admin list
```

The account is named by its exact numeric id, never by address. Grant and revoke are
idempotent, are written to the application log by row id, and refuse an unknown id. Grant
refuses an account with no provider subject bound (link it first with `oauth:bind-subject`).

**Locally**, the same gate applies, so make your own development account an administrator:
sign in once through the identity provider (which creates the row and binds its subject),
then run `php artisan users:admin grant <your-local-users-id>` against your local database.
Make sure `.env` points at a local database first. For the browser end-to-end suite, grant
the flag to the account named by `E2E_USER_ID`. Feature tests use
`User::factory()->administrator()`.

**Last-administrator rule:** revoking is refused when it would leave no administrator who can
still sign in (one bound to a subject under the configured provider). Holders of the flag who
cannot sign in do not count, and revoking them is always allowed. The rule lives in
`App\Services\Admin\ApplicationAdministrators`; change the flag only through it
(`canRevoke()` to ask, `grant()`/`revoke()` to act).

### Delegated access (managing accounts from the identity provider)

The identity provider's user-management page can list accounts here, create one for a
subject before its first sign-in, and grant or revoke the administrator flag, through
`POST /application-access` (the auth package's delegated access contract, version 2). This app
is account-only: there are no workspaces. `App\Services\Admin\DelegatedApplicationAccess`
decides every request:

- Only an administrator who can sign in (bound under `OAUTH_PROVIDER`) may do anything, reads
  included. Nobody may change their own flag, and the last-administrator rule above still holds.
- A created account is bound to the exact subject with placeholder contact details, and first
  sign-in fills them in. An already-bound subject is refused, and no existing row is adopted.
- Each change is logged at info level with the request's `jti` and row ids.

It is off by default. To enable it:

1. Apply migrations (the deploy does), which creates the `bherila_auth_delegated_nonces` table.
2. Set, in the server environment:

   | Variable | Value |
   |---|---|
   | `GAMES_DELEGATED_ACCESS_ENABLED` | `true`; the route answers 404 otherwise |
   | `GAMES_DELEGATED_ACCESS_ISSUER` | the provider's issuer; must equal `OAUTH_PROVIDER_URL` |
   | `GAMES_DELEGATED_ACCESS_ENDPOINT` | this endpoint's exact HTTPS URL, as the provider calls it |
   | `GAMES_DELEGATED_ACCESS_APPLICATION` | this app's key in the provider's registry |
   | `GAMES_DELEGATED_ACCESS_PUBLIC_KEYS` | `key-id\|/absolute/path/to/public.pem`, comma-separated |
   | `OAUTH_PROVIDER` | already set for sign-in; must be set explicitly |

3. Start read-only. Updates (provisioning and the flag) are refused with 403 until
   `GAMES_DELEGATED_ACCESS_WRITES_ENABLED=true`. Unset it again to stop accepting changes without
   touching the provider.

Use one integration key for this application alone, never one shared with another
application. To rotate, list both keys, switch the provider to the new key id, then remove the
old one. A misconfigured key, issuer or provider refuses every request rather than falling back.
Optionally schedule `php artisan bherila-auth:prune-delegated-nonces` to delete expired nonces.

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

CI targets GitHub-hosted `ubuntu-24.04-arm` runners. Production is deployed to a
dedicated application directory and database, with credentials kept in the server
environment.

The deploy job uses a dedicated SSH key and pinned host keys from repository secrets.
It deploys only the games application and never includes the server environment file.

## Privacy

Keep credentials, account numbers, and other identifying information out of the
repository, commit messages, and CI configuration.
