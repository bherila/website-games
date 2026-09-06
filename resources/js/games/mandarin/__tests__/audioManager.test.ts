import { MockMandarinGateway } from '../adapters/MockMandarinGateway'
import { findPreviewScenario } from '../adapters/previewScenarios'
import { type AudioManager, createAudioManager } from '../audio/audioManager'
import { NULL_SFX_PLAYER, type SfxPlayer } from '../audio/sfxRecipes'
import { createSpeechChannel } from '../audio/speechChannel'
import type { AudioSourceRef } from '../contracts/mandarin'
import { loadCourse } from '../domain/course'

const course = loadCourse()
const source: AudioSourceRef = { sourceKind: 'utterance', sourceId: '01a', variant: 'normal' }

function manager(scenarioId: string, options: { maxPolls?: number; sfx?: SfxPlayer; simulatedMs?: number } = {}): AudioManager {
  const gateway = new MockMandarinGateway(course, findPreviewScenario(scenarioId))
  return createAudioManager({
    gateway,
    course,
    channel: createSpeechChannel({ speechSynthesis: null, simulatedDurationMs: () => options.simulatedMs ?? 5 }),
    sfx: options.sfx ?? NULL_SFX_PLAYER,
    speechSynthesis: null,
    settings: { speechVolume: 1, sfxVolume: 1, deviceVoicePreview: true },
    maxPolls: options.maxPolls ?? 3,
    minPollDelayMs: 1,
    maxPollDelayMs: 5,
  })
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))

async function waitFor(check: () => boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (check()) return
    await flush()
  }
  throw new Error('condition not met')
}

describe('audio manager', () => {
  it('resolves to a simulated preview and plays through the channel', async () => {
    const audio = manager('fresh')
    audio.ensure([source])
    expect(audio.getStatus(source).phase).toBe('resolving')
    await waitFor(() => audio.getStatus(source).phase === 'settled')
    expect(audio.getStatus(source).resolution?.state).toBe('preview')
    expect(audio.getStatus(source).effectiveDelivery).toBe('simulated')
    await expect(audio.play(source)).resolves.toBe('simulated')
    audio.dispose()
  })

  it('returns unavailable when asked to play before resolution', async () => {
    const audio = manager('providerUnavailable')
    await expect(audio.play(source)).resolves.toBe('unavailable')
    await waitFor(() => audio.getStatus(source).phase === 'settled')
    expect(audio.getStatus(source).resolution).toMatchObject({ state: 'unavailable', retryable: false })
    audio.dispose()
  })

  it('bounds polling and turns an endless queue into a retryable failure', async () => {
    const audio = manager('queuedAudio', { maxPolls: 2 })
    audio.ensure([source])
    await waitFor(() => audio.getStatus(source).resolution?.state === 'failed')
    const status = audio.getStatus(source)
    expect(status.pollCount).toBe(2)
    expect(status.resolution).toMatchObject({ state: 'failed', retryable: true })
    audio.dispose()
  })

  it('walks queued → generating → preview then plays', async () => {
    const audio = manager('readyAudio')
    const seen: string[] = []
    audio.subscribe(() => {
      const state = audio.getStatus(source).resolution?.state
      if (state && seen.at(-1) !== state) seen.push(state)
    })
    audio.ensure([source])
    await waitFor(() => audio.getStatus(source).resolution?.state === 'preview')
    expect(seen).toEqual(['queued', 'generating', 'preview'])
    await expect(audio.play(source)).resolves.toBe('simulated')
    audio.dispose()
  })

  it('recovers from a retryable failure through explicit retry only', async () => {
    const audio = manager('retryableError')
    audio.ensure([source])
    await waitFor(() => audio.getStatus(source).resolution?.state === 'failed')
    await flush()
    expect(audio.getStatus(source).resolution?.state).toBe('failed')
    audio.retry(source)
    await waitFor(() => audio.getStatus(source).resolution?.state === 'preview')
    audio.dispose()
  })

  it('marks transport failures as retryable and never fabricates a resolution', async () => {
    const audio = manager('offline')
    audio.ensure([source])
    await waitFor(() => audio.getStatus(source).phase === 'settled')
    expect(audio.getStatus(source).transportError).toBe('Failed to fetch')
    expect(audio.getStatus(source).resolution).toMatchObject({ state: 'failed', retryable: true })
    audio.dispose()
  })

  it('interrupts on rapid replay and stops on navigation', async () => {
    const audio = manager('fresh', { simulatedMs: 200 })
    audio.ensure([source])
    await waitFor(() => audio.getStatus(source).phase === 'settled')
    const first = audio.play(source)
    const second = audio.play(source)
    await expect(first).resolves.toBe('interrupted')
    expect(audio.isSpeaking()).toBe(true)
    audio.stop()
    await expect(second).resolves.toBe('interrupted')
    expect(audio.isSpeaking()).toBe(false)
    audio.dispose()
  })

  it('does not play SFX over speech', async () => {
    const played: string[] = []
    const sfx: SfxPlayer = { play: (id) => { played.push(id) }, unlock: () => {}, available: () => true, dispose: () => {} }
    const audio = manager('fresh', { sfx, simulatedMs: 200 })
    audio.ensure([source])
    await waitFor(() => audio.getStatus(source).phase === 'settled')
    const play = audio.play(source)
    audio.playSfx('ui-tap')
    expect(played).toEqual([])
    audio.stop()
    await play
    audio.playSfx('ui-tap')
    expect(played).toEqual(['soft-wood-tap-v1'])
    audio.dispose()
  })

  it('reports no device voice when the synthesiser has only English voices', () => {
    const synth = { getVoices: () => [{ lang: 'en-US', name: 'Samantha' } as SpeechSynthesisVoice], speak: () => {}, cancel: () => {}, speaking: false }
    const audio = createAudioManager({
      gateway: new MockMandarinGateway(course, findPreviewScenario('fresh')),
      course,
      channel: createSpeechChannel({ speechSynthesis: synth }),
      sfx: NULL_SFX_PLAYER,
      speechSynthesis: synth,
      settings: { speechVolume: 1, sfxVolume: 1, deviceVoicePreview: true },
    })
    expect(audio.deviceVoiceStatus()).toEqual({ available: false, name: null })
    audio.dispose()
  })
})
