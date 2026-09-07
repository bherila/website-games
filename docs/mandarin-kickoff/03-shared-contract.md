# Shared contract — preserve across Claude and Codex

This package supersedes the earlier one-agent, Azure-first handoff. This iteration separates GUI work from live integration and changes audio to **server-side lazy generation with persistent Laravel storage**. Cached audio must remain playable without contacting a generation provider.

## Product invariants

The learner starts with no Chinese; written English teaches what to do. Audio assessment tests sound-to-meaning, not reading. Story unlocks remain; listening memory estimates may change. Hints and replays are useful but recorded. No audio, failed audio and simulated audio are not wrong language answers. Immediate retries are practice, not additional successful spaced reviews. One correct sentence does not certify all its words. The same pronunciation of 他 and 她 must never be the sole audio contrast. There is no microphone or speaking score in this release.

Original JSON is the canonical curriculum. Import is idempotent, content revisions are immutable, and IDs survive seeding, asset generation and cloud sync. Human review status is explicit. Do not run a generative model to invent the next lesson or its correct answer at play time.

## Ownership

| Concern | Claude phase | Codex phase |
|---|---|---|
| Scene composition, DOM layout, navigation | Implement | Preserve; repair only real integration defects |
| Three.js geometry and fallbacks | Implement | Keep; replace image slots |
| Final generated images | Document slots with working fallbacks | Generate via available image tool; inspect and integrate |
| Course content | Load supplied JSON | Validate, import and serve the same JSON |
| Audio states / managed player | Implement with honest preview | Connect to real media resolver |
| Persistence / review | Gateway interface and scripted mocks | Authenticated event storage and real scheduling |
| AWS credentials / queue / storage | No implementation | Implement and test |

The template interfaces are in `contracts/mandarin.ts`. They may be narrowed as implementation details become concrete, but changes require both the mock and HTTP adapter tests to pass. Do not change the course IDs or asset slot IDs as a side effect of a design refresh.

## Suggested resource layout

```
resources/data/mandarin/foundations.v1.json
resources/data/mandarin/course.schema.json
resources/js/games/mandarin/{ui,scene,domain,adapters,audio,assets}/
resources/views/games/mandarin.blade.php
public/images/games/mandarin/          # small, authored/generated visual release assets
app/Services/Games/Mandarin/           # live course, media and event services
storage/app/...                       # generated audio through a configured Laravel disk
```

Audio does **not** have to be in `public/audio` or Git. A database row stores its disk and object key. Visual artwork is generated at authoring time and versioned with the UI; dynamic audio is a separate system.

## Audio source identities

Clients send only a published course identity plus an allowlisted source ID and variant. Sources are `utterance`, `target`, or `sfx`. TTS variants are `normal` and `slow`; SFX uses `default`. The server resolves the exact Chinese, voice and synthesis settings. Never accept a client text string, SSML, provider/model override, external URL or filesystem path.

A logical source is not the synthesis cache key. Multiple utterances can share one audio object if their resolved recipes are identical. `guide` and `traveler` are story roles, not guarantees of distinct voice models.

The source's state is:

```
unavailable -> queued -> generating -> ready
                         \-> failed -> bounded explicit retry
```

A separate `preview` state identifies simulated/device-voice playback with no fabricated asset URL; the live HTTP adapter must never return it. `unavailable` covers generation disabled, sign-in required and missing provider configuration. `failed` covers an attempted operation. `ready` includes a valid URL, expiry when applicable, content hash, duration and media type. A missing/corrupt object invalidates readiness even if a database row said ready. Read endpoints do not charge for or enqueue generation.

## Proposed HTTP contract

Preserve repository authentication/CSRF conventions. The route names below are proposed, not existing endpoints.

- `GET /api/games/mandarin/bootstrap`: course/revision, capabilities, public ready-asset metadata and an account-aware initial state. Never generates audio. Private/account-aware response: no-store.
- `GET /api/games/mandarin/progress`: authenticated, canonical progress/event cursor; no-store.
- `POST /api/games/mandarin/events`: authenticated, bounded idempotent event batch, server-derived account and correctness; no-store.
- `POST /api/games/mandarin/audio/resolve`: authenticated and authorized to generate this curated course, maximum 16 sources, resolve/create missing asset jobs. Return 202 if any results are pending; otherwise 200 with per-source states. Global auth/schema/rate failures use normal 401/403/422/429 semantics. No full provider exception in client messages.
- `GET /api/games/mandarin/audio/requests/{id}`: poll a known request without enqueuing anything. Return the same source-state union. Limit polling and back off using retryAfterMs.
- Media GET/HEAD: read ready original lesson assets only, through a controlled route or storage URL. No query-string synthesis. Test MIME, expiry/renewal, Range behavior and browser playback. Private status/auth responses must not be service-worker cached.

A guest can browse lessons and play ready public curriculum audio but cannot cause paid cold-cache generation. Offer sign-in or let an operator warm the first node. No blanket public bucket is necessary. User recordings are not in scope and must never be added to this shared public namespace implicitly.

## Progress events

Response events explicitly distinguish `answer`, `dont_know` and `skip`; a null chosen option is not enough to infer learner failure. Use a UUID per client event, a random client-instance/session ID, and an opportunity ID linking a prompt, hints and retries. Store course revision, chosen option/ordered chunks, help flags, playback evidence and client timestamp. Do not accept a trusted client account ID, correct flag, FSRS state or score. The server computes correctness from the versioned authoring data. Playback evidence remains self-reported, not an anti-cheat proof.

Use server acceptance time and a canonical per-user order for the online-first alpha. Retain client time for diagnostics; do not claim exact historical learning intervals for delayed uploads. The accepted server log is authoritative; TS-FSRS can be a deterministic projection in the client. Persist events before uploading, remove them from the outbox only on acknowledgment, and reconcile optimistic state. Reused UUID with different payload is a conflict. Use unique constraints and transactions, not only UI debouncing.

All local queues are partitioned by authenticated account. Preview, guest and account data are separate. Never relabel queued events when the user changes accounts. Guest import is a deliberate action; preview-generated test records are not imported. Do not store the review log inside a list replaced by the generic game-save merger.

## Art handoff

The visual task manifest records requested assets, not actual generated images. Claude must bind all slots to real fallbacks. Codex must write an implementation manifest with actual file paths, dimensions, alpha, provenance and hashes after generation. An art-generation tool is not a 3D modeling tool. Scene posters are fallbacks/card art; Three.js remains responsible for geometry. No UI text is baked into images.

## AWS facts underlying this choice (checked 2026-09-06)

AWS's documented Nova 2 Sonic language list does not include Mandarin. Its multilingual voices are not an assurance of support for arbitrary languages. Polly lists Mandarin `cmn-CN`, stock voice `Zhiyu`, neural and standard engines, but not a Mandarin generative engine. The current stock list has one Mandarin voice; the first AWS-only release should honestly use a narrator for all roles.

The inspected `bherila/genai-laravel` Bedrock implementation calls Converse and extracts text/tool calls, using a Bedrock bearer token. It is not a Polly client or a general binary audio synthesis adapter. Use direct AWS SDK for PHP for Polly. Keep genai-laravel for future text-authoring/review features where it fits, not as a forced audio abstraction.

No suitable Bedrock-native general SFX model was verified for this plan. Render the four small cues procedurally; do not claim a text response or generated Python/PHP recipe is an audio model's output. Future verified providers can implement the speech/SFX interfaces without changing the UI.

References:
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
- https://docs.aws.amazon.com/polly/latest/dg/available-voices.html
- https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html
- https://github.com/bherila/genai-laravel/blob/main/src/Clients/BedrockClient.php
- https://laravel.com/docs/13.x/filesystem
