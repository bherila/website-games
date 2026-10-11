# Mandarin skill and card contract (issue #100)

Design for [#100](https://github.com/bherila/website-games/issues/100), part of
[#95](https://github.com/bherila/website-games/issues/95). It says what each activity measures,
what a scheduled card is, and which evidence may move which card. Nothing here is built yet.
The event changes it needs are in `mandarin-event-schema-v2.md` (#101). Code references are to
`main` at `5e6a72e`.

Read with `mandarin-scheduler-audit.md` (card identity today, section 2) and
`mandarin-pedagogy-digest.md` (decisions 2–4 and 10–11).

## Terms

| Term | Meaning |
|---|---|
| **Knowledge unit (KU)** | A piece of course content a learner can know: a target word or phrase, a whole utterance, or, later, a pattern or tone pair. Identified by `kind:id`, using existing course ids |
| **Skill** | What the learner does with a KU, named by cue → response. One of the fixed list below |
| **Card** | One FSRS schedule. Key: `<kuKind>:<kuId>#<skill>`, for example `target:hello#listen.meaning` |
| **Activity** | A surface exercise format (three-option choice, tile ordering, say-then-check). Several activities can supply evidence for one card; an activity never gets its own card |
| **Evidence** | A graded first response that may move exactly one card |

## Skills

| Skill | Cue → response | Graded by | Carded | Status |
|---|---|---|---|---|
| `listen.meaning` | Mandarin audio → English meaning | Server, against the course answer | Yes | Every carded exercise today |
| `listen.tone` | Audio of a syllable or word → tone category | Server, against the course answer | Not during the #96 pilot | #96 |
| `form.recall` | English meaning in a situation → Mandarin, said aloud | Learner self-check after hearing the model | Yes | First retrieval loop, below |
| `form.reconstruct` | Meaning plus shuffled tiles → ordered tiles | Server | No: supported practice | Tile exercises today (5) |
| `speak.imitate` | Model audio → learner repeats, records, replays | Nothing (record and compare only) | Never | #97 |
| `write.pinyin` | Audio or meaning → typed pinyin | Server | Yes, opt-in only | Optional literacy branch, not scheduled for build |

Rules for the list:

1. A skill is added only with a written cue → response and a grading rule. Exercise formats are
   not skills.
2. `speak.imitate` never produces a grade and never moves any card (digest decision 3). The
   #97 pitch display is not a grader.
3. Typing is never required. `write.pinyin` is opt-in, and its cards appear only for learners
   who opt in, so keyboard skill never stands between a learner and speaking practice.
4. `form.reconstruct` is not carded because the tiles supply the words. It is the supported
   step before `form.recall`.

## Knowledge units

| Kind | Id source | Used by | Status |
|---|---|---|---|
| `target` | `targets[].id` (50) | `listen.meaning`, `write.pinyin` | Exists |
| `utterance` | `utterances[].id` (100) | `form.recall`, `form.reconstruct`, `speak.imitate` | Exists as content; not yet a KU |
| `pattern` | new `patterns[]` in the course | `form.recall`, a pattern-aware `listen.meaning` | Needs a course schema change; with #99 and #102 |
| `tonepair` | `<tone>-<tone>`, for example `3-4` | `listen.tone` | Decided by the #96 pilot |

A whole utterance is the first formulation unit because the five tile exercises already name
one (`constructionExercises[].sourceUtteranceId`), so no new Chinese is needed. An abstract
pattern such as 太…了 needs several example sentences and native review (#57), so `pattern`
waits for content work.

## Card identity

- **Key.** `cardKey = kuKind + ':' + kuId + '#' + skill`. The server derives it from course content
  and the exercise; the client never sends a card key, the same way it never sends a grade today.
- **Legacy mapping.** Every existing graded row has a `target_id` and is an `audio_choice` answer,
  so it maps to `target:<target_id>#listen.meaning`. This is a one-to-one renaming: replaying the log
  under card keys must give the same due times as replaying it under target ids. That equivalence
  is a test, and with it the scheduler version does not change.
- **Content versions.** A card continues across content versions while its KU id and skill stay
  the same, as cards do today. Retiring or re-meaning a KU id needs a new id.
- **No cross-skill credit.** Evidence for one skill never moves another skill's card, even for the
  same KU. A correct `form.recall` is strong evidence of `listen.meaning`, but crediting it would
  merge the two meanings of mastery that #100 asks to keep apart. Revisit only with data from #103.

## Evidence rules

Each rule becomes a test in the implementation PR.

1. **One activity, one card.** An exercise declares its KU and skill; its graded response can move
   only that card.
2. **First response per opportunity.** Only the first answer in an `opportunityId` is evidence. A
   retry after feedback is recorded with its correctness but never graded for scheduling (v2
   `attemptIndex`).
3. **One result per card per window.** The 10-minute window (`mandarin.events.schedule_window_minutes`)
   is keyed by card, not target. Today two exercises for one target in one node collapse to one
   result; after this change a `listen.meaning` and a `form.recall` answer for related KUs in the
   same session are two results, because they are two cards.
4. **Modes.** `lesson` and `review` responses are schedule-eligible. `extra_practice`, `checkpoint`
   and `preview` responses are recorded and never move a card (unchanged; checkpoint policy
   `updateComponentSchedules: false`).
5. **Teaching exposure, help reveals, imitation and tile ordering are never evidence** for a
   carded skill.
6. **Assistance lowers the grade; it does not hide the answer.** Per skill:

| Skill | Again | Hard | Good |
|---|---|---|---|
| `listen.meaning` | wrong; `dont_know`; correct after revealing transcript, meaning or pinyin | correct after a voluntary replay or any slow play | correct, one normal play, no help |
| `listen.tone` | wrong; `dont_know` | correct after a replay | correct, one play |
| `form.recall` | learner rates "missed", or asks for the answer without trying | learner rates "partly" | learner rates "said it" |
| `write.pinyin` | wrong syllables; `dont_know` | right syllables, wrong tone marks | exact, tones included |

`Easy` is never produced (digest decision 4; audit recommendation 4).

**Why a correct answer after revealing text stays `Again`.** The learner could not get the meaning
from the audio, which is what `listen.meaning` measures, and `Again` brings the card back the next
day. The audit's concern was the metric: these rows inflate lapse counts. The fix is in reporting,
which already separates them (`mandarin:report:baseline`, `targetsIncorrectAfterGood`), and in v2,
which stops counting a retry after feedback as text help.

**Self-checked recall.** `form.recall` has no automatic grader: the course has no speech
recogniser, and #97 is explicitly not one. The learner commits by tapping "Show answer" after
trying, hears the model, then rates themselves. Self-rating is the normal practice for
production flashcards, but it is unverified evidence, so:

- the event records `selfRating` as the learner's claim, and the server maps it to a grade;
- #103 measures calibration by comparing self-rated `Good` with that learner's later listening
  and recall results before self-rated cards are allowed to reach long intervals;
- a "said it" rating submitted before the model has finished playing once is graded `Hard`,
  because the learner cannot have compared their answer with it. This uses the existing
  `audioEvidence` counts, so no timing field is collected; if the model audio fails, the response
  is unscored, as a listening answer without completed audio is today.

## The first retrieval loop

The #100 cycle, mapped onto existing material. Everything here uses content that already exists
or is a re-arrangement of it (no new Chinese text), so it does not wait for native review (#57)
or Gate C (#58).

| Stage (#100) | Activity | Skill | Carded | Exists? |
|---|---|---|---|---|
| Worked example | Node teaching: audio, transcript, gloss, grammar note | — | — | Yes |
| Support-assisted attempt | Tile ordering of the utterance | `form.reconstruct` | No | Yes, 5 utterances |
| Retrieval with less support | English meaning and scene cue → "Say it in Mandarin" → Show answer | `form.recall` | Yes | New activity |
| Explanatory feedback | Model audio, transcript and the tile exercise's explanation; replay allowed | — | — | Reuses content |
| Delayed retrieval | The `form.recall` card comes due in scheduled review | `form.recall` | Yes | New |
| Application in a new context | A new sentence built from known parts | `form.recall` on a new KU | Yes | **Deferred**: needs new, reviewed Chinese |

**Scope of the first loop:** the five utterances that have tile exercises (`g01`–`g05`:
他是我的朋友。他在这里吗？好，我在这里等你。请再说一遍。我们一起走吧。). That gives five
`utterance:<id>#form.recall` cards. Five is enough to test the loop end to end and small enough
that self-rating calibration (#103) can be read per item.

**Flow.**

1. In the lesson, after the tile exercise, the same node offers "Now say it": the English meaning
   and the speaker's situation, no Chinese text, no audio.
2. The learner says it aloud (no microphone needed), then taps "Show answer". "I don't know" is
   offered alongside it.
3. The model plays once, with transcript, pinyin and the explanation. Replay is allowed.
4. The learner rates: "Said it", "Partly", "Missed". One event, mode `lesson`, creates the card.
5. Scheduled review then mixes `listen.meaning` and `form.recall` cards by due time. Learners who
   already finished the node meet the new cards there, at most two new cards per session, after
   due cards.

**Not in this loop:** microphone recording (#97), typed answers, patterns, new sentences.

## Course content changes

Today an exercise names at most one `primaryTargetId`, and the skill is implicit. The contract
needs an explicit declaration, added so that existing content needs no edit:

- `audio_choice` with `primaryTargetId` → `target:<primaryTargetId>#listen.meaning` (derived).
- `chunk_order` → `utterance:<sourceUtteranceId>#form.reconstruct` (derived, not carded).
- New exercise kinds declare `assesses: { kind, id, skill }` explicitly. The first is
  `say_check`, with `sourceUtteranceId`, `cueEn`, `situation` and `explanation`.

**Deploy order constraint.** The live client parses the served course with the strict schema
(`adapters/HttpMandarinGateway.ts:74`, `domain/courseSchema.ts`). A course that contains a new
exercise kind or field fails to parse in an older cached bundle. So a content version that adds
`say_check` is imported and activated only after a client that understands it has been live for
a release, and the course `schemaVersion` moves to 2 with that content. The course schema version
is separate from the event schema version; the two never share a number on purpose.

## Code sites that change

The six per-target sites from the audit (section 2), with what each becomes.

| # | Site today | Becomes |
|---|---|---|
| 1 | `primaryTargetId` per choice exercise; `onePrimaryTargetPerReview` | Derived `assesses` as above; `onePrimaryTargetPerReview` reads as one card per exercise |
| 2 | Server grading takes the target from the exercise (`PracticeEventService.php:226`); window keyed by target (`:125-135`) | `CardResolver` returns `{ cardKey, skill }` for an exercise; grading dispatches by skill; window keyed by `card_key` |
| 3 | `target_id` column and `(user_id, target_id, schedule_eligible)` index | Add `card_key` (backfilled `target:<target_id>#listen.meaning` for graded rows) and a `(user_id, card_key, schedule_eligible)` index. Keep `target_id` for listening rows and reports |
| 4 | Projection filters on `course_id` only (`ProgressProjector.php:22`) | Unchanged |
| 5 | `GradedReview.targetId`, `Map` keyed by target, `dueTargetIds` (`scheduler.ts`, `contracts/mandarin.ts:60`) | Keyed by `cardKey`. The projection's `reviews[]` gains `cardKey`; `dueTargetIds` stays as the `listen.meaning` subset for one release, then goes |
| 6 | `ReviewItem.targetId`, `exercisesForTarget`, taught filter, extra-practice dedupe (`reviewSession.ts`, `course.ts:76-79`) | `ReviewItem.cardKey`; `exercisesForCard`; a card is taught when its KU's node is complete; dedupe by card |

## Tests the implementation must carry

- Replaying the production-shaped fixture log keyed by card gives the same due times as keyed by
  target (legacy mapping equivalence).
- A `form.recall` result never changes any `listen.meaning` card, and the reverse.
- A retry after feedback is never schedule-eligible; the first response in the opportunity is.
- `speak.imitate` and `form.reconstruct` events never produce a grade.
- The window collapses two results for one card and keeps two results for two cards.
- A "said it" rating before one completed model play is graded `Hard`; with failed model audio it
  is unscored.
- A client given a course it cannot parse asks the learner to reload for an update, rather than
  showing a generic load error. Today `bootstrap()` simply throws (`HttpMandarinGateway.ts:74`),
  so this path is new, and it ships in the client release before any course schema 2 content.

## Decisions to confirm

1. **Self-rating as evidence for `form.recall`**, with the heard-the-model guard and #103
   calibration above. The alternative, no `form.recall` card until a grader exists, leaves formulation
   unscheduled indefinitely.
2. **First loop on the five tile utterances**, not on single targets. Single-word recall
   ("say *friend*") is easier to build but is not the sentence-level skill #100 is after.
3. **At most two new `form.recall` cards per review session** for learners past the node.
4. **No cross-skill credit**, revisited only with #103 data.
