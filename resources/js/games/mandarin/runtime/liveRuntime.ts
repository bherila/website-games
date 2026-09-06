/**
 * Live composition root: HTTP gateway, real media resolver, account-partitioned
 * local store. Bootstraps once so the store can be bound to the account
 * partition before the first render; the gateway caches that bootstrap so the
 * game does not fetch it twice. Never reads the scenario query string.
 */
import { type HttpGatewayOptions,HttpMandarinGateway } from '../adapters/HttpMandarinGateway'
import { createLocalStore, livePartitionPrefix, type PreviewStore, safeLocalStorage } from '../adapters/previewStore'
import { createAudioManager } from '../audio/audioManager'
import { browserSpeechSynthesis, type SpeechSynthesisLike } from '../audio/deviceVoice'
import { createWebAudioSfxPlayer, NULL_SFX_PLAYER, type SfxPlayer } from '../audio/sfxRecipes'
import { createSpeechChannel, type SpeechChannelDeps } from '../audio/speechChannel'
import { buildCourseIndex } from '../domain/course'
import { randomId } from '../domain/random'
import { parseSettings } from '../domain/settings'
import type { MandarinRuntime } from './MandarinRuntime'

export interface LiveRuntimeOptions {
  gateway?: HttpMandarinGateway
  gatewayOptions?: HttpGatewayOptions
  store?: PreviewStore
  speechSynthesis?: SpeechSynthesisLike | null
  sfx?: SfxPlayer
  channelDeps?: SpeechChannelDeps
  now?: () => Date
}

export async function createLiveRuntime(options: LiveRuntimeOptions = {}): Promise<MandarinRuntime> {
  const gateway = options.gateway ?? new HttpMandarinGateway(options.gatewayOptions)
  const bootstrap = gateway.cachedBootstrap() ?? (await gateway.bootstrap())
  const course = buildCourseIndex(bootstrap.course)
  const store = options.store ?? createLocalStore(safeLocalStorage(), livePartitionPrefix(bootstrap.account.accountPartitionId))
  const settings = parseSettings(store.loadSettings())
  const now = options.now ?? (() => new Date())
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
  })
  return {
    course,
    gateway,
    audio,
    store,
    scenario: null,
    clientInstanceId: store.clientInstanceId(() => randomId('client')),
    sessionId: randomId('session'),
    now,
    dispose() {
      audio.dispose()
    },
  }
}
