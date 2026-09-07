# Evaluation and release gates

## Gate A — after Claude, judge the experience

Open all five scenes on a phone-sized viewport and desktop. The question is whether this is a clear, appealing activity the learner wants to return to—not whether it has already taught Mandarin. Preview speech, mock saves and simulated review counts are not evidence of learning.

Confirm that the next action is obvious, the listening card is readable over the scene, text can be revealed intentionally, errors produce explanation rather than punishment, and the journey does not demand gamepad-like dexterity. Turn off WebGL and enable reduced motion; the lesson flow should survive. Open the audio-pending/error states, not just the happy path. Inspect the art slots before commissioning a batch of final images.

Do not let the integration pass begin with unresolved navigation dead ends or components that call temporary mocks directly. Claude should deliver a clean adapter boundary and a handoff document with the actual commit.

## Gate B — after Codex, prove the complete path

Use a nonproduction database and properly provisioned AWS credentials. Import the pack twice and verify the second import is a no-op. Run audio diagnostics, warm or resolve one normal-speed line, let the worker publish it, and play it in an actual browser. Turn paid generation off and play it again: a durable hit must not need synthesis credentials. Request its slower variant and confirm it is a separate recipe.

Open the same uncached source in two tabs. Verify that they share a logical job/object rather than multiplying ordinary provider requests. Exercise a provider error, a stopped worker, expired claim, storage failure and expired delivery URL. A player must not receive a wrong-answer grade because infrastructure failed. Unknown source IDs and free-form text must be rejected without a generation call.

Play through one full scene, use a hint after an incorrect answer, refresh, and resume from a second authenticated browser. Repeat an event upload and confirm it does not advance memory twice. Log out and sign into another test account; no progress or outbox should cross accounts.

If S3 is configured, test a real round trip and a migration of one existing local asset before declaring S3 support verified. A fake-disk unit test is not that test. Keep original local files after the migration test. Never run this exercise against production data without approval.

## Gate C — after several real sessions, decide whether to expand

Finish the short course in ordinary sessions. Track whether the player can understand practiced lines before looking at text, whether replay/hint dependence decreases, whether reviews are manageable, and whether the story is motivating or merely decorative. Ask the learner to describe confusing moments rather than reducing feedback to an overall star rating.

Take the reserved ten-item listening check only after the relevant material has been taught. Record first presentation, replay-assisted success, text-assisted success, time since teaching, and any previous exposure. This small multiple-choice check is a product signal, not a controlled experiment or a claim about unrestricted television comprehension.

Repeated checkpoint sentences become practice, not a fresh transfer test. Do not keep retesting the same ten items and describe rising scores as novel-sentence comprehension. A future pack should add independently reviewed, previously unheard combinations of familiar words. A new voice is a separate evaluation axis; the first Polly-only narrator does not test that.

An expansion decision should prioritize the learner's actual failure mode:

- If the UI is enjoyable but speech remains opaque, improve audio/editorial quality and the teaching sequence before adding content.
- If text help makes everything easy but normal-speed sound recognition does not improve, increase varied audio practice rather than more character matching.
- If learning is evident but reviews are tedious, adjust session selection and workload before building a larger world.

These are proposed decision rules, not claims that the small trial proves a causal effect.

## Operational completion record

Keep a short factual release note with: current course revision; generated image files; narrator/engine/region; ready/missing/failed audio assets; native review status; tested browser/device combinations; queue and storage topology; local/S3 verification; migration/import commands; and actual test results. Separate “implemented” from “executed and verified.”

Known scope limits should remain visible: no Cantonese, no speech recognition, no native app, no television/audio scraping, no generated curriculum during play, no claim of two independent Mandarin voices, and no complete offline mode unless actually implemented and tested.
