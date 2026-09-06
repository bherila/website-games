# Mandarin Quest: Find Your Friend — phase 1 handoff

**Branch:** `mandarin-phase1-ux` (off `main` at `8184e15`)
**Implementation head:** `61b0267` — "Add Mandarin Quest preview UX skeleton with mock adapters"
(this document and the screenshots land in the following commit on the same branch).
**Route:** `/mandarin` (route name `games.mandarin`). Not merged, not deployed.

Everything that speaks to a server, generates audio, or saves to an account is a mock
behind a dependency-injected interface. The UI never claims otherwise: a preview banner
is on every screen, save-state chips say "mock", and no screen uses the words
"mastered", "certified", or "reviewed".

## What is in the branch

82 files, all additive except three one-line integrations (`routes/web.php`,
`vite.config.ts`, and a game-select catalog entry). No migrations, no API controllers,
no auth changes, no edits to other games.

| Area | Files |
|---|---|
| Canonical data | `resources/data/mandarin/{foundations.v1.json, course.schema.json, visual-assets.v1.json}` — verbatim copies of the kickoff package |
| Shared contract | `resources/js/games/mandarin/contracts/mandarin.ts` — verbatim `MandarinGateway`, `AudioResolution`, `PracticeEvent`, `VisualAsset` types |
| Domain | `domain/courseSchema.ts` (zod mirror of the JSON schema + referential checks), `domain/course.ts` (single JSON import, `CourseIndex`), `assessment.ts`, `progress.ts`, `reviewSession.ts`, `events.ts`, `settings.ts`, `random.ts` |
| Adapters (mock) | `adapters/MockMandarinGateway.ts`, `adapters/previewScenarios.ts`, `adapters/previewStore.ts` |
| Audio | `audio/speechChannel.ts` (one managed channel), `audio/audioManager.ts` (resolve/poll/play), `audio/deviceVoice.ts`, `audio/sfxRecipes.ts` (four Web Audio recipes) |
| Scene | `scene/sceneConfigs.ts` (five data-driven configs), `scene/dioramaRenderer.ts` (one renderer), `scene/DioramaCanvas.tsx` (poster-first host), `scene/webglSupport.ts` |
| Assets | `assets/visualRegistry.ts`, `assets/SlotImage.tsx`, `public/images/games/mandarin/fallback/*.svg` |
| UI | `MandarinGame.tsx` (provider/router), `ui/*` (shell, prompt player, question, construction, overlays), `ui/screens/*` (Home, Onboarding, Teaching, Lesson, SceneComplete, Review, ListeningCheck, Settings) |
| Composition roots | `runtime/MandarinRuntime.ts` (the DI bundle), `runtime/previewRuntime.ts` (only reader of `?scenario=`), `index.tsx` |
| Laravel | `resources/views/games/mandarin.blade.php`, `routes/web.php`, `tests/Feature/MandarinGamePageTest.php` |
| Tests | `resources/js/games/mandarin/__tests__/*` (10 suites), `tests/e2e/mandarin.{journey,visual}.spec.ts`, `tests/e2e/mandarin.helpers.ts` |
| CI | `.github/workflows/mandarin-playwright.yml` (manual dispatch; Chromium + WebKit), `playwright.config.ts` gains a `webkit-mobile-375` project scoped to Mandarin specs, `package.json` gains `test:e2e:mandarin` |
| Docs | `docs/games/mandarin.md`, `docs/games/mandarin-asset-slots.md`, this file, `docs/games/mandarin-screenshots/` |

## Architecture and adapter entry points

```
index.tsx ─► createPreviewRuntime() ─► MandarinRuntime { course, gateway, audio, store, scenario }
                                              │
                                    <MandarinGame runtime>
                                              │
              RuntimeProvider ─► GameProvider (bootstrap, progress, settings, outbox, router)
                                              │
                    GameShell (DioramaCanvas + DOM panel) ─► screens ─► PromptPlayer / ListeningQuestion / …
```

Codex replaces adapters without touching `ui/`:

- **Gateway.** Implement `MandarinGateway<Course>` over HTTP and build it in a new
  `runtime/liveRuntime.ts` that returns the same `MandarinRuntime` shape with
  `scenario: null`. The preview banner and scenario links render only when `scenario`
  is non-null, so the live runtime hides them automatically. Production must construct
  the live runtime unconditionally; only `previewRuntime.ts` reads the query string.
- **Audio.** `audioManager.ts` already handles every state in the `AudioResolution`
  union. When the live gateway returns `ready`, `speechChannel.ts` plays the URL through
  an `HTMLAudioElement` (unit-tested with a stub element). Nothing else changes.
- **Persistence.** `PreviewStore` is the local partition. The live runtime should keep
  it for settings and outbox but must not import `mandarin.preview.progress.v1` into an
  account; the store's keys all begin with `mandarin.preview.` so that is easy to audit.
- **Artwork.** See `docs/games/mandarin-asset-slots.md`.

### Domain invariants the UI relies on

- `CourseIndex` is the only reader of the course JSON. `reservedUtteranceIds` (T01–T10)
  are excluded from teaching, glossary, and review; only `ListeningCheckScreen` reads
  `checkpointById`, and only after `isCheckpointUnlocked()` (last node `s5n2` complete).
- `assessment.ts`: one `opportunityId` per question; options shuffled once from that
  ID; retry keeps `helpRevealed`, play counts, and `optionOrder`; a retry attempt is
  never `unaided`; `unscored` when no real audio completed (simulated / failed / none).
- `progress.ts`: node completion is a story unlock (any resolved run). `summarizeScene`
  reports questions, first-attempt-unaided-correct, and help-used counts; it has no
  mastery field by design.
- `events.ts` builds contract-shaped `PracticeEvent`s; correctness is never sent.

## Screens

Home/journey, Onboarding (welcome → sound check → skippable pinyin/tone intro),
Teaching, Lesson (listening questions then sentence construction), Scene completion,
Review (scheduled, bounded to 10, states empty/loaded/backlogged/completed) and Extra
practice (visibly distinct, does not move review dates), Listening check (10 reserved
items, strict mode, fresh vs repeat exposure), Settings (speech/SFX volume, device-voice
preview opt-in, reduce motion, 2D scenery, pinyin preference, reset with confirmation,
local-data explanation, scenario links). Map and glossary overlays are available inside
lessons.

## Screenshots

Captured by `pnpm run test:e2e:mandarin` into `test-results/mandarin/` (36 files, both
projects). A downscaled subset is committed under `docs/games/mandarin-screenshots/`.

| Screen | Mobile WebKit (375×812) | Desktop Chromium (1703×959) |
|---|---|---|
| Onboarding | `onboarding-webkit-mobile-375.png` | — |
| Home (fresh / returning) | `home-fresh-webkit-mobile-375.png` | `home-returning-chromium-desktop.png` |
| Teaching s1n1 | `teaching-s1n1-webkit-mobile-375.png` | — |
| Listening question | `question-listening-webkit-mobile-375.png` | `question-help-chromium-desktop.png`, `question-feedback-chromium-desktop.png` |
| Sentence construction | `construction-webkit-mobile-375.png` | — |
| Dioramas, scenes 1–5 | — | `diorama-scene-{1..5}-chromium-desktop.png` |
| Scene complete (reunion) | `scene-complete-reunion-webkit-mobile-375.png` | — |
| Review (backlogged) | — | `review-backlogged-chromium-desktop.png` |
| Listening check intro | `listening-check-intro-webkit-mobile-375.png` | — |
| Settings | — | `settings-chromium-desktop.png` |
| 2D fallback | `home-2d-fallback-webkit-mobile-375.png` | — |

## Tests run and results

Run on 2026-09-06 against head `61b0267` (macOS, PHP 8.5, pnpm 11.5, Playwright 1.62
with Chromium and WebKit installed).

| Gate | Result |
|---|---|
| `pnpm run type-check` | pass |
| `pnpm run lint` | pass (0 errors; pre-existing warnings unchanged) |
| `pnpm run test` (Jest) | 219 suites, 2336 tests pass — 10 suites / 61 tests are new |
| `pnpm run scan-sensitive` | clean |
| `pnpm run build` | pass (Mandarin entry present in `public/build/manifest.json`) |
| `./vendor/bin/pint --test` | pass |
| `vendor/bin/phpstan analyse --memory-limit=1G` | pass, 0 errors |
| `php -d memory_limit=1G artisan test --compact` | 143 tests pass (5 new in `MandarinGamePageTest`) |
| `pnpm run test:e2e:mandarin` | 26 pass (13 per project: chromium-desktop, webkit-mobile-375) |

Touched PWA behaviour: none. The manifest and service worker are unchanged and
`GamePwaTest` still passes.

### What the new Jest suites cover

- `course.test.ts` — parses the shipped JSON; counts (5/10/30/18/50/50/5/10); no semantic
  errors; reserved utterances outside every node/scene; checkpoint unlock after `s5n2`;
  schema `required` keys mirrored; invalid JSON rejected.
- `assessment.test.ts` — options shuffled once and stable; unaided vs replay/slow/text;
  unscored without completed audio; hints and play counts persist across retry; retry is
  never unaided; `dont_know`/`skip` distinct from a wrong answer.
- `progress.test.ts` — unlock order across the whole journey; checkpoint locked until
  the end; scene summary has no mastery field; vocabulary never includes reserved
  text; bounded review with backlog; extra practice drawn only from completed nodes.
- `mockGateway.test.ts` — never returns `ready` for speech in any scenario;
  queued→generating→preview walk; queued-forever; retryable failure then success;
  unavailable/sign-in/offline; unknown source and revision rejection; idempotent
  appends (already_present / conflict); unscored grading without audio; projection.
- `speechChannel.test.ts` — no overlap (second play interrupts first); `NotAllowedError`
  → `blocked`, other rejection → `failed`; stale `ended` callbacks ignored; device voice
  without a synthesiser → `unavailable`; `stop()` notifies subscribers.
- `audioManager.test.ts` — bounded polling turns an endless queue into a retryable
  failure; explicit retry only; transport failure honest; rapid replay interrupts; SFX
  never plays over speech; English-only voices report no Mandarin voice.
- `previewStore.test.ts` — only `mandarin.preview.*` keys written; reset leaves other
  keys alone; corrupt JSON and missing storage tolerated.
- `visualRegistry.test.ts` — registry IDs equal manifest IDs; every scene poster and
  role portrait resolves.
- `DioramaCanvas.dom.test.tsx` — 2D mode never loads Three.js; WebGL probe failure,
  loader rejection, and renderer construction error all fall back to the poster;
  scene/beat/reduced-motion forwarded and disposed on unmount.
- `MandarinGame.dom.test.tsx` — full onboarding → five scenes → listening check in 2D
  mode with a memory store: banner text, hidden text and no aria-label answer leakage,
  simulated playback labelled unscored, no forbidden claims, reserved text absent until
  the check, `fetch` never called, checkpoint exposure recorded; plus locked checkpoint,
  returning-learner backlog, extra practice, and reset-with-confirmation.

## Mocked vs real

| Concern | Status in this branch |
|---|---|
| Course content | Real JSON, validated at load |
| Bootstrap / progress / events | `MockMandarinGateway` (in-memory, idempotent, grades by the documented policy) |
| Audio resolution | Mock. Speech never resolves to `ready`; the "Audio becomes available" scenario ends in `preview` with a message saying the live gateway returns a ready URL there |
| Speech playback | Device Mandarin voice when present and opted in (labelled "Preview voice from this device"), otherwise a silent simulated pause labelled unscored. English voices are never substituted |
| SFX | Real Web Audio, rendered from the four recipes in `sfxRecipes.ts`; the same recipe IDs are what Codex should store as files |
| Persistence | Local `mandarin.preview.*` partition only; outbox kept until the mock acknowledges |
| Save-state chips | Driven by scenario (`local_preview`, `guest_local`, `saving`→`saved`, `offline`, `sign_in_required`); all say "mock" or "this browser" |
| Artwork | Authored SVG fallbacks in every slot |
| Auth, AWS, Polly, storage, migrations | Not implemented, by design |

## Open the preview and exercise failure states

```bash
pnpm run build
APP_ENV=testing DB_CONNECTION=sqlite DB_DATABASE=$PWD/database/database.sqlite \
  SESSION_DRIVER=file php -d memory_limit=1G artisan serve --host=127.0.0.1 --port=8000
# then open http://127.0.0.1:8000/mandarin
```

Scenario selector (preview root only; a live runtime ignores it):

| URL | State |
|---|---|
| `/mandarin` | Fresh learner |
| `/mandarin?scenario=returning` | Scenes 1–2 done, 12 targets due (backlogged review) |
| `?scenario=dueReviews` / `noDueReviews` | Loaded review / empty review offering extra practice |
| `?scenario=queuedAudio` / `generatingAudio` | "Preparing audio…" then a bounded timeout with Retry |
| `?scenario=readyAudio` | queued → generating → preview |
| `?scenario=providerUnavailable` | Unavailable, not retryable |
| `?scenario=retryableError` | Fails once; Retry succeeds |
| `?scenario=noDeviceVoice` | Simulated playback, unscored |
| `?scenario=offline` | Transport errors; progress stays local |
| `?scenario=guest` | Guest chip; generation needs sign-in |
| `?scenario=saving` | Mock account; Saving… → Saved (mock) |
| `?scenario=signInRequired` | Saves rejected |

The same links are in Settings and inside the banner's "Preview scenario" disclosure.
`pnpm run test:e2e:mandarin` walks every one of these automatically.

## Known defects and gaps

- The visual-registry `src` is currently identical to `fallbackSrc`; nothing in this
  branch is "generated" yet.
- Device-voice preview quality varies by OS. On macOS WebKit the test run found
  "Tingting"; the label makes clear it is not the final recording.
- The scene-complete beat plays the reunion "friend appears" animation once per visit;
  reduced-motion snaps it. There is no confetti or celebratory copy by design.
- The `material-paper` slot is registered but not rendered anywhere (optional in the
  manifest).
- The listening check reuses `ListeningQuestion` in strict mode; a dedicated layout
  with a larger single Play control would be a small follow-up.
- `docs/mandarin-kickoff/` (the input package) was left untracked and is not part of
  the branch.
