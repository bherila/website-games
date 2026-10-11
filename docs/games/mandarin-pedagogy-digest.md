# Mandarin Quest: pedagogy research digest

Decision digest for [#105](https://github.com/bherila/website-games/issues/105), part of the
"teach, don't just quiz" epic [#95](https://github.com/bherila/website-games/issues/95).
It is not a literature review. Each row records what a source can and cannot support and
the product decision it informs.

**Learner.** An English-speaking adult with essentially no Chinese whose goal is
understanding television dialogue, not handwriting or exams
(`docs/mandarin-kickoff/01-claude-code-ux-brief.md`). Children's materials are a teaching
reference, not an audience.

**Evidence levels.** *Full text*: the primary document was read. *Abstract*: only the
publisher abstract or landing page was read. *Secondary*: a news report, explainer or
search-engine summary was read, not the primary source. *Unverified*: the claim could not
be confirmed from anything read. **No adult-L2 study below was read in full text.** Every
effect, sample size and delay comes from an abstract and should be re-checked against the
paper before anyone quotes it as a number.

**Issues informed.** #96 tone perception, #97 microphone, #98 ML spike, #99 too much /
not enough lesson, #100 retrieval and skill semantics, #101 scheduler, #102 curriculum,
#103 evaluation.

## A. Adult learning science

| # | Source | Population | Learning task | Comparison | Outcome / delay | Evidence | Limitations | Product decision (issue) |
|---|---|---|---|---|---|---|---|---|
| E1 | Kim & Webb 2022, [doi:10.1111/lang.12479](https://doi.org/10.1111/lang.12479) | L2 learners, mixed ages and languages; 48 experiments, N = 3,411 | Vocabulary, grammar and other L2 targets | Spaced vs massed; longer vs shorter gaps; equal vs expanding gaps | Spacing: medium-to-large effect. Shorter gaps match longer ones on immediate tests but lose on delayed tests. Equal and expanding spacing were statistically equivalent | Abstract | Heterogeneous; not Mandarin or beginner-specific. Effect sizes seen only in secondary sources, which disagree with each other; not used here | Keep spaced review across sessions. Do not tune expanding vs equal schedules for their own sake, and judge retention on delayed probes, not in-session accuracy (#101, #103) |
| E2 | Kang, Gollan & Pashler 2013, [doi:10.3758/s13423-013-0450-z](https://doi.org/10.3758/s13423-013-0450-z) | Learners of L2 vocabulary (participant details not in the abstract) | Picture plus spoken L2 name | Retrieval (try to say the name before hearing it, then feedback) vs imitation (hear, then repeat) | Retrieval better on comprehension and production, no loss of pronunciation quality. Exp 1 immediate; Exp 2 after 2 days | Abstract | Single spoken words, picture naming, short delay; no tones or connected speech | Retrieval and imitation are separate activities with separate events. Imitation never counts as retrieval evidence (#100, #101) |
| E3 | Yanagisawa 2016, *KATE Journal* 30 (title only) | Unknown | Receptive vs productive word retrieval | Unknown | Unknown | Unverified | Abstract, n and results not found. The n = 18 figure in #95 could not be confirmed | None. "Match practice to the outcome" stays as a design principle, not a cited finding (#100) |
| E4 | de Vos et al. 2018, [doi:10.1111/lang.12296](https://doi.org/10.1111/lang.12296) | Meta-analysis: 32 studies, N = 1,964 | Incidental word learning from spoken input | Learner age; test type; task type | g = 1.05. Adults outperformed children. Recognition tests scored higher than recall tests. Interactive tasks did better | Abstract | Incidental, not instructed, learning; not Mandarin | A three-option recognition success is weaker evidence than recall: it never yields `Easy` and never stands in for recall mastery (#101, #100). Adults learn well from spoken input, which supports listening-first (#102) |
| E5 | Choe, Lee & So 2020, [doi:10.18823/asiatefl.2020.17.4.9.1294](https://doi.org/10.18823/asiatefl.2020.17.4.9.1294); Lange & Matthews 2020, [doi:10.14746/ssllt.2020.10.4.4](https://doi.org/10.14746/ssllt.2020.10.4.4) | L2 listeners (not Mandarin) | Phonemic-awareness instruction; lexical segmentation | Meta-analysis; correlational | Effect sizes not read | Abstract | Indirect; no Mandarin data | Weak support for adding phrase-boundary and segmentation practice to the connected-listening path (#100) |

## B. Tone and pronunciation

| # | Source | Population | Learning task | Comparison | Outcome / delay | Evidence | Limitations | Product decision (issue) |
|---|---|---|---|---|---|---|---|---|
| E6 | Dong, Clayards, Brown & Wonnacott 2019, [doi:10.7717/peerj.7191](https://doi.org/10.7717/peerj.7191) | 60 English speakers, 8 sessions | Tone training on real Mandarin words | High vs low vs high-blocked talker variability | All groups improved in perception and production and transferred to untrained voices and items. **No high-variability advantage on any generalisation test** (Bayes factors favour the null). Low variability did better on trained items. Aptitude predicted performance | Abstract | Retention interval not in the abstract; lab training | The #96 pilot may use the existing single-voice recordings. Test it on untrained items, and still make no cross-voice claim from one narrator (#96, #103) |
| E7 | Wang et al. 1999, [doi:10.1121/1.428217](https://doi.org/10.1121/1.428217) | 8 American learners, 8 sessions | Tone identification, high-variability natural words | Pre vs post | About 21% identification gain, 18–25% generalisation, retained at 6 months | Abstract | n = 8, older study | Tone perception is trainable in a few sessions, which justifies a small pilot (#96) |
| E8 | Morett & Chang 2015, [doi:10.1080/23273798.2014.923105](https://doi.org/10.1080/23273798.2014.923105) | English speakers (n not in abstract) | Learning tone-contrast words | Pitch gestures vs meaning gestures vs none | Pitch gestures improved telling tone-contrast meanings apart; **meaning gestures hurt** tone identification. Delay not in abstract | Abstract | n and delay unverified | Any visual or gesture aid traces pitch. Never illustrate word meaning during tone work (#96) |
| E9 | Baills et al. 2019, [doi:10.1017/s0272263118000074](https://doi.org/10.1017/s0272263118000074) | 106 adults with no Chinese | Tone identification and word learning | Observing pitch gestures vs none; producing vs observing | Observing gestures helped vs none; across experiments, observing ≈ producing | Abstract | Single session, short delay | Pitch-gesture animation is an optional perception aid, low priority (#96) |
| E10 | Zheng, Hirata & Kelly 2018, [doi:10.1044/2018_JSLHR-S-17-0481](https://doi.org/10.1044/2018_JSLHR-S-17-0481) | 24 English speakers (plus 12 native speakers); 7 native judges | Imitating tone production from video | Speech alone vs head nods vs hand gestures | **Mostly null** for production; some hand-gesture help for Tone 4 and slight head-nod help for Tone 3 in a subset; authors call the role "very modest" | Abstract | Imitation only, no delay | No gesture-based production coaching, and no production claim for gestures (#97) |
| E11 | Chun, Jiang, Meyr & Yang 2015, [doi:10.1075/jslp.1.1.04chu](https://doi.org/10.1075/jslp.1.1.04chu) | 35 learners, 20–25 min weekly for 9 weeks | Learner-created pitch visualisations | **None: single group, pre/post** | Improvement on some tones (native raters and acoustics); two-thirds found the curves helpful | Abstract | No control group, so it cannot show that visual feedback beats anything | Pitch display stays experimental record-and-compare with no efficacy claim (#97) |
| E12 | Zhou & Olson 2023, [doi:10.31274/psllt.15715](https://doi.org/10.31274/psllt.15715) | 4 beginners | Visual pitch feedback | Pre/post | Gains on isolated words, little generalisation to phrases | Abstract | n = 4 | Keep any coach scoped to isolated syllables or chosen words, as #97 already says (#97) |
| E13 | Zhang et al. 2025, [doi:10.3724/SP.J.1042.2025.1604](https://doi.org/10.3724/SP.J.1042.2025.1604) | Review of native Chinese-speaking children | Tone awareness and reading | Correlational, a few interventions | Early tone discrimination predicts later reading; intervention evidence only "hints" at causation | Abstract | L1 children; reading outcome; Mandarin evidence thinner than Cantonese | Tone perception is a core skill, but this says nothing about how to teach it to adults (#96) |
| E14 | "Chen", visual feedback with corrected audio in the learner's own voice (cited in #95) | — | — | — | — | Unverified | Not found in any search | Do not cite (#97) |

## C. Singapore (children, English-dominant homes)

| # | Source | Population | Learning task | Comparison | Outcome / delay | Evidence | Limitations | Product decision (issue) |
|---|---|---|---|---|---|---|---|---|
| E15 | MOE, [2010 MTL Review Committee executive summary](https://www.nas.gov.sg/archivesonline/data/pdfdoc/20110125002/exec_summary_combined.pdf) (Jan 2011) | Singapore primary to JC mother-tongue learners | Curriculum policy | None (recommendations) | Ethnic Chinese P1 entrants whose most-used home language is English: **28% (1991) to 59% (2010)**. For learners with little or no foundation, build oracy first, with "more systematic teaching of oral vocabulary and sentence structures"; authentic media; pinyin keyboard input alongside handwriting | Full text | Policy, not outcome data; school-age children | Oracy leads: listening and spoken sentence patterns come first, characters stay optional and separate, and constructions are taught as units in their own right (#102, #100) |
| E16 | 2004 CL Curriculum and Pedagogy Review: "about 50% of P1 entrants English-dominant in 2004" | — | — | — | — | Unverified (secondary news summary only) | Primary report not located; its 1994 baseline (36%) differs from the 2010 report's 1991 baseline | Cite 59% (2010) instead (#105) |
| E17 | MOE 2015 primary CL syllabus; 2024 MTL curriculum; 识写分流 / 多认少写 | Singapore primary | Syllabus | — | Search summaries describe tracked courses, four integrated skills, more games and media (2024). Reduced writing load could not be confirmed | Unverified (search summaries; primary PDFs not retrieved) | Not read | None. Do not claim Singapore reduced character writing (#102) |
| E18 | NIE, 以听促读 paper, [hdl 10497/13660](https://repository.nie.edu.sg/handle/10497/13660) | Singapore learners (details unknown) | Listening to support reading | Unknown | Reported help to reading comprehension, most at word level | Unverified (search summary; record not retrieved) | Title, authors, n and design unknown | Lead only (#102) |
| E19 | NIE, P1 pinyin for English-home pupils, [hdl 10497/1405](https://repository.nie.edu.sg/handle/10497/1405) | English-home P1 pupils | Pinyin | Unknown | Distinct difficulty with initials, finals, tones and syllables | Unverified (search summary) | Methods unknown | Lead: add segmental contrasts (initials and finals) as candidates after the tone pilot, not in it (#96) |
| E20 | Lin, Lim & Wu 2022, [doi:10.3390/educsci12030189](https://doi.org/10.3390/educsci12030189) | Lower-primary students (n unknown) | Character game app | Comparison and delay not verified | More interest; better character memory and use | Abstract | Developers evaluating their own app; reading, not listening | No bearing on listening design or on claims that a game format works (#103) |

## D. Mainland China and Hong Kong (native-speaker children)

| # | Source | Population | Learning task | Comparison | Outcome / delay | Evidence | Limitations | Product decision (issue) |
|---|---|---|---|---|---|---|---|---|
| E21 | MOE (China), 3-6岁儿童学习与发展指南, 2012 **consultation draft**, [copy](https://www.szys.net/upload/history/main/uploadfiles/dgzx/2015/12/201512221218311396.doc) | L1 children aged 3–6 | Policy goals | None | Oral language first; understand speech in context, including what different 语气 and 语调 express; rote early character learning is called unsuited to young children | Full text (draft) | Draft wording, not the final text; L1 children who already speak Mandarin | Organise by situation, and include tone-of-voice and attitude cues in listening, not only word meaning (#102) |
| E22 | 统编版 Grade 1 textbook (2016): a 识字 unit placed before the pinyin unit ([report](https://www.chinanews.com.cn/df/2016/08-31/7989345.shtml)) | L1 Grade 1 | Textbook design | None tested | Rationale reported: pinyin is a means, not the goal | Secondary | No empirical test; L1 | Consistent with pinyin as a scaffold that fades, as #95 already says; weak support (#100) |
| E23 | 义务教育语文课程标准 2022: Grade 1–2 "recognise ~1,600, write ~800" | L1 Grades 1–2 | Standard | — | — | Unverified (secondary summaries) | Official text not retrieved | None (#102) |
| E24 | Li, Corrie & Wong 2008 ([record](https://repository.eduhk.hk/en/publications/early-teaching-of-chinese-literacy-skills-and-later-literacy-outc-5/)); Li, Rao & Tse 2011 ([record](https://researchers.mq.edu.au/en/publications/bridging-the-gap-a-longitudinal-study-of-the-relationship-between/)) | 88 children in Beijing and Hong Kong, 3-year follow-up; 758 pupils in Hong Kong and Shenzhen, 1 school year | Early character literacy | **Observational**, no random assignment | Formal early literacy activities associated with later literacy; informal activities were not | Abstract | Site confounded with curriculum and teachers; L1 children; reading outcome | Not used for adult listening decisions. It does not show that input-based exposure is useless for an adult listener (#102) |
| E25 | 集中识字 vs 分散识字 vs 随文识字 / 字理识字 | — | — | — | — | Not found | No verified controlled comparison | None; do not block exercise work on this debate (#102) |

## E. Adult course-design reference

| # | Source | Population | Learning task | Comparison | Outcome / delay | Evidence | Limitations | Product decision (issue) |
|---|---|---|---|---|---|---|---|---|
| E26 | Wheatley, [*Learning Chinese: A Foundation Course in Mandarin*](https://ocw.mit.edu/courses/res-21g-003-learning-chinese-a-foundation-course-in-mandarin-spring-2011/), MIT OCW | Adult beginners | Course sequence | None | Sounds and tones first; tone combinations taught in small sets across Units 1–3; "Tài with le" (太…了) in Unit 2, after stative verbs and stative verb + 了 in Unit 1; a character module trails the spoken units | Table of contents read in full; lessons not read | Lesson bodies not read; sandhi treatment known only from headings | Drill tone pairs in small sets drawn from the scene's own words (#96). Place 太…了 after 很 + adjective, i.e. after s10 (#99, #102). Keep characters decoupled (#102) |

## F. Technical facts carried into #97 and #98

| # | Item | Evidence | Fact | Decision (issue) |
|---|---|---|---|---|
| E27 | [Pitchy](https://github.com/ianprime0509/pitchy) | Full text (licence and repo) | 0BSD; McLeod Pitch Method; pure JS ES module; designed for tuning instruments, with no tone-contour tracking | Usable licence; robustness on creaky or low voices must be tested before use (#97) |
| E28 | [buddy-pronunciation-onnx](https://huggingface.co/asingingbird/buddy-pronunciation-onnx) `zh/v1` | Full text (model card and vocab) | ~358 MB INT8 ONNX, Apache-2.0. A format conversion of the **multilingual** espeak-based `wav2vec2-xlsr-53-espeak-cv-ft`, not a Mandarin-trained model. Its 4.3% phone error rate is on an English CMUdict set, not a Mandarin tone benchmark | Do not present it as a Mandarin tone recogniser. Any spike measures tone accuracy on learner speech first (#98) |
| E29 | [charsiu-js models](https://huggingface.co/mnaoizyyy/charsiu-js-models) | Full text (model card and API sizes) | Forced aligners (need the known transcript), not recognisers; `zh_w2v2_tiny` ~40 MB, `zh_xlsr` ~357 MB | Alignment only; never a tone grader (#98) |
| E30 | AISHELL-2, [arXiv:1808.10583](https://arxiv.org/abs/1808.10583) | Abstract; licence terms secondary | Free for academic use; secondary reports say non-commercial research or education only | No product training or shipping without written permission; never commit its audio (#98) |

## What transfers from children's materials to an adult listener

**Transfers:**

- **Oracy before literacy for learners with no foundation** (E15, E21). Singapore's
  English-home children are the closest school analogue to this learner: little Chinese
  at home, English dominant. The official response was oral vocabulary and sentence
  structures first.
- **Systematic spoken sentence patterns**, not only word lists (E15). The course's
  constructions are the right unit; they need their own skill identity (#100).
- **Situation-bound comprehension, including tone of voice** (E21). TV dialogue carries
  attitude in intonation and particles, which word-meaning quizzes miss.
- **Pinyin as a scaffold, not a gate** (E22, E26). Both the mainland textbook rationale and
  the adult course demote it to a tool.

**Does not transfer:**

- **Literacy outcomes.** E23 and E24 measure character reading in native children. This
  learner's goal is listening, and writing can be dropped entirely.
- **The starting point.** The 指南 (E21) is written for children who already understand
  spoken Mandarin. Even Singapore's English-home children have more ambient exposure than
  this adult. Children's sequencing assumes years of input this learner does not have.
- **Play formats as evidence.** Songs, rhymes and app games (E17, E20) are recommended
  for engagement, but no effect on listening was found. Adults also learn well from input
  and explicit explanation (E4), so the game can explain rather than only drill.
- **Unverified policy claims.** Reduced writing load (多认少写 / 识写分流) and the 2004 50%
  figure (E16, E17) were not confirmed from primary sources and are not cited as fact.

## Not found / unresolved

These are acceptable results, and none of them blocks exercise work.

- A controlled or quasi-experimental comparison of 集中识字 and 分散识字 (E25).
- Primary text for 多认少写 / 识写分流, the 2015 Singapore syllabus, the 2024 MTL
  curriculum and the 2022 课标 (E17, E23). Several MOE school and NIE pages refused
  automated fetches; a manual browser fetch is the next step.
- How pinyin is actually taught in mainland or Singapore classrooms. Only a 2000-era
  release saying P1 learns pinyin for about ten weeks before characters (search summary,
  unverified) and the 2016 textbook report (E22) were found.
- Efficacy of tone mnemonics (标调歌), 情境图 or 儿歌 for tone teaching.
- Yanagisawa's receptive/productive result (E3) and the "Chen" own-voice feedback study
  (E14), both cited in #95.
- Exact Kim & Webb effect sizes (E1) and the Dong et al. retention interval (E6).
- Any adult study of learning to follow connected Mandarin TV dialogue, and any validated
  measure of a tone recogniser's accuracy on learner speech.

## Where the evidence differs from #95 and #105

- **#95 cites Yanagisawa (n = 18)**, and **#95 cites a study that combined visual feedback
  with corrected audio in the learner's own voice**. Neither could be located (E3, E14).
  The design principles they support stand on reasoning, not on these citations.
- **#105 lists "about half of P1 entrants were English-speaking in 2004" and "the
  character-writing load was reduced"** as prior art. Neither is verified (E16, E17).
  The verified figure is 59% in 2010 (E15).
- **#95 says a comprehension course "might" need multiple voices.** E6 found that
  low-variability training still transferred to untrained voices. Multiple voices remain
  necessary for any *claim* of cross-voice comprehension (`voiceTransferClaim: false`),
  but they are not shown to be necessary for *learning*.
- Everything else checked (Kang et al.'s 2-day delay, Dong et al.'s null result for
  high variability, gestures as optional and perception-only, visual feedback as
  experimental) matches #95.

## Decisions

1. Keep FSRS spacing across sessions, but do not justify or tune it as "expanding
   spacing", because equal and expanding spacing were equivalent (E1; #101).
2. Report learning on delayed probes (about 1 and 7 days) rather than in-session accuracy,
   because longer spacing wins only on delayed tests (E1; #103).
3. Record retrieval (respond before hearing the model) and imitation (repeat after it) as
   separate events and skills, and never let imitation advance retrieval mastery (E2; #100,
   #101).
4. Treat a correct three-option recognition answer as weaker evidence than recall: it never
   produces `Easy` and never substitutes for a recall skill (E4; #101, #100).
5. Run the tone-perception pilot on the existing single-voice recordings, testing on
   untrained items and claiming nothing about other voices (E6, E7; #96, #103).
6. Any tone visual or gesture aid traces pitch, is optional, and never illustrates word
   meaning during tone work (E8, E9; #96).
7. Make no production claim for gestures, and keep microphone pitch display as
   experimental record-and-compare on isolated syllables or chosen words (E10, E11, E12;
   #97).
8. Evaluate any pronunciation coach with independent raters, never with its own score,
   because the only multi-week visual-feedback study had no control group (E11; #103).
9. Do not describe or ship the buddy ONNX model as a Mandarin tone recogniser; any ML
   spike first measures tone accuracy on learner speech (E28, E29; #98).
10. Lead every situation with listening and spoken sentence patterns, and keep characters
    as the existing optional, separate activity (E15, E21, E26; #102).
11. Give constructions their own skill identity instead of crediting them through word
    targets (E15; #100).
12. Include intonation and attitude cues (语气) in situational listening, not only
    word-to-English matching (E21; #102).
13. Drill tone pairs in small sets taken from the current scene's vocabulary rather than
    from an abstract tone chart (E26; #96).
14. Place the 太…了 lesson after 很 + adjective (s10), which matches the adult course's
    order (E26; #99, #102).
15. Add initial/final contrasts only as a follow-up candidate after the tone pilot, since
    the evidence is a search summary (E19; #96).
16. Do not use children's literacy studies to argue for or against any adult listening
    mechanic (E23, E24; #102).
17. In product text and PRs, cite 59% (2010), and do not cite the 2004 50% figure,
    多认少写, Yanagisawa or the own-voice feedback study until they are verified (E3, E14,
    E16, E17; #105).
