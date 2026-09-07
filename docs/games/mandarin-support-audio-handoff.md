# Support-glossary audio decision and implementation record

**For:** Codex · **Blocks:** three silent tiles in construction exercise `g04`
**Approved by:** GPT Pro review of 2026-09-07, decision Q4 — *"Make support words audible;
keep them outside the primary targets."*

**Implemented for course revision `1.0.1`:** `support` is now an allowlisted source kind,
the three `g04` chunks use it, and the checked-in corpus contains all six normal/slow
recipes and all 170 mappings for the revision. The first dry run reused 162 ready assets
and identified exactly six missing recipes before Polly was called. The final cache-only
check returned `ready` for all six with `MANDARIN_SPEECH_PROVIDER=null` and
`MANDARIN_GENERATION_ENABLED=false`.

## The problem

`AudioSourceRef` in `resources/js/games/mandarin/contracts/mandarin.ts` admits only:

```ts
{ sourceKind: 'utterance' | 'target'; sourceId: string; variant: 'normal' | 'slow' }
{ sourceKind: 'sfx'; sourceId: string; variant: 'default' }
```

The 18 supporting glossary entries are therefore unaddressable, and cannot be spoken.

Tapping a construction tile now plays that chunk. 15 of the 18 tiles reach a curated
recording (`resources/js/games/mandarin/domain/constructionTiles.ts`), but `g04` —
请再说一遍 — has only 说, because 请, 再 and 一遍 are support entries. One audible tile in
four is a visibly uneven exercise. The UI currently states the gap rather than pretending
the controls work.

## What was rejected, and why

- **Promoting 请 / 再 / 一遍 to primary targets.** Inflates the tested vocabulary from 30 to
  33 and changes what the checkpoint may draw on, to solve an audio problem.
- **Restructuring `g04`'s tiles** so its chunks happen to map to existing targets. Bends a
  useful four-piece exercise around a limitation of the source types.
- **Synthesising the tile text directly.** Breaks the rule that the browser submits a known
  ID and never arbitrary text, and turns a public endpoint into a billable text-to-speech
  service.

"Shown for context, not tested" is a *scheduling* policy. The distinction worth preserving
is that an item may have a pronunciation, a glossary entry and a teaching role without
having its own scheduled mastery card.

## Implementation scope

A narrow `support` source kind, carried consistently through:

1. `contracts/mandarin.ts` — add `'support'` alongside `'utterance' | 'target'`.
2. PHP allowlists and request validation (`app/Http/Requests/Mandarin/ResolveAudioRequest.php`
   and the audio controller) — accept and bound the new kind.
3. Source resolution — resolve a support ID to its `zh` from the versioned course the same
   way targets resolve, so the recipe text comes from the published revision, never a
   client string.
4. `AudioValidator` / import validation — a support source must reference a real
   `supportGlossary` entry in that revision.
5. `MockMandarinGateway` and the preview scenarios — so the preview keeps parity.
6. Manifest, warm and import tooling (`mandarin:audio:*`) — the new sources must appear in
   `resources/data/mandarin/audio-manifest.json` and be warmable.

Then add `normal` and `slow` sources for `please`, `again` and `one-time`, and point the
three `g04` tiles at them in `constructionTiles.ts`. The `data-tile-audio="none"` marker and
the `construction-audio-gap` notice should disappear on their own once `audio` is non-null;
`resources/js/games/mandarin/__tests__/construction.test.ts` asserts the current silent set
and will need its expectation updated in the same commit.

## Two things the review corrected about cost

**New texts are not one new file each.** Three texts across `normal` and `slow` rates are up
to six new effective recipes, less exact dedupes. `AudioRecipe::speech()` hashes normalised
text plus effective provider settings and does *not* include the course version or source
ID, so unchanged recipes are reused across a `contentVersion` bump — but the rates differ,
so do not assume three.

**The new revision still needs its own source mappings.** `recordedResolution()` looks up
course, content version, source kind, source ID and variant. Cached *files* do not create
mappings for a newly imported revision. In a cache-only deployment with generation
disabled, importing the revision without writing its mappings leaves previously generated
audio unreachable.

Remaining follow-up: `在这里` (tile `g03-c3`) reuses utterance `05c`,
whose Polly recipe text is `在这里。` — a sentence-final rendering being played for a
mid-sentence chunk. A mid-sentence recipe for that chunk would be the clean fix.

## Release check

Demonstrate, separately from "implemented":

- unchanged recipes reused across the version bump (no needless regeneration),
- the new revision's source mappings present,
- playback working with `MANDARIN_GENERATION_ENABLED=false` (cache hits only),
- a dry run reporting the actual missing recipes **before** any paid call.

Do not merge or deploy production.
