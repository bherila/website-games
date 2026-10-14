# Evaluation and release gates

These gates began as the five-scene kickoff plan. This checklist now targets the
ten-scene course (20 nodes, 50 targets, 100 listening exercises, five constructions,
20 reserved checkpoint items). It is a validation plan, not evidence that every gate
has passed. See [current release status](../games/mandarin.md#release-status-and-follow-ups).
Fluent-speaker review is [#57](https://github.com/bherila/website-games/issues/57);
the multi-session learner trial is [#58](https://github.com/bherila/website-games/issues/58).

## Gate A — judge the experience

Open all ten scenes on a phone-sized viewport and desktop. The question is whether this is a clear, appealing activity the learner wants to return to—not whether it has already taught Mandarin. Preview speech, mock saves and simulated review counts are not evidence of learning.

Confirm that the next action is obvious, the listening card is readable over the scene, text can be revealed intentionally, errors produce explanation rather than punishment, and the journey does not demand gamepad-like dexterity. Turn off WebGL and enable reduced motion; the lesson flow should survive. Open the audio-pending/error states, not just the happy path. Inspect the art slots before commissioning a batch of final images.

Do not let the integration pass begin with unresolved navigation dead ends or components that call temporary mocks directly. The UI handoff should include a clean adapter boundary and a document with the actual commit.

## Gate B — prove the complete path

Use a nonproduction database and properly provisioned AWS credentials. Import the pack twice and verify the second import is a no-op. Run audio diagnostics, warm or resolve one normal-speed line, let the worker publish it, and play it in an actual browser. Turn paid generation off and play it again: a durable hit must not need synthesis credentials. Request its slower variant and confirm it is a separate recipe.

Open the same uncached source in two tabs. Verify that they share a logical job/object rather than multiplying ordinary provider requests. Exercise a provider error, a stopped worker, expired claim, storage failure and expired delivery URL. A player must not receive a wrong-answer grade because infrastructure failed. Unknown source IDs and free-form text must be rejected without a generation call.

Play through one full scene, use a hint after an incorrect answer, refresh, and resume from a second authenticated browser. Repeat an event upload and confirm it does not advance memory twice. Log out and sign into another test account; no progress or outbox should cross accounts.

If S3 is configured, test a real round trip and a migration of one existing local asset before declaring S3 support verified. A fake-disk unit test is not that test. Keep original local files after the migration test. Never run this exercise against production data without approval.

## Gate C — after several real sessions, decide whether to expand

Finish the short course in ordinary sessions. Track whether the player can understand practiced lines before looking at text, whether replay/hint dependence decreases, whether reviews are manageable, and whether the story is motivating or merely decorative. Ask the learner to describe confusing moments rather than reducing feedback to an overall star rating.

Take the reserved twenty-item listening check only after the relevant material has been taught. Record first presentation, replay-assisted success, text-assisted success, time since teaching, and any previous exposure. This small multiple-choice check is a product signal, not a controlled experiment or a claim about unrestricted television comprehension.

Repeated checkpoint sentences become practice, not a fresh transfer test. Do not keep retesting the same twenty items and describe rising scores as novel-sentence comprehension. A future pack should add independently reviewed, previously unheard combinations of familiar words. A new voice is a separate evaluation axis; the first Polly-only narrator does not test that.

An expansion decision should prioritize the learner's actual failure mode:

- If the UI is enjoyable but speech remains opaque, improve audio/editorial quality and the teaching sequence before adding content.
- If text help makes everything easy but normal-speed sound recognition does not improve, increase varied audio practice rather than more character matching.
- If learning is evident but reviews are tedious, adjust session selection and workload before building a larger world.

These are proposed decision rules, not claims that the small trial proves a causal effect.

### A runnable trial protocol (#58 / #103)

This is preparation for a real trial, not a completed trial or authorization to publish
learner data. Keep individual observations in a private evaluation record; public issues
receive only an anonymized coverage summary and product decisions. Never copy raw event
logs, account identifiers or recordings into the repository.

1. Record the deployed course revision, browser/device and whether practice was offline.
   Before changing mechanics, save the read-only baseline report privately with a dated
   window and the chosen time basis. Review eligible grade transitions, helped-correct
   Again, never-Good cards and sync lag alongside the existing comprehension measures.
2. Use ordinary short sessions, documenting actual practice time and material encountered.
   Observe the five existing recall prompts without recording the learner's voice.
   Self-rated “said it” is a claim to compare later, not a pronunciation result.
3. Plan delayed observations at about one and seven days after the actual practice time.
   If the learner practiced offline, record occurrence and synchronization separately;
   server acceptance time alone cannot establish the delay. Mark missing or unreliable
   timing explicitly instead of silently assigning a delayed-recall bucket.
4. Within an observation, ask for formulation before a model or listening prompt exposes
   the same sentence. For repeated familiar prompts, record all prior exposure and help.
   The reserved twenty-item checkpoint is administered only after teaching and is never
   used to prepare practice prompts or a public example sheet.
5. Ask what was confusing, whether reviews felt manageable and whether the story motivated
   another session. At the end, prioritize a specific observed problem and record the
   retain/change/expand decision. New word-family activities (#122/#123) and s11 (#99)
   remain candidates until the expansion decision and native review pass.

Use one row per observation, with blank cells until evidence actually exists:

| Field | What to record privately |
|---|---|
| Anonymous learner label / session | A study-local label, no account or contact identifier |
| Revision / device / time | Course revision, browser/device, actual practice time and sync conditions |
| Skill / prompt exposure | Listening or formulation; familiar versus previously unheard; prior reveals/replays |
| Delay / time reliability | Time since actual learning; approximate 1-day / 7-day probe; any clock/sync uncertainty |
| First attempt / help / later result | Unaided first response, voluntary replays/text help, then assisted result separately |
| Recall calibration | Earlier self-rating and later result; production before revealing a same-target model |
| Workload / confusion / motivation | Actual session length, review burden and the learner's concrete observations |
| Decision / evidence limits | Next action and why; missing observations; no causal or cross-voice claim |

No novel-sentence transfer or independent pronunciation assessment can be inferred from
replaying familiar sentences with the same narrator. Those require separately reviewed,
unexposed items and, for pronunciation, independent proficient-speaker ratings. Do not
stretch intervals or call Gate C passed merely because the software report runs.

## Operational completion record

Keep a short factual release note with: current course revision; generated image files; narrator/engine/region; ready/missing/failed audio assets; native review status; tested browser/device combinations; queue and storage topology; local/S3 verification; migration/import commands; and actual test results. Separate “implemented” from “executed and verified.”

Known scope limits should remain visible: no Cantonese, no speech recognition, no native app, no television/audio scraping, no generated curriculum during play, no claim of two independent Mandarin voices, and offline coverage limited to cached content. The service worker caches heard audio,
and signed-in events replay through the account-partitioned outbox on reconnect.
An unseen clip is not guaranteed offline; cache eviction and a first offline visit
remain separate cases to exercise. Installed-iPhone OAuth requires real-device
verification in [#59](https://github.com/bherila/website-games/issues/59).
