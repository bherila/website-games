# Mandarin Quest: communicative curriculum map

Curriculum map for [#102](https://github.com/bherila/website-games/issues/102), part of
[#95](https://github.com/bherila/website-games/issues/95). It inventories course revision
`1.1.1` (`resources/data/mandarin/foundations.v1.json`) and sketches where the next
situations could go. It authors no lesson content. The evidence behind its choices is in
[the pedagogy digest](mandarin-pedagogy-digest.md) (rows E*n*).

**Organising principle.** Each unit is a situation the learner can handle in a TV
conversation. Vocabulary, constructions and function words are tracked per situation, not
rotated as separate strands.

> **Native review required.** All Chinese in this document, including the existing
> inventory, is AI-authored. Nothing in the plan below may reach learners until it passes
> the fluent-speaker review standard in [#57](https://github.com/bherila/website-games/issues/57).
> The course itself still has `nativeReviewed: false`. Items marked *(verify)* are usages
> the author is not sure of.

## 1. Inventory of the shipped ten scenes

Method: "Revisits" is derived by matching the Chinese text of each scene's dialogue and
teaching variants (`01a`–`10h`, `v01`–`v10`) against items introduced in earlier scenes.
It does not use `requiresTargetIds`, which lists only the new target in scenes 6–10. The
false matches were removed by hand: 在 inside 现在, 不 inside 对不起, 我 inside 我们, and
好 inside 你好 or 好吃. Reserved checkpoint lines are excluded and not quoted. Function-word
counts are occurrences in those lines.

| Scene | Learner can… | New targets | Constructions and patterns | Function words | Revisits (from utterance text) |
|---|---|---|---|---|---|
| s1 The invitation | Greet, say who they are, ask who someone is and whose friend he is | 你好, 我, 你, 是, 谁, 他, 我的朋友 | A 是 B; 我的 / 你的 + noun; question word in place (你是谁？) | 的 ×2 | — |
| s2 A cook in the crowd | Ask whether someone is here and where; understand "not here" and "don't know" | 找, 这里, 在, 吗, 不在, 哪里, 不知道 | 在 + place; statement + 吗; 在哪里？; 不 + verb | 吗 ×1, 不 ×2 | s1: 你, 我, 他, 谁 |
| s3 The tempting shortcut | Say where they are going; understand "don't go", "wait a moment"; agree to wait | 去, 别走, 为什么, 等一下, 好, 等你 | 去 + verb (去找他); 别 + verb; 在 + place + verb (我在这里等你) | 别 ×1 | s1: 你, 我, 他 · s2: 找, 在, 这里, 哪里 |
| s4 The noisy message | Say they did not understand, ask for a repeat, confirm understanding | 听懂, 没听懂, 说, 请再说一遍, 现在 | verb + result (听懂); 没 + verb; 了吗？; time word first (现在我听懂了) | 了 ×2, 没 ×2, 吗 ×1, 别 ×1, 请 ×2 | s1: 你, 我, 他 · s2: 在, 这里, 吗 · s3: 别走, 等 + person |
| s5 The wandering apprentice | Notice an arrival; propose going together | 来了, 看见, 我们, 一起, 走吧 | 来了 as an announcement; verb + object + 了 (我看见他了); 一起 + verb + 吧 | 了 ×3, 吧 ×3 | s1: 你, 我, 他 · s2: 在, 这里, 哪里 · s3: 好, 等 + person |
| s6 The two entry bowls | Say what an object is and whose it is; choose by colour | 碗, 这个, 红色, 蓝色 | 这是 + noun; 这个是我的; colour + 的 as "the red one"; 是…吗？ | 的 ×9, 吗 ×1 | s1: 是, 我, 你, 的 · s2: 在, 哪里, 吗 |
| s7 The confident wrong turn | Follow left/right and here/there directions with a landmark | 左边, 右边, 桥, 那里 | 在 + side; noun + 那里 as a place (在桥那里); 去 + place + 吧 | 吗 ×1, 吧 ×1 | s1: 你, 我, 他 · s2: 在, 哪里, 吗 · s3: 去, 等 + person · s5: 我们, 吧 |
| s8 An empty hand | Hear who has something and whether it is inside or outside | 有, 没有, 里面, 外面 | 有 / 没有 + noun; place + 没有 + noun (里面没有碗); 有…吗？ | 没 ×3, 吗 ×2, 的 ×1 | s1: 你, 我, 他 · s2: 在, 吗 · s3: 等 + person · s6: 碗, 蓝色, 的 |
| s9 A better kind of hero | Ask for help; hear who gives what to whom; thank; apologise | 帮, 给, 谢谢, 对不起 | 帮 + person + verb; 给 + person + thing; 请 + verb; 谢谢你 + reason | 请 ×2, 没 ×1 | s1: 你, 我, 他 · s2: 找 · s4: 请, 没听懂 · s6: 碗, 这个 |
| s10 A place at the table | Ask whether food is available; announce a start; praise food; plan for tomorrow | 面条, 开始, 好吃, 明天 | 开始 + verb + 了; 很 + adjective; time word + 在 + place + verb | 很 ×2, 了 ×1, 吗 ×1, 吧 ×1, 的 ×1 | s1: 你, 我, 他 · s2: 在, 这里, 哪里, 吗 · s3: 去, 等 + person · s4: 现在 · s5: 我们, 吧 · s6: 这个, 的 · s8: 有 |

Support items outside the 50 targets (`supportGlossary`): 小林, 的, 朋友 (s1); 不, 知道
(s2); 走, 别, 等, 一下, 在这里 (s3); 没, 了, 听, 懂, 请, 再, 一遍 (s4); 来, 吧 (s5); 吃,
很 (s10).

### What the inventory shows

- **The spiral is thin after scene 5.** Pronouns, 在 and 等 + person recur everywhere,
  but 29 of the 50 targets appear in no later scene's dialogue or teaching lines. They
  include 你好, 不知道, 为什么, 来了, 看见, 一起, 红色, every s7 and s8 item except 有,
  and all of s9–s10. Eight of those come from s9–s10, which have no later scene yet.
  (听懂 counts as one of the 29, although s9 reuses 没听懂.)
- **Review does not recombine.** All 100 lesson exercises draw their audio from their own
  scene (0 cross-scene prompts). Scheduled review therefore replays familiar sentences.
  #100's "unfamiliar combinations of familiar language" has no material yet.
- **是 and 谁 fade early.** 是 appears only in s1 and s6, and 谁 only in s1–s2, although
  both are very frequent in dialogue.
- **Negation is present but never contrasted.** 不 (不在, 不知道) and 没 (没听懂, 没有)
  both occur, but no scene sets them side by side.
- **了 appears in six lines with two readings.** Some lines report a completed event
  (我看见他了, 他开始吃面条了). Others report a new situation (现在我听懂了). 他来了 fits
  either. The s5 grammar note correctly says 了 is not a past tense. No scene contrasts
  the readings.

## 2. Gaps against the goal of following TV dialogue

| Gap | In the course now | Missing for TV dialogue |
|---|---|---|
| Degree and evaluation | 很好吃 only (很 is a support item) | 太…了, including positive 太好了; 真; 有点儿 + an unwelcome quality *(verify scope)*; 不太 |
| Quantity and sufficiency | none | 够 / 不够 / 够了, 多 / 少, 一点儿, numbers and 几 / 多少 |
| Aspect 了 and sentence-final 了 | six lines, contrast not taught | "Something has changed" readings (走了, 不见了, 没有了) heard beside completed events. Teach situation by situation; do not make the learner label which 了 it is (#99) |
| Question forms | 吗, 谁, 哪里, 为什么 | 呢 (他呢？), A-not-A (是不是, 要不要, 有没有), 什么, 哪个, 还是 (either/or), tag 好吗 / 好不好, questions marked only by rising intonation |
| Wanting, ability, permission | none | 要, 想, 可以, 能, 会 |
| Reactions and turn-taking | 谢谢, 对不起, 好 | 不客气, 没关系, 没事, 真的吗, 是吗, 对 / 不对, 算了 *(verify register)* |
| People and time | 我们 only as a plural; 现在, 明天 | 你们, 他们, 她; 今天, 刚才, 已经, 马上 |
| Connected speech | one synthetic voice at normal and slow speed | See below |

**Connected speech.** The pinyin convention writes 一 and 不 changes as spoken (yíxià,
bú zài) but keeps lexical third tones (Nǐ hǎo). The learner hears the third-tone change
(你好 is spoken ní hǎo) but never sees it, so a perception drill or #97's expected-tone
metadata must carry the realised tone separately. Further gaps:

- **Neutral tone** in frequent words: 朋友, 谢谢, 什么, 关系. 知道 is written zhīdào here and
  is often neutral-toned in casual northern speech *(verify)*.
- **Northern 儿 forms.** 哪儿, 这儿, 那儿 and 一点儿 are common in northern-set TV, where
  the course uses 哪里, 这里 and 那里. Which variety to prefer depends on the target shows.
  Recognising both is the safe default *(native reviewer to advise)*.
- **Natural speed, phrase boundaries and a second voice.** These are the connected-listening
  path #95 assigns to #100 or #102. One narrator supports no claim of cross-voice
  comprehension (`voiceTransferClaim: false`).

## 3. Spiral plan for the next six situations

These are situations, not lessons. "New" items are candidates, unreviewed and unauthored.
Every situation teaches before scoring and keeps at most four new primary targets per
node. In listening assessment, scenery must not show the answer; for example, an empty
bowl may not be visible before "the noodles are gone" is heard. Where it fits, listening
items ask the learner to pick a fitting *response* or action, not an English translation
(#102).

**Gating.** No learner-facing expansion happens before the Gate C learner trial
([#58](https://github.com/bherila/website-games/issues/58)) and native review (#57).
s11 is the deferred lesson [#99](https://github.com/bherila/website-games/issues/99);
the rest are not yet issues. The order below can change once the trial reports
what learners actually struggle with.

| # | Situation (learner can…) | New language (candidates) | Revisits | Recycles scenes |
|---|---|---|---|---|
| s11 *(#99)* | **Too much, not enough.** At the supper table: understand delight or complaint about a portion, and say whether there is enough | 太…了 as a frame, starting with 太好了 (positive) before 太多了 / 太少了; 够, 不够 (bú gòu), 够了; 多, 少 | 面条, 吃, 很, 好吃 (s10); 有 / 没有 (s8); 碗, 这个 (s6); 好 (s3); 吗 (s2); 了 (s4–s5) | s10 table setting, so no new art; s6, s8 |
| s12 | **Where did it go?** Notice that someone has left or something is missing, and ask "what about…?" | Noun + 呢？ (他呢？ 碗呢？); 走了 ("has left") heard beside 来了; 不见了; 没有了 ("none left") | 在哪里, 不在, 不知道 (s2); 走, 别走 (s3); 来了 (s5); 碗 (s6); 没有, 里面, 外面 (s8); 面条 (s10); 够 (s11) | s2, s5, s8 |
| s13 | **Say that again, slower.** Signal what was missed and ask for slower speech when people talk at natural speed | 什么 (你说什么？); 请说慢一点 *(verify word order against 请慢一点说)*; echo questions with rising intonation and no 吗 (明天？) | 说, 请, 再, 一遍, 听懂, 没听懂 (s4); 对不起 (s9); 现在, 明天 (s4, s10); 哪里 (s2) | s4, s9. The connected-listening path lives here: familiar lines at natural speed and, if added, a second voice |
| s14 | **This one, not that one.** State a choice, refuse an unsuitable item, answer an either/or question | 要 / 不要; 那个, 哪个; 还是 (红色的还是蓝色的？); A-not-A (要不要, 是不是); 不是这个 | 这个, 碗, 红色, 蓝色, 的 (s6); 是 (s1); 有 / 没有 (s8); 面条 (s10); 太…了, 够 (s11) | s6, s8, s10 |
| s15 | **Can we go tomorrow?** Understand a proposal, a request for permission, and when something will happen | 可以; 想 + verb; 今天, 什么时候; tag 好吗 / 好不好 | 去, 等 (s3); 我们, 一起, 吧 (s5); 现在, 明天, 开始 (s4, s10); 哪里 (s2); 好 (s3); 要 (s14) | s3, s5, s10 |
| s16 | **That's okay.** Recognise the everyday reactions that carry turn-taking: answering thanks, accepting an apology, surprise, agreement | 不客气, 没关系, 没事, 真的吗, 是吗, 对 / 不对 | 谢谢, 对不起 (s9); 是 (s1); 吗 (s2); 不 vs 没 (s2, s4, s8); 太好了 (s11) | s9, s1. A listening item hears 对不起 or 谢谢 and asks for the fitting reply (没关系 vs 不客气), not a translation. Intonation and attitude are part of the meaning (digest E21) |

### Placement notes

- **Why s11 comes first.** It continues the s10 table setting without new art. It builds
  on 很 + adjective (很好吃), which the adult foundation course also teaches before 太…了
  (digest E26). It also starts the "something is now different" use of 了 (够了), which
  s12 extends.
- **How 太…了 is framed.** It is not a negative construction: 太好了 is delight, and
  太多了 can be a complaint or polite protest depending on intonation and situation. Teach
  it as a whole frame in one semantic area (quantity and sufficiency), as #99 requires.
  Do not teach "this 了 means change, that 了 means too much". 够了 can also mean "that's
  enough, stop", often with irritation, which TV dialogue uses *(confirm register with the
  reviewer)*.
- **s11 and 要.** If natural s11 lines need 要 (for example 我不要了, "I don't want any
  more"), either keep them as support items in s11 or swap s11 and s14. #99 forbids moving
  new learning into the support glossary only to satisfy the four-target limit, so mark
  each item known, new or construction.
- **s16 can move up.** It depends only on s9, and reactions are frequent in TV dialogue.
  If the learner trial shows that responses, not repair, are the problem, run it right
  after s11.
- **The checkpoint finish line stays where it is.** New scenes add their own check block
  later (#99).

## 4. How this feeds the other issues

- **#100.** s12–s16 supply the "unfamiliar combinations of familiar language" that review
  lacks today. Each situation should include at least one cross-scene line built only from
  earlier items, such as 碗呢？ in s12.
- **#96.** Tone-pair sets can be drawn from each situation's own words, for example 太多 /
  不够 in s11 or 什么 / 慢 in s13, rather than from a generic chart (digest decision 13).
- **#103.** Learner-trial observations on repair (s4), arrival (s5) and having (s8)
  decide whether s12 or s16 comes before s13.
