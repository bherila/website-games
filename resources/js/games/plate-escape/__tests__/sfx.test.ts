import type { SynthVoice } from '../../_shared/audio/synthSfx'
import { PLATE_SOUNDS } from '../sfx'

test.each(Object.entries(PLATE_SOUNDS))('%s is a short, quiet, audible sound', (_name, recipe) => {
  const calls: { duration: number, gain: number, end: number }[] = []
  const voice: SynthVoice = {
    tone: (from, to, duration, _type, gain, delay = 0) => {
      expect(Math.min(from, to)).toBeGreaterThanOrEqual(40)
      expect(Math.max(from, to)).toBeLessThanOrEqual(4000)
      calls.push({ duration, gain, end: delay + duration })
    },
    noise: (duration, gain, _frequency, _filter, delay = 0) => calls.push({ duration, gain, end: delay + duration }),
  }
  recipe(voice)
  expect(calls.length).toBeGreaterThan(0)
  // Toy-sized: nothing over 0.8 s, and no voice loud enough to clip the master gain.
  for (const call of calls) {
    expect(call.end).toBeLessThanOrEqual(0.8)
    expect(call.gain).toBeGreaterThan(0)
    expect(call.gain).toBeLessThanOrEqual(0.25)
  }
})
