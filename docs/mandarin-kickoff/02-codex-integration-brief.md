# Codex brief — finish Mandarin Quest after Claude's GUI pass

## Deliverable and starting point

Complete the Mandarin game that Claude has already scaffolded in `bherila/website-games`. Preserve the approved UI, scene composition, Three.js geometry and interaction design. Your responsibilities are final image assets, real media generation/delivery, course import, account persistence, deterministic spaced review, integration tests and a playable end-to-end alpha.

Read current `AGENTS.md`, `docs/games/mandarin-phase1-handoff.md`, the shared contract, the existing renderer and gateway, and the supplied JSON/schema before editing. Work on top of the checked-out GUI implementation; do not restart from an empty app, reset to an old planning commit, or perform unrelated dependency upgrades. If phase-one behavior violates an accessibility or learning invariant, make a narrow repair and document it.

Local/test database migrations and importing the supplied original curriculum are authorized. Do not migrate, seed, deploy or mutate a production database, change AWS permissions, merge the PR, or publish app changes without authorization. Never overwrite `.env` or copy production credentials into files. Use only properly supplied credentials and approved network access. Finish all non-secret-dependent work even if actual speech generation is blocked; report the remaining blocker honestly.

## 1. Correct AWS service selection

The requested architecture is AWS-based with lazy audio generation, but **Bedrock access is not proof of a Mandarin audio endpoint**. As of the documentation checked for this brief, Nova 2 Sonic's language list does not include Mandarin. No appropriate Bedrock-native general SFX model was verified. Do not send a Chinese script to a text model and call its response audio. Do not select a model solely because its provider also sells a speech product elsewhere.

Implement Mandarin speech using the **AWS SDK for PHP, `Aws\Polly\PollyClient`**, behind an application-local `SpeechSynthesizer` interface. Polly is a different AWS service, not a Bedrock API operation. Verify the configured region and capabilities with `DescribeVoices` and a small explicit synthesis smoke test.

Initial provider configuration:

```
provider: polly
engine: neural
voice: Zhiyu
language: cmn-CN
output: mp3
sample rate: 24000
normal rate: 100%
slow rate: 85%
```

These identify the documented Mandarin neural option, not a benchmark winner. The stock voice list has one Mandarin voice. Map all dialogue roles to this narrator for the first AWS-only alpha. Keep portraits, names and role IDs, but do not claim distinct speaker voices or perform unseen-speaker evaluations. Never manufacture a second voice by pitch-shifting Mandarin or silently substituting Cantonese. A future provider can supply distinct verified Mandarin voices through the same interface.

`bherila/genai-laravel` currently exposes Bedrock Converse text/tool behavior and uses a Bedrock bearer token. That is not a ready-made binary speech client. Do not add a fake `generateAudio()` call, pass a Bedrock token to Polly, or modify the shared package merely to complete this game. Use genai-laravel later for text authoring/review only when that feature is actually needed. This fixed first course does not need a runtime LLM.

A direct Bedrock speech adapter is an extension point, not an alpha requirement. Only add one with verified official model ID, supported Mandarin output, invocation transport, auth and a real exact-script audio test. Do not spend the phase chasing undocumented endpoints.

## 2. Image generation and visual integration

Use the available Codex image-generation plugin/tool to create the **eight required** assets in `visual-assets.v1.json`: five scene posters and three portraits. The optional paper texture is not a completion blocker. Discover and read that tool's actual instructions; do not assume a particular CLI command exists. Generate assets at authoring time, not at player runtime.

Start with one scene/portrait style pair, inspect it in the actual UI, then keep subsequent assets consistent. Use the manifest's palette, fictional setting, dimensions, negative constraints and safe areas. No actor likenesses, commercial-show imagery, lettering or lesson text. UI text remains DOM. These images do not replace the existing Three.js geometry or imply that the tool can generate a rigged model.

Process outputs into efficient browser images, preserving alpha where needed. Keep masters only where repository policy permits; ship optimized WebP/PNG variants. Check crop behavior at 360px and desktop sizes, missing-image fallbacks and portrait silhouette edges. Keep asset IDs stable. Record actual paths, dimensions, hashes, source tool/model when known and generation status. Do not mark tasks complete just because a prompt file exists. If the tool is unavailable, keep Claude's real fallback images and report that final art is not generated.

## 3. Database-backed original curriculum

Import `mandarin-foundations.v1.json` with an idempotent Artisan command. The pack contains 5 scenes, 10 nodes, 30 primary targets, 18 support entries, 50 scripted utterances, 50 training choices, 5 construction exercises and 10 checkpoint questions. It contains text, not prerecorded audio.

Store a validated immutable course revision, its canonical content hash and publication status. A small `mandarin_course_revisions` table with the validated JSON payload is sufficient. A `CourseRepository` can index targets/utterances/exercises in memory per revision; do not make dozens of glossary tables just to seed the alpha. Add normalized tables only when they solve an actual query/integrity need.

Same course/version + same canonical payload: no-op. Same course/version + different payload: fail with a clear conflict; require a new revision. Never destroy progress or audio when reseeding. Keep previous revisions available to validate previously accepted events. Preview JSON and live imported JSON must not drift.

Validate the supplied JSON Schema plus semantic references, option uniqueness, primary-target prerequisites, node ordering, construction solutions and absence of exact checkpoint sentences from training. Preserve the `nativeReviewed=false` and `audioAuditioned=false` provenance until actual review occurs. The supplied validation script verifies structure, not language quality. Correct demonstrable language defects with a revision and an explanation, not silent live data mutation.

All assessment answers come from the authored course. Do not ask an LLM to grade a three-option question or invent dialogue during play. Serve learner-appropriate course data; keeping answer keys server-side is fine, but this personal learning game is not an anti-cheat product. Never leak the correct answer in the visual/accessible label layer.

## 4. Lazy generation architecture

Separate four concerns:

- `SpeechSynthesizer`: verified provider request -> bounded binary speech stream and metadata.
- `SfxRenderer`: deterministic local recipe -> actual WAV bytes and metadata.
- `AudioAssetService`: recipe identity, database state, deduplication, queue/lease, storage and recovery.
- `AudioDeliveryService`: ready object -> playback URL/response; no provider calls.

All generation is server-side. Use one configurable Laravel filesystem disk for **new** audio objects (`MANDARIN_MEDIA_DISK`, initially `local`, later `s3`). Store `disk` and `object_key` with each ready object. Never embed a local absolute path in the course JSON or assume that `Storage::path()` works on S3. Return a URL to the UI, not filesystem paths or base64 embedded in API JSON.

The media cache is shared for this original published course, not per-user: all learners can reuse the same line/voice/variant. Progress remains private. Never place future user recordings or private free-form text in this shared namespace.

### Resolve flow

1. Client requests a published course/source ID and normal/slow variant via authenticated POST. It cannot choose arbitrary text, SSML, provider, voice, model, region, URLs or paths.
2. Server resolves the source from the immutable course and the role's configured voice mapping. Reject invalid IDs/variants before any paid request.
3. Construct a canonical synthesis recipe and hash it. Check for a ready verified object on its recorded disk. Cache hits still work with generation disabled and without valid synthesis-provider credentials, provided the recorded storage disk remains accessible. S3 delivery still needs valid storage authorization.
4. For a miss, atomically create/claim one logical request row and dispatch a queue job after commit. Return a queued/generating state with a request ID and polling guidance, normally HTTP 202. No long provider call inside the browser request.
5. Worker checks the row/lease and object again, reserves bounded generation budget, invokes the provider or procedural renderer, validates the binary, durably stores it and only then publishes ready metadata.
6. UI polls with bounded backoff, cancels on navigation, and uses the managed player once ready. A missing/failed clip never becomes a wrong language answer. Preserve the scene and offer retry or explicitly unscored text-assisted practice.

Use the shared response types. Implement both HTTP adapter and corresponding mock contract tests. GET bootstrap, polling, media GET and HEAD must be read-only; a crawler, prefetch or image tag must not trigger paid generation. A guest can play already-ready public lesson assets but must sign in to cause a miss to generate. A small operator prewarm of the first node avoids an empty first-run guest experience.

### Recipe identity and invalidation

Hash the exact normalized source text/SSML plus the **resolved** provider, engine/model, voice, language, region or endpoint policy where relevant, rate, output format/sample rate, pronunciation-override version, postprocessing version and synthesis-template version. Preserve meaningful Chinese punctuation; normalize Unicode consistently and test it. Do not hash just the utterance ID or just the Chinese string.

Do not include signed URLs, credentials, timestamps or user IDs. Avoid invalidating all audio because a course's English translation or unrelated question changed. Deduplicate identical effective voice recipes even if story role IDs differ. Store source references separately from the recipe. Final object identity includes the actual byte hash so an old URL never silently changes its speech.

Changing a voice/rate/pronunciation recipe creates a new asset identity. Old ready files remain available to existing references until deliberately retired. S3 ETags are not guaranteed content SHA-256 values; compute/store your own hash.

### Concurrency and failure recovery

Use a unique database constraint on recipe hash plus an atomic claim/lease or compare-and-swap transition. A cache lock can help, but a filesystem `exists()` check alone is not concurrency control. Production multi-worker/multi-host claims must share the database/cache, not isolated per-container file locks.

Do not hold a database transaction open during a provider network call. Claims must expire recoverably. Use an attempt/lease token (fencing) so an old timed-out worker cannot publish over a newer attempt. Align job timeout, queue retry_after/visibility timeout and lease length; document and test the relationship. Check current state after acquiring the lease and before publishing.

A job dispatch failure or worker crash must not strand queued/generating forever. Provide a bounded recovery command/job for expired claims and document the operational trigger. An outbox or a recoverable “pending dispatch” state is acceptable. Never use a polling GET as a hidden dispatch loop.

Validate into a local temporary stream/file, upload/write the complete final content-hashed object, then commit ready metadata conditional on the current lease token. S3 has no filesystem-style atomic rename assumption. A crash after object upload but before publication may leave an orphan; a crash before upload cannot publish ready. Garbage collection must be conservative and never delete an object still referenced by a ready row or active attempt.

Deduplication prevents normal simultaneous misses from multiplying requests. It cannot promise exactly-once provider billing after an ambiguous timeout. Count/reserve all attempted calls, bound retries and surface uncertain failures rather than retrying indefinitely. Local CPU-only SFX attempts should not consume the paid-speech budget.

Test stale workers, duplicate job delivery, many simultaneous identical requests, storage write failure, provider timeout, expired lease, invalid audio, missing ready object, budget exhaustion and retry exhaustion. Do not claim a database fake alone proves S3 behavior.

## 5. Polly adapter, credentials and audio validation

Use the AWS SDK default credential provider chain: a configured local AWS profile/SSO when supported by the installed SDK, environment temporary credentials, workload identity or instance/task role. Do not manually sign SigV4 when the SDK already does it. A Bedrock bearer token is not an AWS access-key ID/secret and cannot authenticate Polly or S3.

Required service permissions should be documented narrowly: Polly voice discovery and synthesis; storage read/write only for the media prefix when S3 is used; any required KMS permissions only for the configured encrypted bucket. Do not grant broad administrator access or rewrite the user's IAM setup. Never log credentials, raw signed URLs or token-bearing request dumps. Provider region and bucket region may differ; configure them separately.

Use `SynthesizeSpeech` with explicit `Engine=neural`, `VoiceId=Zhiyu`, `LanguageCode=cmn-CN`, MP3 output and 24000 sample rate, after region/capability verification. Normal input can be plain text; slower input can use a valid escaped SSML wrapper such as `<speak><prosody rate="85%">…</prosody></speak>`. Neural prosody has limitations; do not request unsupported pitch/emphasis/timbre tags. Read Chinese only, not the pinyin, English, role label or instructions. Generate complete sentences rather than concatenated syllables.

Treat the supplied speechText as authored data, not executable SSML. Support an explicit audited pronunciation-override mechanism later if needed; no arbitrary client SSML. Do not apply blanket pinyin rewriting to “fix” tones.

Bound text length, response bytes, timeouts and total attempts; honor provider throttling/backoff. Fail clearly on unsupported language/voice/engine and credentials. Validate nonempty decodable audio, reported versus actual content type, plausible duration and non-silent signal. Use a documented `ffprobe`/`ffmpeg` deployment prerequisite or an equivalent reliable decoder; do not inspect only the `.mp3` extension. Avoid text/error bodies published as audio. Record requested and returned metadata, content SHA-256, bytes, duration, generation/review status and actual billed/request characters when available.

Provide a protected QA page/command to play each line beside Chinese, pinyin and English, including normal/slow. Automated validation and ASR are only smoke tests; neither establishes correct tones. The owner can try an AI-drafted personal alpha without a native reviewer, but no native-reviewed label should appear. Do not silently auto-approve everything after a successful HTTP response.

## 6. SFX: small procedural files, same storage service

Render the four cues defined in the pack: quiet tap, soft correct-answer chime, neutral help cue and short scene-complete resolution. Use fixed, versioned recipes, bounded amplitude and short attack/release envelopes. Seed any noise deterministically. Write a real standard PCM WAV file with a valid header; WAV is acceptable for these tiny clips, so ffmpeg transcoding is optional for SFX.

Render/cache these lazily through the same asset service with provider identity `procedural` and a recipe/version/seed hash. They need no paid model and no AWS credentials. Match any Claude preview recipes where practical. No harsh failure buzzers, long fanfares or sound masking Mandarin. Give SFX a separate mute/volume control and stop/duck them under speech. Environmental ambience and generated music are out of scope.

An LLM may help a developer author a recipe, but never label that as Bedrock-generated audio. Do not execute arbitrary model-generated code or accept user-authored synthesis recipes at runtime.

## 7. Storage and delivery: local now, S3 later

Use `Storage::disk($configuredDisk)` and preserve the selected disk in asset metadata. Choose a persistent local root outside disposable release directories. In production, web and worker processes need the same local volume; multiple hosts need genuinely shared storage (typically S3). Document that local storage plus separate container filesystems is not a shared cache.

Use private disks/buckets with controlled delivery, or deliberately publish only the original curriculum bytes. Either is acceptable, but explicitly test the policy. For local files use a controlled media route or supported temporary URL; for S3 use controlled proxy delivery or expiring signed object URLs. Test actual browser playback, content type, seek/Range behavior, CORS where applicable, URL expiry and re-resolution. Never require a public ACL on an entire S3 bucket.

Keep private API/status/account responses `no-store` and outside service-worker caches. Public immutable curriculum audio can have a content-addressed caching policy, but do not cache signed URLs as durable identifiers or serve another user's private data from a cached shell. Do not expand the existing PWA policy indiscriminately to all `/api` requests. Full offline lesson-download management is not required for this alpha.

Changing `.env` selects the destination for **new** assets; it does not migrate existing files. Existing rows retain their original disk and stay readable when that disk is still accessible. Provide `mandarin:audio:migrate --to=s3 --dry-run` and an explicit execute mode: copy, verify actual content hash/length, conditionally update metadata, keep source objects by default. Make the command idempotent and resumable. Missing or corrupt files need repair through bounded resolution, not a forever-ready row.

## 8. Account progress and review scheduling

Implement an append-only practice-event store with a unique (user, client event UUID), immutable payload, canonical per-user sequence and server acceptance time. Use the existing session/authentication and immutable account identity. Validate course/exercise/option IDs against the referenced published revision, bound batches and compute correctness server-side. Client account IDs, mastery flags, correct flags and serialized schedules are not authoritative.

An `opportunityId` ties prompt presentation, help and retries together. Persist the full hint/replay snapshot with the first response; UI retry must not reset it. Immediate retries after feedback are remediation. A user can report evidence incorrectly; this is a learning tool, not biometric proof that sound reached their ears.

Persist the local outbox before network transmission. Accept a repeated identical event as already-present; a reused UUID with a different payload is a conflict. Return individual acknowledgments and the canonical cursor. Never lose an accepted answer on refresh, reconnect or a retry. Partition by account; logout/auth expiry stops uploading. Guest import is explicit. Preview-generated events cannot be imported as genuine assessed learning. Test two users and two browser contexts.

Use a pinned `ts-fsrs` behind a pure deterministic adapter for listening targets. The backend owns the canonical event log and grades; a replayable TS projection owns scheduling. No competing PHP implementation of FSRS is required. Persist scheduler version/config hash; disable fuzz or make randomness stable. Desired retention can start at 0.90; do not present it as a measured TV-comprehension percentage.

Initial grading policy for a eligible scheduled opportunity:

- Wrong, I don't know, or text/pinyin/meaning help before the answer: Again.
- Correct after normal replay or slower audio without text help: Hard.
- Correct on the first completed normal presentation without help: Good.
- Do not automatically award Easy.

No audio/failed audio/simulated audio -> unscored. Matching, construction, extra practice and checkpoint scores do not advance listening schedules. Credit one explicitly identified target, not every word in a sentence. First teaching/review of a target initializes its card; content teaching alone does not create a successful review.

Prevent rapid repeated practice from promoting the same card: at most one schedule-changing result per target in a ten-minute canonical window. Keep other attempts as practice. Set effective next due to the later of the FSRS result and the window boundary so a short learning step cannot create an immediately overdue loop. Test this product policy. Review defaults to a bounded session; when none are due, show extra practice rather than manufacturing due cards.

Retain permanent story unlocks independently of memory estimates. Preserve the current scene/node across devices. Use the generic game-save merger only for appropriate settings/unlocks, not the review-event list. Large histories must page or have a tested explicit bound without silently dropping events. Derived snapshots are rebuildable; version changes invalidate/rebuild them.

The checkpoint uses ten new combinations, not new voices. Playback/revealed answers count as exposure; merely generating/downloading the file does not. The first opportunity can be marked fresh; subsequent attempts are repeat practice. A same-day check is not delayed retention. Record assistance, first presentation versus replay and time since relevant teaching. Do not increase component cards from checkpoint answers.

## 9. Commands, diagnostics and configuration

Provide discoverable commands along these lines (adapt names to current project conventions and document exact implemented commands):

```
php -d memory_limit=1G artisan mandarin:course:import resources/data/mandarin/foundations.v1.json
php -d memory_limit=1G artisan mandarin:validate
php -d memory_limit=1G artisan mandarin:audio:doctor
php -d memory_limit=1G artisan mandarin:audio:warm --node=s1n1 --variant=normal --dry-run
php -d memory_limit=1G artisan mandarin:audio:warm --node=s1n1 --variant=normal --execute
php -d memory_limit=1G artisan mandarin:audio:recover --dry-run
php -d memory_limit=1G artisan mandarin:audio:migrate --to=s3 --dry-run
```

The doctor distinguishes missing credentials, unsupported voice/region, queue unavailable, storage unavailable, and generation disabled. Voice discovery is not proof synthesis works; an explicit paid smoke-test option can generate one curated line. Never print credentials. A warm command uses the same resolver/deduplication path as lazy playback, not a second implementation. Dry-run makes no provider calls. Execute output distinguishes enqueued from actually ready files. Prewarming the first node is an optional UX optimization; it does not replace lazy generation for later content.

Use the supplied `mandarin.env.example` as design input, not a file to overwrite the user's configuration. Default paid generation disabled until explicitly enabled. Apply global and account rate limits and reserve bounded daily character/request budgets atomically across workers. The example volume caps are not a guaranteed dollar budget. Count retries. A cache hit must not use a generation budget slot. Avoid expensive retry multiplication between SDK and queue layers; document the total possible attempts.

No paid generation in ordinary CI or untrusted PR code. Configure the queue worker for the dedicated queue, persistent storage, capability checks and scheduled recovery in deployment notes. Do not hide worker requirements behind “it should just work.” Do not require Redis to try the single-host alpha if database-backed queue/claims meet the guarantees.

## 10. Verification and acceptance

Add unit/contract tests for course validation, immutable import, mock/HTTP response parity, allowlisted source resolution, recipe hashes and invalidation, normal/slow separation, two roles sharing one actual voice, duplicate generation, stale workers, storage failures and recovery. Provider fixtures are binary fixtures, not dummy text saved as MP3. CI uses fakes/fixtures with no network charges.

Backend tests: ownership, guest cold-generation rejection, private-event isolation, duplicate/conflicting event IDs, option tampering, bounds, per-target scheduling eligibility, canonical ordering, expired login and two-account outbox separation. Storage fakes are useful unit tests; add a configured S3-compatible integration test or clearly report that S3 end-to-end was not executed.

Browser tests must cover actual real-audio decoding/playback on a completed cache-miss path, a cache-hit replay after provider calls are disabled, delayed audio and error recovery, refresh persistence, wrong answer + help + retry, all five scenes, checkpoint exposure rules, two-browser cloud resume, mobile WebKit, desktop and 2D fallback. Verify that a slower clip does not count as unaided normal-speed understanding. Observe actual UI, not just API tests.

Run all current repository-required gates including sensitive-data scanning, Vite build before PHP view tests, and appropriate PWA/Three.js regressions. Add new CI jobs to the aggregate gate if needed. Capture screenshots and list actual tests/results. Never claim S3, native review, image generation or a live Polly call was tested without doing it.

**Completion means:** an English-speaking beginner can open `/mandarin`, learn the supplied material, encounter real Mandarin speech, finish five scenes, take an honestly labeled listening check, and resume on another device; audio generates once per effective recipe under ordinary concurrent misses, persists locally/S3 as configured, and cache hits do not need AWS synthesis. The approved GUI survives integration.

Final report: branch/head, route, imported revision and counts, actual generated-image count, ready/missing audio counts, narrator/engine/region, filesystem disk, tested queue path, checks run/results, credential or service blockers, and known review limitations. State separately “GUI complete,” “live speech verified,” “persistence verified,” “S3 verified,” and “native-reviewed.” Do not merge or deploy production without authorization.

## Primary references to verify while implementing

- Polly voice/engine support: https://docs.aws.amazon.com/polly/latest/dg/available-voices.html
- Polly SynthesizeSpeech: https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html
- Polly SSML/prosody: https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html
- PHP SDK credentials: https://docs.aws.amazon.com/sdk-for-php/v3/developer-guide/guide_credentials_default_chain.html
- Bedrock key scope: https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html
- Nova 2 Sonic languages: https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
- Laravel filesystems: https://laravel.com/docs/13.x/filesystem
- Laravel queues: https://laravel.com/docs/13.x/queues
- Laravel atomic locks: https://laravel.com/docs/13.x/cache#atomic-locks
- TS-FSRS: https://open-spaced-repetition.github.io/ts-fsrs/
- Existing package source: https://github.com/bherila/genai-laravel/blob/main/src/Clients/BedrockClient.php
