/**
 * Preview composition root. This is the ONLY place that reads the
 * `?scenario=` selector and constructs mocks. A future `liveRuntime.ts` builds
 * the HTTP gateway and real media resolver against the same `MandarinRuntime`
 * shape without touching `ui/`.
 */
import { MockMandarinGateway } from '../adapters/MockMandarinGateway'
import { type PreviewScenario, resolvePreviewScenarioFromSearch } from '../adapters/previewScenarios'
import { createLocalPreviewStore, type PreviewStore, safeLocalStorage } from '../adapters/previewStore'
import { createAudioManager } from '../audio/audioManager'
import { browserSpeechSynthesis, type SpeechSynthesisLike } from '../audio/deviceVoice'
import { createWebAudioSfxPlayer, NULL_SFX_PLAYER, type SfxPlayer } from '../audio/sfxRecipes'
import { createSpeechChannel, type SpeechChannelDeps } from '../audio/speechChannel'
import { loadCourse } from '../domain/course'
import { randomId } from '../domain/random'
import { parseSettings } from '../domain/settings'
import type { MandarinRuntime } from './MandarinRuntime'

export interface PreviewRuntimeOptions {
  search?: string
  scenario?: PreviewScenario
  store?: PreviewStore
  speechSynthesis?: SpeechSynthesisLike | null
  sfx?: SfxPlayer
  channelDeps?: SpeechChannelDeps
  appendDelayMs?: number
  maxPolls?: number
  minPollDelayMs?: number
  maxPollDelayMs?: number
  now?: () => Date
}

export function createPreviewRuntime(options: PreviewRuntimeOptions = {}): MandarinRuntime {
  const course = loadCourse()
  const scenario = options.scenario ?? resolvePreviewScenarioFromSearch(options.search ?? (typeof window === 'undefined' ? '' : window.location.search))
  const store = options.store ?? createLocalPreviewStore(safeLocalStorage())
  const settings = parseSettings(store.loadSettings())
  const now = options.now ?? (() => new Date())
  const seedCompleted = scenario.seedProgress === 'returning'
    ? course.nodes.filter((node) => node.sceneId === 's1' || node.sceneId === 's2').map((node) => node.id)
    : []
  const gateway = new MockMandarinGateway(course, scenario, {
    now,
    seedCompletedNodeIds: seedCompleted,
    ...(options.appendDelayMs !== undefined ? { appendDelayMs: options.appendDelayMs } : {}),
  })
  const speechSynthesis = options.speechSynthesis === undefined ? browserSpeechSynthesis() : options.speechSynthesis
  const channel = createSpeechChannel({ speechSynthesis, ...options.channelDeps })
  const sfx = options.sfx ?? (typeof window === 'undefined' ? NULL_SFX_PLAYER : createWebAudioSfxPlayer())
  const audio = createAudioManager({
    gateway,
    course,
    channel,
    sfx,
    speechSynthesis,
    settings: { speechVolume: settings.speechVolume, sfxVolume: settings.sfxVolume, deviceVoicePreview: settings.deviceVoicePreview },
    deviceVoicesDisabled: scenario.deviceVoice === 'none',
    ...(options.maxPolls !== undefined ? { maxPolls: options.maxPolls } : {}),
    ...(options.minPollDelayMs !== undefined ? { minPollDelayMs: options.minPollDelayMs } : {}),
    ...(options.maxPollDelayMs !== undefined ? { maxPollDelayMs: options.maxPollDelayMs } : {}),
  })
  return {
    course,
    gateway,
    audio,
    store,
    scenario,
    clientInstanceId: store.clientInstanceId(() => randomId('client')),
    sessionId: randomId('session'),
    now,
    resetState() {
      gateway.reset()
    },
    dispose() {
      audio.dispose()
    },
  }
}
