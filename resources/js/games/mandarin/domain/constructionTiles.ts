/**
 * Curated tile metadata for the sentence-construction exercises.
 *
 * Tiles in the course JSON carry only their characters, so this table supplies
 * the pinyin and gloss a hint needs, and the audio source a tap should play.
 * The mapping is written out rather than resolved by matching Chinese strings
 * at runtime: string matching breaks on punctuation, duplicate entries and
 * words that share a form but not a sense, and it would silently attach the
 * wrong recording rather than fail.
 *
 * `audio` is null where no curated recording covers the chunk. The support
 * glossary (请, 再, 一遍) has no audio sources at all — `AudioSourceRef` admits
 * only utterances and targets — so those three tiles stay silent until a
 * support source kind exists. Nothing here synthesises free text.
 */
import type { AudioSourceRef } from '../contracts/mandarin'

export interface ConstructionTile {
  pinyin: string
  /** Short gloss for hints: the sense used in this sentence, not every sense. */
  en: string
  audio: AudioSourceRef | null
}

function target(sourceId: string): AudioSourceRef {
  return { sourceKind: 'target', sourceId, variant: 'normal' }
}

export const CONSTRUCTION_TILES: Readonly<Record<string, ConstructionTile>> = {
  // g01 — 他是我的朋友。
  'g01-c1': { pinyin: 'tā', en: 'he', audio: target('he') },
  'g01-c2': { pinyin: 'shì', en: 'is', audio: target('be') },
  'g01-c3': { pinyin: 'wǒ de péngyou', en: 'my friend', audio: target('my-friend') },
  // g02 — 他在这里吗？
  'g02-c1': { pinyin: 'tā', en: 'he', audio: target('he') },
  'g02-c2': { pinyin: 'zài', en: 'is at', audio: target('at') },
  'g02-c3': { pinyin: 'zhèlǐ', en: 'here', audio: target('here') },
  'g02-c4': { pinyin: 'ma', en: 'the yes/no question particle', audio: target('question-ma') },
  // g03 — 好，我在这里等你。
  'g03-c1': { pinyin: 'hǎo', en: 'okay', audio: target('okay') },
  'g03-c2': { pinyin: 'wǒ', en: 'I', audio: target('i') },
  // No target covers this chunk, but utterance 05c is exactly 在这里 and is an
  // ordinary dialogue line, not a reserved checkpoint sentence. Both 在 and 这里
  // are introduced well before this exercise.
  'g03-c3': { pinyin: 'zài zhèlǐ', en: 'here', audio: { sourceKind: 'utterance', sourceId: '05c', variant: 'normal' } },
  'g03-c4': { pinyin: 'děng nǐ', en: 'wait for you', audio: target('wait-you') },
  // g04 — 请再说一遍。Three support-glossary chunks have no recording yet.
  'g04-c1': { pinyin: 'qǐng', en: 'please', audio: null },
  'g04-c2': { pinyin: 'zài', en: 'again', audio: null },
  'g04-c3': { pinyin: 'shuō', en: 'say', audio: target('say') },
  'g04-c4': { pinyin: 'yí biàn', en: 'one more time', audio: null },
  // g05 — 我们一起走吧。
  'g05-c1': { pinyin: 'wǒmen', en: 'we', audio: target('we') },
  'g05-c2': { pinyin: 'yìqǐ', en: 'together', audio: target('together') },
  'g05-c3': { pinyin: 'zǒu ba', en: 'let us go', audio: target('lets-go') },
}

export function tileMeta(tileId: string): ConstructionTile | null {
  return CONSTRUCTION_TILES[tileId] ?? null
}

/** "吗 — ma, the yes/no question particle", for use inside a hint sentence. */
export function describeTile(tileId: string, zh: string): string {
  const meta = tileMeta(tileId)
  return meta ? `${zh} — ${meta.pinyin}, ${meta.en}` : zh
}
