# Mandarin Quest — phase 2: live runtime report

**Branch:** `mandarin-phase2-live` (off `main` at `3d3dc98`, the squash of #41)
**Implementation head:** `44c6986` — "Add Mandarin Quest live runtime with pluggable speech providers"
(this report lands in the following commit).
**Route:** `/mandarin` live; `/mandarin/preview` mock (404 in production). Not merged, not deployed.

Status in one line each, as the brief asks:

| Claim | Status |
|---|---|
| GUI complete | Yes — the phase-1 UI is unchanged apart from the five Codex P2 fixes below |
| Live speech verified | Yes, locally on macOS with the `say` provider: 16 real speech clips + 4 procedural cues generated, stored, served and played in Chromium and WebKit |
| Persistence verified | Yes, locally: signed-in answers are graded and stored server-side; progress endpoint reflects them; local copy is account-partitioned |
| Polly verified | Yes (authorized smoke run, 2026-09-06): node `s1n1`, both variants, 16 sources → 14 assets (two text dedupes), all ready, 36 billed characters (≈ $0.0006), mp3 24 kHz validated by ffprobe, played in Chromium and WebKit through the live spec with generation disabled (cache hits only). IAM simulation: `polly:SynthesizeSpeech` allowed for the profile's user |
| S3 verified | No. Local disk only; `mandarin:audio:migrate` not implemented |
| Final artwork generated | No. All nine slots still use the phase-1 SVG fallbacks (no image tool in this session) |
| Native-reviewed | No, and the imported revision records `nativeReviewed=false`, `audioAuditioned=false` |

## What changed

67 files. Backend under `app/Services/Games/Mandarin/`, three migrations, five commands,
six endpoints, one media route; frontend gains an HTTP gateway, a ts-fsrs projection, a
live composition root and a runtime switch. See `docs/games/mandarin.md` for the layout,
commands and configuration.

### Pluggable speech layer

`SpeechSynthesizer` is the seam. A provider resolves the voice from the story role and
returns a deterministic recipe (provider, engine, voice, language, rate, format, template
version) plus bytes; it never accepts client text, SSML, model or URL overrides.

| Provider | Id | Environment | Distinct role voices | Notes |
|---|---|---|---|---|
| `NullSpeechSynthesizer` | `null` | default | — | every miss is `unavailable / provider_unconfigured` |
| `MacOsSpeechSynthesizer` | `macos` | local development | yes when ≥2 zh_CN voices are installed (this Mac has 9) | `say -v <voice> -r <wpm> -o x.aiff -- <text>` then `afconvert -f m4af -d aac`; AAC/M4A, 22.05 kHz; refuses to read Mandarin without a zh_CN voice |
| `PollyCliSpeechSynthesizer` | `polly` | production candidate | no (one stock Mandarin voice) | `aws polly synthesize-speech` via the CLI credential chain; Zhiyu, neural, cmn-CN, mp3 24 kHz; slow = SSML `<prosody rate="85%">`; error text is classified, never echoed to clients |

Changing provider, voice or rate changes the recipe hash, so old objects stay valid for
old references and new ones are generated lazily. Role and variant labels are stored for
regeneration but are not part of identity: two roles on one voice share one object.

Licensing note: Apple system voices are fine for the personal local alpha; do not assume
they permit redistributing a large synthesized corpus. The macOS provider is labelled
local/development for that reason.

### Lazy generation, as tested

- Miss → one `mandarin_audio_assets` row per recipe hash (unique constraint); a concurrent
  identical miss reuses the row and dispatches no second job (`test_miss_is_claimed_once…`).
- Worker: `UPDATE … WHERE state='queued' OR (state='generating' AND lease expired)` with a
  fresh lease token and `attempts+1`; synthesis happens outside any transaction; validation
  (container magic, size, ffprobe duration when available); write to the configured disk;
  size re-read; publish `ready` only `WHERE lease_token = ?` so a stale worker cannot
  overwrite a newer attempt.
- Failures record a contract error code; retry is explicit (a new resolve by an allowed
  caller) and bounded by `max_attempts`; `unsupported_voice/language` are never retried.
- `poll` and `bootstrap` never enqueue. Guests get cache hits; a miss returns
  `sign_in_required`. Generation disabled returns `generation_disabled` even for
  signed-in users; SFX render regardless (no provider, no budget).
- A ready row whose object is missing is demoted and regenerated; the media route 404s.
- `mandarin:audio:recover --dry-run|--execute` handles expired leases; nothing hidden in a
  GET path does.
- Budget: characters are reserved atomically in the shared cache per attempt before each
  provider call; cache hits and SFX cost nothing.

### Progress and scheduling

- `POST /api/games/mandarin/events`: bounded batch (64), per-event validation against the
  referenced revision (unknown revision, exercise, node, scene, option/tile tampering),
  unique `(user, client_event_id)`, canonical per-user `sequence`, payload hash for
  `already_present` vs `conflict`.
- Grading policy is server-side: `Again` for wrong / don't know / help before answering,
  `Hard` for correct after replay or slow, `Good` for correct on the first completed normal
  play; unscored without completed audio; extra practice, checkpoint and construction never
  grade a card. Only `lesson`/`review` responses with a primary target are schedule-eligible,
  and only one per target per ten-minute window.
- `GET /api/games/mandarin/progress` returns unlocks plus `listeningCards` as a graded
  review log; the client's pinned `ts-fsrs` 5.4.2 adapter (`domain/scheduler.ts`, fuzz off,
  retention 0.90) replays it and never lets a card come due before its window ends. No PHP
  FSRS competes with it.

## Tests run and results

Run on 2026-09-06 at head `44c6986` (macOS, PHP 8.5, pnpm 11.5, Playwright 1.62, ffmpeg 9).

| Gate | Result |
|---|---|
| `pnpm run type-check`, `pnpm run lint`, `pnpm run scan-sensitive` | pass (0 lint errors) |
| `pnpm run test` | 222 suites / 2347 tests pass — 13 Mandarin suites, 74 tests (new: `httpGateway`, `scheduler`, `liveRuntime`, plus regressions for the P2 fixes) |
| `pnpm run build` → Pint, PHPStan (level 6), `artisan test` | pass — 172 tests; new: `tests/Unit/Mandarin` (SFX WAV, macOS provider with a fake process runner) and `tests/Feature/Mandarin` (import, bootstrap, audio resolve/poll/media/recover/warm/doctor, events/grading/window/isolation, runtime switch) |
| `MANDARIN_LIVE_E2E=1 pnpm run test:e2e:mandarin` | 30 pass on chromium-desktop + webkit-mobile-375, including the live spec: guest plays a pre-warmed real clip (media response `audio/mp4`), signed-in answer graded server-side and persisted |

Local live run: `APP_ENV=e2e`, sqlite scratch DB, database queue with a worker, macOS
provider, node `s1n1` warmed (20 sources → 20 ready: 16 speech, 4 SFX). Doctor output:
provider probe OK with Tingting/Eddy/Flo assigned to narrator/traveler/friend, storage OK,
queue OK, ffprobe OK.

Screenshots: `docs/games/mandarin-screenshots/live-teaching-ready-audio-{chromium-desktop,webkit-mobile-375}.png`
(macOS provider) and `live-teaching-polly-chromium-desktop.png` (Polly provider, cache hits
only); no preview banner, Play controls in the `ready` state.

## Codex P2 findings on #41, fixed forward here

1. Reset now clears mock server state (`MockMandarinGateway.reset()` through
   `runtime.resetState`) and ignores acknowledgments from before the reset.
2. A retry after feedback is assisted (`answerDisclosed`), so it can never be labelled or
   graded unaided; `textHelpUsed` is set on the event.
3. Listening-check summary keeps unscored answers unscored and counts first-hearing success
   only from a correct, unaided first answer.
4. `recordCheckpointResult` takes the freshness captured when the item was shown.
5. The prompt player's Retry covers a failed slow variant as well.

## Mocked, deferred, or blocked

- **Polly beyond scene 1** is not generated. Full-course cost at the neural rate is about
  $0.011 for both variants (688 characters); the daily character budget caps runaway
  retries. Zhiyu reads every role, so `hasDistinctMandarinVoices` is false with Polly.
- **`aws/aws-sdk-php`** was not added; the CLI adapter avoids the new dependency. A
  `PollyClient` adapter is a drop-in behind the same interface.
- **S3**: no bucket configured, no integration test, no migrate command.
- **Artwork**: unchanged SVG fallbacks.
- **Guest import** of local progress into an account is not implemented (deliberate
  action per the contract; nothing auto-imports).
- **`mandarin.env.example`** referenced by the brief was not in the kickoff folder;
  `.env.example` gained the `MANDARIN_*` lines instead.
- **Deployment notes**: the worker must run `queue:work --queue=mandarin-audio` with the
  same storage as the web process; local disk across separate containers is not a shared
  cache. Nothing here migrates or seeds a production database.
