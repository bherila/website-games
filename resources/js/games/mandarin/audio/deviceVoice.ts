/**
 * Optional, clearly labelled device-voice preview. A browser voice is only
 * used when its language is Mandarin; English speech is never substituted.
 */

export interface SpeechSynthesisLike {
  getVoices(): SpeechSynthesisVoice[]
  speak(utterance: SpeechSynthesisUtterance): void
  cancel(): void
  readonly speaking: boolean
  addEventListener?(type: 'voiceschanged', listener: () => void): void
  removeEventListener?(type: 'voiceschanged', listener: () => void): void
}

const MANDARIN_LANG = /^(zh|cmn)([-_]|$)/i
const PREFERRED = [/^zh[-_]cn$/i, /^cmn[-_]hans/i, /^zh[-_]hans/i, /^zh[-_]tw$/i, /^cmn/i, /^zh/i]

export function isMandarinVoice(voice: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  return MANDARIN_LANG.test(voice.lang)
}

/** Best available Mandarin voice, or null when the device has none. */
export function findMandarinVoice(synth: SpeechSynthesisLike | null): SpeechSynthesisVoice | null {
  if (!synth) return null
  let voices: SpeechSynthesisVoice[]
  try {
    voices = synth.getVoices()
  } catch {
    return null
  }
  const mandarin = voices.filter(isMandarinVoice)
  for (const pattern of PREFERRED) {
    const match = mandarin.find((voice) => pattern.test(voice.lang))
    if (match) return match
  }
  return null
}

export function browserSpeechSynthesis(): SpeechSynthesisLike | null {
  if (typeof window === 'undefined') return null
  try {
    return window.speechSynthesis ?? null
  } catch {
    return null
  }
}

/** Voices load asynchronously on some platforms; re-run detection when they change. */
export function watchVoices(synth: SpeechSynthesisLike | null, onChange: () => void): () => void {
  if (!synth || !synth.addEventListener) return () => {}
  synth.addEventListener('voiceschanged', onChange)
  return () => synth.removeEventListener?.('voiceschanged', onChange)
}
