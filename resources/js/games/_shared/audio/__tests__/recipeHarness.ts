import type { SynthRecipe, SynthVoice } from '../synthSfx'

export interface VoiceCall { kind: 'tone' | 'noise', from: number, to: number, duration: number, gain: number, end: number }

/** Runs a recipe against a recording voice; `context`/`output` are only for continuous or custom voices. */
export function recordRecipe(recipe: SynthRecipe, intensity?: number): VoiceCall[] {
  const calls: VoiceCall[] = []
  // A stand-in audio graph: every property and call returns the graph, numbers read as 0.
  const graph: object = new Proxy(function node() {}, {
    get: (_target, key) => key === 'currentTime' ? 0 : graph,
    apply: () => graph,
    set: () => true,
  })
  const voice: SynthVoice = {
    context: graph as AudioContext,
    output: graph as AudioNode,
    tone: (from, to, duration, _type, gain, delay = 0) => { calls.push({ kind: 'tone', from, to, duration, gain, end: delay + duration }) },
    noise: (duration, gain, frequency, { delay = 0, sweepTo } = {}) => { calls.push({ kind: 'noise', from: frequency, to: sweepTo ?? frequency, duration, gain, end: delay + duration }) },
  }
  recipe(voice, intensity)
  return calls
}
