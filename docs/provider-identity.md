# Provider identity enforcement

Games signs people in through bherila ID (`id.bherila.net`) and, optionally, through Google.
With provider identity enforcement on, a session whose bherila ID identity has since been
disabled, deleted, reset or ungranted is signed out here. That holds whether the session started
through bherila ID, through Google for an account bound to bherila ID, or from the remember-me
cookie. Enforcement is off until `BHERILA_AUTH_PROVIDER_IDENTITY_ENABLED=true`. After the cutover
is recorded, it stays on whatever that setting says. The mechanism is auth-laravel's:
[provider session verification](https://github.com/bherila/auth-laravel/blob/main/docs/provider-session-verification.md)
and [cutover](https://github.com/bherila/auth-laravel/blob/main/docs/provider-identity-cutover.md).

## Credential inventory

Every way a request here acts as a person, and what enforcement does to it.

| Path | Who it represents | Treatment |
| --- | --- | --- |
| Browser session from a bherila ID sign-in (`/oauth/callback`) | A bound account | The sign-in records its login generation (`RelyingPartyLoginController`). `RequireActiveProviderSession` runs on every `web` request. It answers from a shared observation for under 5 minutes, checks freshly on every unsafe method, and signs out an ended identity. |
| Browser session from Google (`/oauth/google/callback`), account bound to bherila ID | A bound account | Before sign-in, a fresh status request (`ProviderSession::observe()`). An ended identity is refused and an unavailable provider answers 503. The current generation becomes the session's baseline, and later checks are as above. |
| Browser session from Google, Google-only account | A person bherila ID does not know | Not the provider's to end; never checked. Ending it means deleting the account here. |
| Remember-me cookie (`auth.guards.web.remember`, a year, renewed on each visit) | Whoever the session restores | Restoring adopts the baseline recorded for the cookie's token (`provider_remembered_logins`), then checks freshly. A sign-in under a newer generation replaces the token, so older cookies stop working. |
| Cloud-save API (`/api/games/...`) | The session's account | Same session (`web`, `auth`). An ended identity answers JSON 401 and an outage answers 503. |
| Admin panel and admin APIs | An administrator | Same session, plus `identity-provider-session` and the `administer` gate. |
| Account email confirmation links (`/account/email/confirm/{token}`) | The signed-in account | Behind `auth` and tied to the signed-in account, so covered by the session. |
| Delegated access (`POST /application-access`) | The provider itself, by signed assertion | Not a person's credential. Unaffected. |
| Sanctum personal access tokens | Nobody | None are issued. The table exists only because Sanctum is installed, and account deletion clears it. |
| Queued Mandarin audio jobs | The administrator who queued them, after the fact | Not re-checked. A job runs to completion even if its administrator is offboarded meanwhile. Accepted: it only generates audio assets. |
| Privacy request form | Anyone | Anonymous. Unaffected. |
| `__e2e/login` | A fixture account | 404 outside the `e2e` environment. |
| `users:admin`, `users:merge` (CLI) | The operator | Not a web credential. |

Sign-out (`logout`) is never checked, so a person can end their session during a provider
outage. A signed-out browser is sent to `/login`, which offers both sign-in methods.

## Before turning it on

- **Shared cache.** The status observation needs a store shared by every worker that supports
  locks. `CACHE_STORE=database`, the `.env.example` default, is one; confirm production uses it. Never `array`, and never `file` behind more
  than one web host.
- **Status endpoint.** The production client must be granted the identity-status endpoint at the
  provider. Otherwise every check answers 503.
- **Baselines first.** Deploy this, then wait before enabling. Sessions and remember-me cookies
  created after the deploy carry baselines, recorded while enforcement is still off. Sessions and
  cookies from before it don't, so those players sign in again once when enforcement goes on. The
  first remembered sign-in of each account after the deploy also replaces its remember token, so
  that account's other devices sign in again once.

## Turning it on and recording the cutover

1. Set `BHERILA_AUTH_PROVIDER_IDENTITY_ENABLED=true` in the server environment and deploy (or
   rebuild the config cache).
2. Before disabling an isolated test account, establish separate sessions through bherila ID,
   bound Google and a remember-me cookie. Disable it at the provider. Safe GET requests may use
   a shared observation for up to five minutes, including remembered sessions; wait beyond that
   cache lifetime before verifying each session ends. Alternatively use a harmless authenticated
   unsafe-method request on the isolated account, which forces a fresh status check. Do not use
   logout as proof: it is deliberately exempt. Re-enable the test account afterward.
   Confirm Google cannot establish a new session while the identity is disabled.
3. Record the cutover once on the production host:

   ```bash
   php artisan bherila-auth:provider-identity-cutover record
   ```

4. `php artisan bherila-auth:provider-identity-cutover` (status) should report enforcement on.

Every deploy runs `bherila-auth:provider-identity-cutover check` as its first artisan command,
at the stable path while maintenance still holds (`.github/workflows/ci.yml`). It passes while no
cutover is recorded. Once a cutover is recorded, it fails the deploy if the setting is off or the
provider client is incomplete. Production then stays in maintenance until the configuration is
fixed; see [deploy recovery](deploy-recovery.md). To leave the provider on purpose, follow the
package's withdrawal steps; never just turn the setting off.

## Account deletion and merging

`AccountDeletion` removes the account's `provider_remembered_logins` rows. A merge deletes the
absorbed account through the same path. The kept account's rows survive. If the merge moves a
bherila ID binding onto the kept account, its recorded baselines no longer match, and its
remember-me cookies sign in again once.

A refused first Google sign-in or a provider outage rolls back any new Google link and its
audit record together. A successful verification commits the link before issuing the session.
