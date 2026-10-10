# Mandarin scheduler audit (issue #101)

Code audit of grading, scheduling, workload and the practice-event contract, done before any
change to mechanics. Baseline: `main` at `6b707d9`. Read alongside `mandarin.md` (baseline
report) and `mandarin-phase2-live.md` (grading policy as shipped). Interval figures below come
from running the pinned `ts-fsrs@5.4.2` with the production parameters (retention 0.90, fuzz
off, defaults otherwise: short-term on, learning steps `1m,10m`, relearning `10m`), with each
review taken at its effective due time.

## Summary

| Area | Finding | Severity |
|---|---|---|
| Continuation | "Another session" replays the same ten items; the backlog is never reached | bug |
| Projection | `refreshProjection` has no caller, so the due list is stale until reload | bug |
| Hard | `Hard` on a learning card never graduates: due every 10 minutes indefinitely | high |
| Help | Correct with text/pinyin help is graded `Again` and counts as an FSRS lapse | medium |
| Good / Easy | `Good` grows intervals normally; `Easy` is never produced | confirmed |
| Card identity | One FSRS card per `target_id`, across content versions and skills | design limit |
| Leeches, limits | No leech handling, no daily cap, no learner-adjustable limit | absent |
| Time basis | FSRS and the window run on `accepted_at`; `client_occurred_at` is stored, unused | known |
| Outbox | Rejected events are kept and resent forever, so a v1 drop would strand them | migration risk |

## 1. Grading

`PracticeEventService::grade()` (`app/Services/Games/Mandarin/Progress/PracticeEventService.php:208-253`)
is the only place grades come from. The client never sends one (a client-sent `grade: 'Easy'` is
ignored: `tests/Feature/Mandarin/PracticeEventsApiTest.php:25`).

| Signal (choice exercise, mode `lesson` or `review`) | Correctness | Grade | Line |
|---|---|---|---|
| `responseAction = skip` | unscored | — | 229 |
| audio status not `completed` (simulated, failed, skipped, not_required) | unscored | — | 232 |
| `dont_know` (audio completed) | incorrect | Again | 235 |
| wrong option | incorrect | Again | 239 |
| correct + `textHelpUsed` or `pinyinHelpUsed` | correct | **Again** | 245 |
| correct + any slow play, or more than one completed normal play | correct | Hard | 248 |
| correct, one normal play, no help | correct | Good | 252 |
| any choice response in `extra_practice`, `checkpoint`, `preview` | computed | — | 227, 242 |
| construction (`orderedTileIds`) | computed | — (no target) | 214-221 |

`Easy` is never produced: no branch returns it, and the acknowledgment type excludes it
(`resources/js/games/mandarin/contracts/mandarin.ts:54`). The scheduler still maps it
(`domain/scheduler.ts:21,39`). Checkpoint exercises carry no `primaryTargetId` (0 of 20 in
`foundations.v1.json`), so checkpoint responses never reach a card.

**What the signals measure.** `textHelpUsed` is set by transcript/meaning reveal *or by any retry
after feedback* (`domain/events.ts:57`), so "Again with help" mixes "looked at the characters"
with "second try after being shown wrong". `normalPlayCount` counts completed plays including the
autoplay (`domain/assessment.ts:146-149`), so one voluntary replay is enough for `Hard`; the
`interrupted` flag is ignored by grading.

**Do these grades predict later recall? Unknown, with specific reasons for doubt:**
- Three options means a 33% guessing floor inside `Good`.
- 16 of 50 targets have exactly one exercise, and review rotates through a target's exercises
  (`domain/reviewSession.ts:27-32`). For those targets, every review is the same clip with the
  same distractors, so `Good` can reflect memory of that item rather than of the target.
- The first graded response for a target is the lesson question asked straight after teaching
  (`mode = lesson` is schedule-eligible: `PracticeEventService.php:77`). That rating measures
  immediate recognition.
- Rotation counts opportunities from device-local progress (`domain/reviewSession.ts:30`,
  capped at 600 in `domain/progress.ts:54`), so two devices can show different items.

Query P1 below tests prediction directly. Run it before any change that stretches intervals.

**Exposure that can be double-counted:**

| Path | What happens | Effect |
|---|---|---|
| Retry within one opportunity | Each submit emits its own `response` (`ui/useAssessment.ts:33-35`) | The first sets the schedule, and later ones in the same 10 minutes are `schedule_eligible = false` but still graded rows. Analytics must use the first response per `opportunity_id` |
| Several exercises for one target in a node | Same | Collapsed by the 10-minute window (`PracticeEventService.php:125-135`) |
| "Another session" | `setIndex(0)` on a plan memoised on `[kind, seed]` (`ui/screens/ReviewScreen.tsx:25-30,107`) | The same ten targets are asked again. Past 10 minutes they are schedule-eligible again |
| Re-entering Review | A new seed, but `projection.dueTargetIds` was computed once at load (`adapters/HttpMandarinGateway.ts:128`). `refreshProjection` (`MandarinGame.tsx:192`) has no caller | Targets just reviewed are still listed as due. A second `Good` the same day barely moves the interval (11d → 12d in simulation), but a slip records a lapse |
| Extra practice | Graded rows with `grade = null` | Invisible to FSRS: real retrieval the scheduler does not know about, so the next scheduled `Good` is inflated |
| Checkpoint | No target id | Not double-counted. The baseline report separates first exposure |
| `help_revealed` | Separate kind, ungraded | Uses `answerDisclosed` (`events.ts:74`), not `isRetry` like the response does (`events.ts:57`), so the two fields disagree |

Events are emitted from inside a React state updater (`ui/useAssessment.ts:27-36`). React may
call an updater more than once (Strict Mode or rebased concurrent renders), and each call would
emit a new `clientEventId`. StrictMode is not enabled today, so this is a latent risk.

## 2. Scheduling

- FSRS runs only in the browser: `fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }))`
  (`domain/scheduler.ts:42`). The server returns the graded log, `dueTargetIds: []`
  (`ProgressProjector.php:68`), and `listeningCards.reviews`, which holds every graded row,
  including ineligible ones (`:40-47`). The client replays the whole log on every load
  (`scheduler.ts:44-58`).
- The 10-minute window works in two places. The server marks at most one schedule-eligible result
  per target per window (`PracticeEventService.php:83,125-135`; config `mandarin.events.schedule_window_minutes`).
  The client never lets a card come due before the window ends (`scheduler.ts:54-55`).
- Due order: soonest `effectiveDue` first, ties broken by target id (`scheduler.ts:65`).
- `schedulerConfigHash` is built from a PHP string literal (`ProgressProjector.php:71`). It
  covers neither the learning steps nor the weights, and the client never compares
  `schedulerVersion` with its own `SCHEDULER_VERSION` (`scheduler.ts:16`), so config drift goes
  undetected.

**`Good` grows intervals through normal FSRS.** Six consecutive `Good` ratings give
10m → 2d → 11d → 46d → 163d → 498d. The issue's correction is right.

**`Hard` on a new or learning card never graduates.** Six consecutive `Hard` ratings leave the
card in Learning with every due at the 10-minute floor; `Good, Hard, Hard…` behaves the same.
After graduation, `Hard` grows intervals (8d → 19d → 36d). A learner who habitually replays once
keeps a new target due every 10 minutes indefinitely. With `learning_steps: []`, `Hard` graduates
at once (1d → 3d → 7d → 12d). Any such change is a scheduler-config change: it replays the whole
history and must bump the scheduler version and hash.

**Help-assisted correct answers lapse.** On a card at S≈46d, `Again` from a correct answer with
text help sets `lapses = 1` and S≈2.9d. Lapse metrics, including the baseline report's "Again
after an earlier Good", count these alongside real failures.

**Card identity today is one card per `target_id`.** That assumption is built into:
1. `primaryTargetId` is a single nullable id per choice exercise (`domain/courseSchema.ts:30`) and
   always null for constructions (`:47`). `teachingPolicy.onePrimaryTargetPerReview` states it.
2. Server grading takes the target from the exercise (`PracticeEventService.php:226`), and the
   window is keyed on it (`:125-135`).
3. The `target_id` column and the `(user_id, target_id, schedule_eligible)` index
   (`database/migrations/2026_09_06_000003_create_mandarin_practice_events_table.php:30,44`).
4. The projection filters on `course_id` but not `content_version` (`ProgressProjector.php:22`),
   so a card continues across content versions as long as target ids stay stable.
5. `GradedReview.targetId` and the `Map` keyed by target (`scheduler.ts:19-58`), plus
   `dueTargetIds` in the contract (`contracts/mandarin.ts:60`).
6. Session building: `ReviewItem.targetId`, `exercisesForTarget`, the taught filter through
   `introducedInNode`, and extra-practice dedupe by target (`reviewSession.ts:27-77`;
   `domain/course.ts:76-79`).

There is no skill dimension. Today every carded exercise is audio → English meaning, so
"target" means "listening recognition of target". A production or tone exercise added under the
same target id would silently share the FSRS card. #100's `knowledgeUnitId × assessedSkill` key
has to replace all six sites.

## 3. Workload

| Control | State | Where |
|---|---|---|
| Scheduled review per session | at most 10 targets, one exercise each | `reviewSession.ts:12,46` |
| Continuation | Button shown when `backlog > 0`, but it replays the same plan | `ReviewScreen.tsx:107` |
| Sessions per day | Unlimited | — |
| New targets | Lesson-driven, at most 4 primary targets per node, no daily cap. The course has 50 targets, which bounds the worst-case due list | course `teachingPolicy` |
| Extra practice | 10 distinct targets per session, unlimited, ungraded | `reviewSession.ts:54-80` |
| Backlog | Count shown and most overdue first. Learning and review cards are not separated, so stuck `Hard` cards (due every 10 min) compete with overdue reviews | `scheduler.ts:65`, `ReviewScreen.tsx:84-86` |
| Leech handling | None. `Again×4` leaves S≈0.02 and due every 10 min indefinitely; `card.lapses` is computed but never read | — |
| Learner-adjustable limits or retention | None (`domain/settings.ts` has no review fields). Retention is hard-coded in TS and PHP | `scheduler.ts:17`, `ProgressProjector.php:71,74` |
| Copy | The live review screen still says "Scheduled by the mock due list" and "mock scheduler" | `ReviewScreen.tsx:62,104` |

## 4. Event schema v2

**Everything that pins v1:**
- TS type `schemaVersion: 1` (`contracts/mandarin.ts:40`); emitted at `domain/events.ts:18`.
- Server: `validate()` rejects anything else as `unsupported_schema` (`PracticeEventService.php:142-144`).
  `AppendPracticeEventsRequest` checks only batch shape and `clientEventId` (good: rejection stays per event).
- The idempotency hash covers the whole canonical event (`PracticeEventService.php:67`), including
  `schemaVersion` and any unknown fields, which v1 tolerates (the test above sends `correct` and `grade`).
  Re-serialising a queued event under its id is therefore a `conflict`.
- Outbox: stored verbatim under `…outbox.v1` (`adapters/previewStore.ts:12,59`). `drainOutbox` clears
  only non-rejected acks (`domain/outbox.ts:58-61`), so any rejected event (`conflict`,
  `unsupported_schema`, a retired content version) is resent on every flush, indefinitely.
- Tests: `tests/Feature/Mandarin/MandarinTestCase.php:54`, `__tests__/httpGateway.test.ts:33`,
  `__tests__/mockGateway.test.ts:22`. The mock gateway does not check `schemaVersion`.
- Separate concepts to keep apart: course `schemaVersion` (`courseSchema.ts:121`, `CourseValidator.php:41`),
  `contentVersion`, audio manifest `SCHEMA_VERSION`, outbox storage key version, and `schedulerVersion`.

**Migration order:**
1. **Server accepts v1 and v2.** Dispatch validation by version. v1 grading stays byte-for-byte
   (golden test: the existing v1 fixtures give the same `correctness`, `grade` and `schedule_eligible`).
   Add a nullable `schema_version` column, backfilled to 1. The hash stays the canonical full
   event, so v1 and v2 never collide.
2. **Advertise the capability.** Add `capabilities.practiceEventSchemas: [1, 2]` to bootstrap
   (`MandarinBootstrapController`, contract `Bootstrap.capabilities`) as an optional field. Its
   absence means `[1]`.
3. **Client emits v2** only when bootstrap advertises it. The version is fixed when an event is
   built, and the outbox never rewrites, upgrades or re-ids a queued event. Mixed v1 and v2
   entries share one outbox, and the storage key does not change.
4. **v1 stays accepted** until telemetry (P8 below) shows no v1 arrivals for a long period. No
   date is set now. Treat a rollback to a v1-only server as safe: v2 events are retained and
   retried.
5. **Outbox dead-letter** for rejections that are permanent by reason code (`conflict`,
   `invalid_*`, `unknown_*`): move them aside, count them and stop resending. Keep
   `unsupported_schema` and `sign_in_required` retryable.

v2 candidates, coordinated with #100: an explicit `assessedSkill` or card key; an `attemptIndex`
separate from text help; autoplay counted separately from voluntary replays; a session kind
(`scheduled`, `continuation`, `extra`). Do not collect latency for `Easy` yet.

**Time basis.** FSRS (`scheduler.ts:49`), the window (`PracticeEventService.php:133`) and
`sequence` order all use acceptance, not occurrence. `client_occurred_at` is a free string up to
128 characters, stored as null when unparseable (`:148-151,255-265`). Consequences: an offline
session is stamped at sync time; events for one target synced together collapse to one
schedule-eligible result even if they happened days apart; delayed-recall gaps include sync lag.
The outbox flushes on every append (`MandarinGame.tsx:170-175`), so lag is probably seconds for
most events. P8 measures it. For the 1-day and 7-day evaluation, use `client_occurred_at`
clamped to at most `accepted_at`, and report how many events needed the clamp. Keep the
scheduler on `accepted_at` until lag is shown to matter.

## 5. Questions only production data answers

Written for MySQL 8.0.21+ / MariaDB 10.6 (for SQLite, use `json_extract` and `1` for true).
All queries are read-only. **B** = covered by `mandarin:report:baseline`; **partial** = it
reports a related cut; **new** = not covered.

```sql
-- P1 (new) Does a grade predict the next eligible result on the same target, by gap?
WITH r AS (SELECT user_id, target_id, grade, accepted_at,
  LEAD(grade) OVER w AS next_grade, LEAD(accepted_at) OVER w AS next_at
  FROM mandarin_practice_events WHERE kind='response' AND schedule_eligible=1
  WINDOW w AS (PARTITION BY user_id, target_id ORDER BY sequence))
SELECT grade, CASE WHEN TIMESTAMPDIFF(HOUR,accepted_at,next_at)<24 THEN '<1d'
  WHEN TIMESTAMPDIFF(HOUR,accepted_at,next_at)<168 THEN '1-7d' ELSE '7d+' END AS gap,
  COUNT(*) n, AVG(next_grade='Good') p_next_good, AVG(next_grade='Again') p_next_again
FROM r WHERE next_at IS NOT NULL GROUP BY grade, gap ORDER BY grade, gap;

-- P2 (partial: B splits assistance, not grade x mode x eligibility) Grade distribution
SELECT mode, correctness, grade, schedule_eligible, COUNT(*) FROM mandarin_practice_events
WHERE kind='response' AND mode<>'preview' GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

-- P3 (new) Why Hard: replay only, slow, or both
SELECT JSON_VALUE(payload,'$.audioEvidence.slowPlayCount')>0 AS slow,
  JSON_VALUE(payload,'$.audioEvidence.normalPlayCount')>1 AS replay, COUNT(*)
FROM mandarin_practice_events WHERE grade='Hard' GROUP BY 1,2;

-- P4 (new) Share of Again that was a correct answer with help (false lapses)
SELECT correctness, COUNT(*) FROM mandarin_practice_events
WHERE grade='Again' AND schedule_eligible=1 GROUP BY correctness;

-- P5 (partial: B counts targets answered incorrectly after Good) Lapse rate per learner, excluding assisted-correct
SELECT user_id, SUM(grade='Again' AND correctness='incorrect') lapses_real,
  SUM(grade='Again' AND correctness='correct') lapses_assisted, COUNT(*) eligible
FROM mandarin_practice_events WHERE schedule_eligible=1 GROUP BY user_id;

-- P6 (new) Stuck learning cards: >=4 eligible results on a target, none Good
SELECT user_id, target_id, COUNT(*) n, MIN(accepted_at), MAX(accepted_at)
FROM mandarin_practice_events WHERE schedule_eligible=1
GROUP BY user_id, target_id HAVING n>=4 AND SUM(grade='Good')=0;

-- P7 (partial: B counts sessions) Review session length and repeats within a session
SELECT JSON_VALUE(payload,'$.sessionId') s, COUNT(DISTINCT opportunity_id) items,
  COUNT(DISTINCT target_id) targets, SUM(schedule_eligible=0 AND grade IS NOT NULL) blocked
FROM mandarin_practice_events WHERE kind='response' AND mode='review' GROUP BY s;

-- P8 (new) Sync lag (time basis) and v1/v2 arrivals once a version column exists
SELECT CASE WHEN client_occurred_at IS NULL THEN 'unparsed'
  WHEN client_occurred_at>accepted_at THEN 'future (clock skew)'
  WHEN TIMESTAMPDIFF(SECOND,client_occurred_at,accepted_at)<60 THEN '<1m'
  WHEN TIMESTAMPDIFF(HOUR,client_occurred_at,accepted_at)<1 THEN '<1h'
  WHEN TIMESTAMPDIFF(HOUR,client_occurred_at,accepted_at)<24 THEN '<1d' ELSE '1d+' END lag, COUNT(*)
FROM mandarin_practice_events GROUP BY lag;

-- P9 (new) Time to next eligible review by grade (realised interval vs schedule)
SELECT grade, COUNT(*), AVG(h) avg_h, MIN(h), MAX(h) FROM (
  SELECT grade, TIMESTAMPDIFF(HOUR, accepted_at, LEAD(accepted_at) OVER
    (PARTITION BY user_id, target_id ORDER BY sequence)) h
  FROM mandarin_practice_events WHERE schedule_eligible=1) t
WHERE h IS NOT NULL GROUP BY grade;

-- P10 (partial: B reports activity) Daily workload: scheduled vs extra per learner-day
SELECT user_id, DATE(accepted_at) d, SUM(mode='review') review, SUM(mode='extra_practice') extra,
  SUM(mode='lesson') lesson FROM mandarin_practice_events WHERE kind='response' GROUP BY 1,2;
```

The baseline report also covers checkpoint first exposure versus assisted, delayed recall at
1–7 days and 7+ days, and help dependence. Rejected events are never stored, so rejection rates
(including outbox poison) need client telemetry or server logs.

## Recommendations (by value)

1. **#101: fix continuation and staleness.** Call `refreshProjection` when a review session ends
   and when Home mounts. Build "Another session" from the backlog, not the same plan. Keep the
   bounded default of 10 per session, with further review only through explicit continuation.
   Test: finishing a session with backlog shows the next ten distinct targets.
2. **#101: stop the `Hard` learning loop.** Choose between `learning_steps: []` and grading
   replay-correct as `Good` while a card is learning. Either way, bump the scheduler version and
   config hash, and include steps in the hash. Test: N consecutive `Hard` must graduate.
3. **#103: run P1, P4, P6 and P8 before stretching intervals.** Report lapses with and without
   assisted-correct `Again`. Dedupe responses by first response per `opportunity_id`.
4. **#101: defer automatic `Easy`.** No latency-based `Easy` until P1 shows `Good` is reliable and
   a guessing control exists (three options, single-exercise targets).
5. **#101: event schema v2 rollout** in the order of section 4, with an outbox dead-letter for
   permanent rejections and no rewriting of queued payloads under existing ids.
6. **#100: card key `knowledgeUnitId × assessedSkill`**, carried in v2, replacing the six
   per-target sites in section 2. More exercises per target before review relies on rotation.
7. **#100 / #101: decide what help-assisted correct means.** It is currently a lapse. Separate
   "retry after feedback" from "revealed text" in v2 (`attemptIndex`), then decide the grade.
8. **#101: leech remediation as its own bounded change**, for example 4+ lapses or a stuck
   learning card, leading to re-teaching rather than more 10-minute repeats. Depends on P5 and P6.
9. **#101: time basis.** The scheduler stays on `accepted_at`. Evaluation uses clamped
   `client_occurred_at` and reports sync lag. Validate `clientOccurredAt` as ISO 8601 in v2.
10. **#101: small fixes.** Remove "mock" copy from the live review screen. Compare
    `schedulerVersion` client-side. Learner-adjustable limits and a daily cap wait until the
    default of 10 is observed in P7 and P10.
