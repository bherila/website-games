# Mandarin Quest: Find Your Friend

A listening-first Mandarin course told as a five-scene story. Served at `/mandarin`;
entry point `resources/js/games/mandarin/index.tsx`.

Read first: `docs/games/mandarin-phase1-handoff.md` (what is real vs mocked, how to run
it, tests) and `docs/games/mandarin-asset-slots.md` (artwork slots).

## Product rules the code enforces

- **Teach before scoring.** Every node opens with a teaching screen (dialogue lines with
  play controls, new words) before any question.
- **Audio → meaning, not reading.** Question text and pinyin stay hidden until the
  learner answers or asks for help. Help is allowed and recorded on the same
  opportunity. Option labels carry no `aria-label` that could leak the answer.
- **Honest audio states.** A source is `unavailable | queued | generating | ready | failed`
  plus the non-live `preview` state. The UI never fabricates a `ready` URL, never speaks
  English in place of Mandarin, and marks any answer without completed real audio as
  unscored.
- **One speech channel.** Navigation cancels speech, a new play interrupts the old one,
  stale callbacks are ignored, a rejected play promise yields a fresh Play control, and
  sound effects never play over speech.
- **Retries are practice.** A retry after feedback keeps the opportunity ID, hint
  evidence and option order, and is never labelled unaided.
- **Story unlocks are not mastery.** Scene completion counts any resolved run; the
  summary reports first-attempt/unaided counts and never says "mastered".
- **Reserved items stay reserved.** Ten checkpoint utterances (`T01`–`T10`) are shown
  only in the listening check after the last node; a Jest journey test asserts their
  text never appears earlier.
- **Preview partition.** All local state lives under `mandarin.preview.*` and is never
  imported into real progress. Scenario selection (`?scenario=`) is read only by the
  preview composition root.

## Layout

- `domain/` pure logic (course index, assessment reducer, progress, review, events).
- `adapters/` mock gateway, preview scenarios, local store.
- `audio/` speech channel, audio manager, device-voice lookup, Web Audio SFX recipes.
- `scene/` five diorama configs, one Three.js renderer, poster-first canvas host.
- `assets/` visual slot registry and `SlotImage`.
- `ui/` DOM components and screens; `MandarinGame.tsx` is the provider/router.
- `runtime/` the DI bundle and the preview composition root.

## Validation

Standard repo gates plus `pnpm run test:e2e:mandarin` (Chromium desktop + WebKit
mobile, screenshots to `test-results/mandarin/`). The manual workflow
`.github/workflows/mandarin-playwright.yml` runs the same suite in CI.
