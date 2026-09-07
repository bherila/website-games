# Claude Code brief — Mandarin Quest UX and scenery

## Assignment and boundaries

Build the first **complete, interactive UX skeleton** of **Mandarin Quest: Find Your Friend** in `bherila/website-games`, at `/mandarin`. The user selected Claude Code / Fable for visual and interaction work. A subsequent Codex pass will generate final images, import the lessons into Laravel, implement real audio generation, and add cloud progress. Do not implement those backend systems in this pass.

This is a Mandarin-first game for an English-speaking adult with essentially no Chinese. The goal is understanding television dialogue, not handwriting or exam preparation. Build an adult-friendly story game, not a spreadsheet of cards and not an empty collection of sample screens. Five scenes must be traversable in clearly labeled preview mode.

Read the repository's current `AGENTS.md`, relevant game docs, routes, Vite entries, shared UI, PWA code and an existing Three.js game before editing. Work from the current checkout, not the old planning commit. The inspected repository already has React, TypeScript, Three.js and Zod. Prefer existing Three.js integration patterns rather than adding another renderer framework without a concrete reason. Do not alter authentication or other games. Add only the ordinary read-only Laravel page route/shell and registration needed to mount this new game; no new persistence migrations or paid API calls in this pass.

## Inputs and shared source of truth

The accompanying kickoff folder contains:

- `data/mandarin-foundations.v1.json`: five scenes, ten learning nodes, thirty primary targets, eighteen supporting glossary entries, fifty spoken utterances, fifty training questions, five sentence-construction exercises and ten reserved listening checks.
- `data/mandarin-course.schema.json`: structural schema.
- `contracts/mandarin.ts` and `03-shared-contract.md`: phase boundary and state behavior.
- `data/visual-assets.v1.json`: stable art slots and generation requests for Codex.

Put the canonical course files under `resources/data/mandarin/`, or the nearest equivalent shared frontend/backend resource directory. Keep one source, not divergent PHP and TS copies. Validate at build/test time; do not import JSON by scattering property access throughout components. Generate or maintain a typed course loader validated against the schema. Preserve content IDs, option IDs, source meanings and reserved-checkpoint boundaries. The target-ID annotations identify learning families, not a Chinese tokenizer.

Use the supplied scripts. Language corrections are allowed when justified and documented, but do not expand this into a much larger course. These scripts are AI-authored and **not native-reviewed**. Do not display a reviewed/certified claim. You may show “Personal alpha • synthetic voices planned” in preview information.

## Visual direction

Create a coherent miniature journey through a quiet fictional Chinese-inspired village: a gate, a street, a stone bridge, a roadside shelter and a reunion courtyard. Use original settings and fictional characters, not assets or likenesses from a television adaptation. Favor warm ivory, muted jade, slate blue and restrained amber accents, ample whitespace and readable contemporary typography. No fake Chinese glyphs, decorative pseudo-calligraphy, giant scroll UI or low-contrast text-on-texture.

The main visual should be a small, attractive **2.5D/3D diorama**, not a first-person world. Use one reusable Three.js renderer with scene configuration and shared primitives/materials. Build actual geometry for ground, path, roofs, walls, bridge, water and a few plants. Author simple characters as understated silhouettes or billboards; no skeleton rigs, lip sync, physics or walking simulator. Let the story advance with a subtle camera/lighting transition or a small character movement after feedback. Do not require precise 3D clicking to learn a language.

There is no need for five independent renderer implementations. Reuse lighting, camera and components. A journey overview can be a DOM map with scene cards rather than a second complicated 3D world.

Use a real DOM overlay for dialogue, text, controls and quizzes. Essential controls and Chinese text must never be painted only onto WebGL. Keep the scenery quiet during listening. Do not visually reveal the answer—for example, an absent friend, highlighted correct action or character gesture must not tell the player what an unheard sentence means. Story animations may respond **after** an answer is submitted.

## Images and replacement slots

Claude owns geometry, layout, fallbacks and asset placement. Codex owns final image generation. Image generation yields image files, not automatically usable rigged characters or `.glb` geometry.

Create a central visual registry keyed by the exact IDs in `visual-assets.v1.json`. Use working, original SVG/CSS fallback art at every required slot. Never point to imaginary files. Record aspect ratio, pixel target, transparent/opaque expectation, crop/anchor behavior and usage. The five scene posters are for fallback/card artwork and art-direction reference; they should not become a competing duplicate 3D foreground. The three portraits are for dialogue overlays or optional billboards. The paper texture is optional.

Keep all Chinese and English UI text in DOM. Do not ask future images to contain lesson text or baked-in buttons. Add `docs/games/mandarin-asset-slots.md` with screenshots or element descriptions showing exactly where each image belongs. Codex must be able to replace the registry entries without changing the learning screens.

## Screens to finish

**Home / journey.** Title, Continue, Review, Practice, Listening Check and Settings. Show the five scenes, permanent unlocks and a clear current node. Show local-preview versus real account status correctly. A visible preview banner must say that cloud persistence and provider audio are not yet connected.

**Onboarding.** Explain in English: listen before revealing text; mistakes produce help, not lost lives; voices will be synthesized. Include a sound-check state. A tiny skippable pinyin/tone introduction is enough. Do not gate the story on a tone-number quiz.

**Teaching.** Present each node's two to four new primary targets and its required supporting glossary items before assessed use. Show Chinese, pinyin and contextual English with replay/slow controls. Introduce only the current node's utterances; the full scene can be replayed after both nodes have been introduced. Do not expose reserved checkpoint text in the glossary or preview curriculum screens visible to the learner.

**Listening question.** Three plausible English choices, big Replay and Slower buttons, optional Help revealing transcript/pinyin/meaning, and an “I don't know” route. Hide text on the initial assessment. The submitted option remains stable when feedback appears. Randomize option placement once per question, not on every rerender. Feedback explains the supplied distinction and supports retry without penalty. Teach the difference between helped and unassisted success without shaming the learner.

**Sentence construction.** One per scene, using the supplied chunks. Provide tap-to-place and undo/reset, not drag-only controls. This is reading/grammar practice, never evidence of unaided listening.

**Scene completion.** A small story beat and summary: completed, answered on first attempt, used help, and new language encountered. Completion unlocks the next scene even after supported practice. Never label a finished scene “mastered” automatically.

**Review.** Bounded default session of about ten questions; show empty, loaded, completed and backlogged states. In this phase the gateway supplies a deterministic mock due list. Do not implement a second, throwaway spaced-repetition algorithm in the UI. Keep extra practice visibly different from scheduled review.

**Listening check.** Use the ten reserved items after the course. No initial subtitles, normal-speed first presentation, record replays/help, and distinguish fresh exposure from repeat practice. A preview run cannot claim measured learning. Do not show a novel-speaker metric; the AWS-only first release may use a single narrator.

**Settings / accessibility.** Separate speech and SFX volume; low-motion/2D mode; pinyin assistance preference; reset **preview** progress with a confirmation; clear explanation of local data. No microphone permission or speech recognition.

## State architecture and mock integration

Build components against `MandarinGateway<TCourse>` in the shared contract. Implement a `MockMandarinGateway` and a mock asset/audio manager behind dependency injection, not hardcoded conditionals in each component. UI components must not call fetch, AWS, browser synthesis or localStorage directly.

Provide deterministic preview scenarios for: returning learner, no due reviews, queued audio, generating audio, ready audio, provider unavailable, retryable error, no suitable device voice, offline state, guest, saving and sign-in required. These scenario selectors must be confined to preview/local/test use. The production integration must not be switchable to mocks by an arbitrary query parameter.

Preserve preview state locally under a separate `mandarin.preview.*` partition. Do not write existing cloud-save endpoints or disguise mock data as the signed-in user's real learning history. Preview data must not later auto-import into real progress.

For sound, use a device Mandarin voice only as an optional clearly labeled preview after verifying an appropriate language voice exists. Never substitute English speech for Chinese. It is acceptable for the skeleton to use a **“Preview without audio”** path to inspect UI, but that path must be visibly unscored. Do not create a silent file and claim it is Mandarin, fabricate waveforms, or mark simulated playback as delivered audio. The future live gateway will supply real asset URLs.

Use the audio state union as defined: unavailable, queued, generating, ready, failed, plus the explicitly non-live preview state. Device voices and simulated playback use preview; do not invent a ready URL for browser speech synthesis. Loading is not a wrong answer. A cold asset should show “Preparing audio” and a bounded retry path. Keep the player free to open the map or teaching support without losing place. Helped/text-only paths must remain distinct from listening assessment.

Maintain one managed speech channel. Cancel old playback on navigation, stop overlap on rapid replay, ignore stale completion callbacks and handle rejected play promises. Keep a fresh user-gesture Play control when asynchronous loading loses autoplay permission. SFX must not mask speech. If simple Web Audio preview cues are authored, document the recipes so Codex can reproduce them as stored files.

Create a prompt/opportunity ID for an assessment and preserve its hint/replay evidence across feedback and retry. The same question immediately retried after the explanation must not appear as a new unaided first attempt.

## Performance and accessibility constraints

These are design budgets to measure, not claims about current performance: target smooth interaction on a mid-range mobile viewport; one canvas, capped pixel ratio initially at 1.5, modest geometry/draw calls, no expensive post-processing by default, and no WebGL startup blocking the first usable DOM screen. Pause animation when hidden. Reuse/dispose textures, geometries, listeners and renderer resources correctly. Test repeated scene changes for leaks.

Use a static poster/SVG fallback if WebGL is disabled, creation fails, context is lost or the user chooses low-power mode. The learning flow must remain fully usable. Honor reduced motion. Mobile layout must work at 360px width, safe-area insets and touch targets around 44px; desktop should not feel like an enlarged narrow phone column. Avoid hover-only interactions.

Use visible focus, keyboard choice controls, accessible button labels, readable CJK/pinyin and adequate contrast. Do not leak the transcript/correct answer in an aria-label when it is supposed to be hidden. Offer explicit text-assisted access rather than pretending text is unaided audio. Do not add or distribute font files outside normal project dependency handling.

## Tests and handoff to Codex

Add tests for course parsing, visible/hidden assistance, stable randomized options, hint persistence across retry, interrupted/failed audio, mocked state transitions, preview-only persistence, no mock cloud-save claim and no checkpoint exposure before its screen. Test full five-scene navigation and the 2D fallback. Add Playwright journeys and screenshots on mobile WebKit and desktop Chromium; report actual execution, not intended coverage.

Run current repository gates: type-check, lint, Jest, sensitive-data scan, Vite build before PHP view tests, Pint/PHPStan/PHP tests as applicable, and touched PWA tests. Follow AGENTS memory settings and CI aggregation conventions. Do not make unrelated fixes or upgrade the whole dependency graph.

Leave `docs/games/mandarin-phase1-handoff.md` with: branch/head, files changed, architecture/adapter entry points, exact asset slots, screenshots, tests run/results, mocked versus real behavior, and known defects. Include a one-command way to open the preview and exercise failure states.

**Phase 1 is done when** all five scenes and both learning modes can be inspected end-to-end, the scenery and responsive DOM UI are coherent, mock states are honest, fallbacks work, the data/adapter/asset boundaries are documented, and Codex can replace adapters/art without redesigning the game. Do not merge or deploy production without authorization.
