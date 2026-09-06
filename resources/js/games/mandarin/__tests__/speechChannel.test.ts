import { createSpeechChannel } from '../audio/speechChannel'

class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  volume = 1
  preload = ''
  playImpl: () => Promise<void> = () => Promise.resolve()
  private readonly listeners = new Map<string, Set<() => void>>()
  constructor() { FakeAudio.instances.push(this) }
  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }
  removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener) }
  emit(type: string): void { for (const listener of this.listeners.get(type) ?? []) listener() }
  play(): Promise<void> { return this.playImpl() }
  pause(): void {}
  removeAttribute(): void {}
  load(): void {}
}

const asElement = (): HTMLAudioElement => new FakeAudio() as unknown as HTMLAudioElement

describe('speech channel', () => {
  beforeEach(() => { FakeAudio.instances = [] })

  it('interrupts an in-flight simulated play when a new one starts (no overlap)', async () => {
    jest.useFakeTimers()
    const channel = createSpeechChannel({ simulatedDurationMs: () => 1000 })
    const first = channel.play({ kind: 'simulated', text: '你好' })
    expect(channel.isPlaying()).toBe(true)
    const second = channel.play({ kind: 'simulated', text: '再见' })
    await expect(first).resolves.toBe('interrupted')
    jest.advanceTimersByTime(1000)
    await expect(second).resolves.toBe('simulated')
    expect(channel.isPlaying()).toBe(false)
    jest.useRealTimers()
  })

  it('reports blocked when the play promise is rejected with NotAllowedError, and failed otherwise', async () => {
    let nextPlay: () => Promise<void> = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    const channel = createSpeechChannel({
      createAudioElement: () => {
        const element = new FakeAudio()
        element.playImpl = nextPlay
        return element as unknown as HTMLAudioElement
      },
    })
    await expect(channel.play({ kind: 'ready', url: '/x.mp3', volume: 0.8 })).resolves.toBe('blocked')
    expect(channel.isPlaying()).toBe(false)
    nextPlay = () => Promise.reject(new Error('decode'))
    await expect(channel.play({ kind: 'ready', url: '/x.mp3', volume: 0.8 })).resolves.toBe('failed')
    expect(FakeAudio.instances[0]!.volume).toBe(0.8)
  })

  it('completes on ended, fails on error, and ignores stale callbacks', async () => {
    const channel = createSpeechChannel({ createAudioElement: asElement })
    const first = channel.play({ kind: 'ready', url: '/a.mp3', volume: 1 })
    const firstEl = FakeAudio.instances[0]!
    expect(firstEl.src).toBe('/a.mp3')
    firstEl.emit('ended')
    await expect(first).resolves.toBe('completed')
    const second = channel.play({ kind: 'ready', url: '/b.mp3', volume: 1 })
    const secondEl = FakeAudio.instances[1]!
    firstEl.emit('ended') // stale: must not resolve the second play
    expect(channel.isPlaying()).toBe(true)
    secondEl.emit('error')
    await expect(second).resolves.toBe('failed')
  })

  it('returns unavailable for device voice without a synthesiser and never speaks English', async () => {
    const channel = createSpeechChannel({ speechSynthesis: null })
    const voice = { lang: 'zh-CN', name: 'Ting-Ting' } as SpeechSynthesisVoice
    await expect(channel.play({ kind: 'device_voice', text: '你好', voice, rate: 1, volume: 1 })).resolves.toBe('unavailable')
  })

  it('stop() resolves the current play as interrupted and notifies subscribers', async () => {
    jest.useFakeTimers()
    const channel = createSpeechChannel({ simulatedDurationMs: () => 5000 })
    const states: boolean[] = []
    channel.subscribe((playing) => states.push(playing))
    const play = channel.play({ kind: 'simulated', text: 'x' })
    channel.stop()
    await expect(play).resolves.toBe('interrupted')
    expect(states).toEqual([true, false])
    jest.useRealTimers()
  })
})
