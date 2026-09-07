# Game Data Persistence

Authenticated game progress is stored in `user_game_data`. Anonymous players continue to use each game's versioned browser-storage format. The shared frontend adapter lives in `resources/js/games/_shared/gameDataPersistence.ts`; the backend row merge and optimistic-save behavior live in `app/Services/Games/`.

## Row Model

Each row is uniquely addressed by `(user_id, game, scope, slot)` and includes JSON `data`, a `revision`, and Eloquent timestamps. Active-save rows also retain an internal writer id/sequence and a clear tombstone so retries and out-of-order requests from one page stay idempotent without weakening cross-device conflict detection. Save-aware game pages receive tombstones as ordering metadata but never decode them as playable state; Game Select requests no save rows at all.

| Scope | Slot examples | Purpose | Reconciliation |
|---|---|---|---|
| `profile` | `default`, `inventory` | Global unlock/score watermarks and mutable power-up inventory | Progress metrics retain their maximum or best value; inventory follows the active save owner |
| `level` | `1`, `2`, or a stable Hover map id | One independently upsertable level/map result | Best stars, score, clear watermark, or lowest positive move count wins |
| `save` | `autosave` | A complete active-board JSON snapshot | Whole-document replacement guarded by an optimistic revision |

The API allowlists every supported game/scope/slot combination. Summary and level documents are limited to small JSON payloads; active snapshots have a larger limit. Completing a level sends its profile, level, inventory, and autosave-clear operations as one transactional batch so the completed result cannot be lost behind a racing snapshot deletion.

## Browser Behavior

- The authenticated page hydrates its requested games before mounting React. Game Select requests progress rows only, not active-board snapshots.
- A valid anonymous save is promoted only after its first successful authenticated write, then the local copy is removed.
- Authenticated API failures do not silently fall back to `localStorage`, which would create two competing sources of truth.
- Rapid active-board updates are coalesced and re-debounced between requests. Pending writes use a keepalive request when the page is hidden; same-page writer sequencing makes an overlapping lifecycle flush safe.
- A stale active-save revision stops that tab from writing the active save or mutable inventory and shows a reload warning. Monotonic best-score and level rows may still reconcile safely.
- Device-only preferences such as mute and colorblind mode remain local.

## Supported Games

The database adapter currently covers Chick's Challenge, Block Blaster, Marble Sort, Parking Pickup, Hover, Math Horde, and 2048. 2048 is the first score-only game here: it has no `level` rows at all, its `profile/default` row keys best score and highest tile per board size under monotonic metric names, and its `save/autosave` row holds the live board plus the remaining undo history. Tower Throwback is deliberately not registered in this adapter yet. Its existing concurrent-play guard remains the authority; a later integration can map each Tower save slot to a generic `save` row without changing this row model.

When adding another game, add its backend slug/slot allowlist, define versioned frontend row codecs, register only the definitions needed by each page, and cover anonymous promotion, malformed data, reconciliation, and concurrent-save behavior with tests.

## Installed app, offline play, and sign-in

The service worker caches game shells (network-first with a 3s timeout), `/build/assets/**`
and `/audio/games/**`, plus Mandarin's content-hashed speech at
`/media/games/mandarin/{asset}/{hash}.{ext}` (cache-first — the hash is the content digest,
so there is nothing to revalidate). A cached shell is rewritten to `authenticated: false`
with a blank CSRF token; `readAuthenticationContext` recognises `pwaCachedShell` and restores
the account from `LAST_AUTHENTICATED_USER_KEY`, so an offline player is still the right user.

**Sign-in routes are never served from cache.** `/login`, `/logout` and `/oauth/*` are excluded
from the shell handler (`isAuthNavigation`). `/oauth/callback` is what establishes the session;
answered from the shell cache after the 3s timeout it would silently never run, leaving a
player on a games page that looks signed in only because the account id is still in local
storage.

Two things about an installed iOS app are worth knowing before promising anything in the UI:

- **Its storage is its own.** Cookies, local storage, IndexedDB and the service worker
  registration are all separate from Safari's. Nothing carries across, so a player must sign in
  again inside the installed app; only progress held on the server comes back.
- **OAuth leaves the manifest scope.** `/oauth/redirect` is a cross-origin 302 to the identity
  provider. Returning in-scope lands back in the app on Android; iOS behaviour around which
  browsing context receives the callback is worth testing on a real device before relying on it.

Installed apps are exempt from Safari's 7-day eviction of unused site data, which matters for
a player whose progress is waiting in an outbox.
