# Mandarin practice event schema v2 (issue #101)

Migration plan for [#101](https://github.com/bherila/website-games/issues/101), part of
[#95](https://github.com/bherila/website-games/issues/95). It turns the audit's migration order
(`mandarin-scheduler-audit.md`, section 4) into a contract, and carries the card key from
`mandarin-skill-contract.md` (#100). Nothing here is built yet. Code references are to `main` at
`5e6a72e`.

## What needs a version, and what does not

| Change | Mechanism |
|---|---|
| An existing field changes meaning, or a field becomes required | New event `schemaVersion` |
| A new optional field, a new `kind` or a new `responseAction` | Same version. The server accepts it only where the course content allows it (for example `self_check` only on a `say_check` exercise), so a client never sends it before the content exists |
| New fields in an acknowledgment or the projection | Same version. Clients ignore fields they do not read |
| Course shape (new exercise kind or field) | Course `schemaVersion`, deployed client-first (see the skill contract) |

v2 exists because of the first row: `textHelpUsed` changes meaning.

These numbers are separate and never compared with each other: event `schemaVersion`, course
`schemaVersion` (`courseSchema.ts:121`), `contentVersion`, the audio manifest `SCHEMA_VERSION`, the
outbox storage key (`outbox.v1`), and `schedulerVersion` with its config hash.

## Fields

| Field | v1 | v2 | Why |
|---|---|---|---|
| `schemaVersion` | `1` | `2` | — |
| `attemptIndex` | absent | Required on `response`: `0` for the first answer in an opportunity, then 1, 2… | Separates "second try after being shown the answer" from "revealed text" (audit section 1) |
| `textHelpUsed` | Transcript or meaning revealed, **or any retry** (`events.ts:57`); `help_revealed` uses `answerDisclosed` instead (`:74`) | Transcript or meaning revealed, on every kind. Nothing else | The two kinds disagree today, and a retry is not a reveal |
| `responseAction` | `answer`, `dont_know`, `skip` | adds `self_check` | `form.recall` (#100) |
| `selfRating` | absent | `said_it`, `partly`, `missed`; required with `self_check`, otherwise null | The learner's claim; the server grades it |
| `sessionKind` | absent | `scheduled`, `continuation`, `extra` on `review` and `extra_practice` responses; otherwise null | Workload questions P7 and P10 cannot tell a continuation from a first session today |
| `clientOccurredAt` | Any string up to 128 characters; stored null when unparseable | ISO 8601 with an offset, else `invalid_payload` | Delayed-recall evaluation reads it (audit recommendation 9) |
| `audioEvidence` | unchanged | unchanged | Counting autoplay separately was considered and dropped: `normalPlayCount > 1` already means one voluntary replay, and grading would not change |

The client still never sends a correctness, grade, skill or card key.

## Grading

**v1 is frozen.** v1 events keep today's `grade()` byte for byte. A golden test feeds the existing
v1 fixtures through the new dispatcher and asserts identical `correctness`, `grade`,
`schedule_eligible` and `target_id`.

**v2** grades through the skill resolved for the exercise (skill contract, evidence rules):

- `attemptIndex > 0`: correctness computed, grade null, never schedule-eligible.
- `listen.meaning`: as v1, with `textHelpUsed` meaning reveal only. A correct first answer after a
  reveal stays `Again`.
- `form.recall` (`self_check`): `said_it` → Good, `partly` → Hard, `missed` or `dont_know` → Again;
  `said_it` before one completed model play → Hard; model audio not completed → unscored.
- Anything else: as v1.

**Acknowledgment** gains `cardKey` (null when the event moves no card). **Projection** `reviews[]`
gains `cardKey` next to `targetId`.

## Rejections

The server stores nothing for a rejected event, and today the client resends every rejected event
on every flush (`domain/outbox.ts:58-61`). v2 sorts reason codes by whether a retry can ever
succeed:

| Reason | Retry? | When it happens |
|---|---|---|
| `unsupported_schema` | Yes | Server rolled back to a version that does not know the event's schema |
| `unsupported_kind` (new) | Yes | Server does not support a kind or action yet. Split from `invalid_kind`, which covered both |
| `sign_in_required` (set by the client gateway on 401 or 419), network, 5xx | Yes | Unchanged |
| `conflict` | No | Same `clientEventId`, different payload |
| `invalid_event_id`, `invalid_kind`, `invalid_payload`, `invalid_option` | No | Malformed |
| `unknown_course_revision`, `unknown_scene`, `unknown_node`, `unknown_exercise` | No | Content the server never had |

**Dead-letter.** Permanent rejections leave the outbox for a separate, bounded store (newest 200
kept), are never resent, and are counted. There is no diagnostics screen today; a count beside the
save status is enough. **Server log.** Each rejection
writes one log line with its reason code, schema version and kind, and no payload or user data, so
rejection rates can be measured without client telemetry.

## Storage

- `mandarin_practice_events.schema_version`, small integer, not null, default 1. Every existing row is v1.
- `mandarin_practice_events.card_key`, string up to 160, nullable. Backfilled to
  `target:<target_id>#listen.meaning` where `target_id` is set; v1 rows written afterwards get the
  same value. Index `(user_id, card_key, schedule_eligible)` for the window query.
- The concatenation differs by driver (`||` on SQLite, `CONCAT` on MySQL), so the backfill runs as a
  chunked update in PHP rather than one raw statement.
- `target_id` stays, filled for `listen.meaning` rows only. Reports and the baseline report keep
  working unchanged.
- The idempotency hash stays the canonical full event, so a v1 and a v2 event can never collide.

## Rollout

Each step is its own deploy and is safe to roll back on its own.

| Step | Ships | Test | Rollback |
|---|---|---|---|
| 0. Client hygiene | Outbox dead-letter for permanent reasons. Client compares `projection.schedulerVersion` with its own `SCHEDULER_VERSION` and, on mismatch, asks the learner to reload (the finding declined on #109) | Permanent rejection leaves the outbox and is counted; retryable stays; mismatch shows the reload prompt | Revert; no data changes |
| 1. Server dual-accept | Validation and grading dispatched by version; `schema_version` and `card_key` columns with backfill; window keyed by `card_key`; `cardKey` in acks and projection; `unsupported_kind`; rejection logging | v1 golden test; v2 validation per field; window equivalence on backfilled rows; card-keyed replay equals target-keyed replay | Columns are additive; old code ignores them |
| 2. Advertise | `capabilities.practiceEventSchemas: [1, 2]` in bootstrap, behind `mandarin.events.advertise_v2` (default off). Absent means `[1]` | Bootstrap contract test with the flag on and off | Turn the flag off; no deploy |
| 3. Client emits v2 | Builds v2 events only when bootstrap advertises 2. The version is fixed when an event is built; queued events are never rewritten, upgraded or re-identified; v1 and v2 share one outbox under the same key. Scheduler keyed by `cardKey`, falling back to `target:<targetId>#listen.meaning` when absent | Mixed v1/v2 outbox drains in order; a queued v1 event is sent unchanged after the flag turns on; v2 rejected with `unsupported_schema` stays queued | Turn the flag off: new events are v1, queued v2 events wait |
| 4. `form.recall` content | Course `schemaVersion` 2 with `say_check` exercises, imported only after step 3's client has been live for one release | Course import validates `assesses`; older-client parse failure shows the reload prompt | Re-activate the previous content version; `form.recall` cards stop being offered but keep their history |
| 5. Retire v1 | Not scheduled. Decided from P8 grouped by `schema_version` once it shows no v1 arrivals for a long period | — | — |

A rollback of the server to a v1-only build after step 3 is safe: v2 events are rejected as
`unsupported_schema`, stay in the outbox, and are accepted when v2 support returns. New bootstraps
from the v1-only server advertise nothing, so clients go back to emitting v1.

## Time basis

The scheduler and the window stay on `accepted_at`. Evaluation (#103) uses `client_occurred_at`
clamped to at most `accepted_at`, and reports how many events needed the clamp. Revisit only if P8
shows sync lag that matters.

## Out of scope

- Leech remediation (audit recommendation 8): a separate, bounded change after P5 and P6 have data.
- Automatic `Easy`, and any latency field to support it (audit recommendation 4).
- Learner-adjustable limits and a daily cap, until P7 and P10 show the default of 10 in use.
- Microphone events (#97). When they come, they are a new kind inside v2 (counts and a pitch
  summary only, never audio), and they produce no grade.
