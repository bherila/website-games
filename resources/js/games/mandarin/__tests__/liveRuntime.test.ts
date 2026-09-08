import courseJson from '../../../../data/mandarin/foundations.v1.json'
import { HttpMandarinGateway } from '../adapters/HttpMandarinGateway'
import { createLocalStore, livePartitionPrefix, PREVIEW_STORAGE_PREFIX } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { createLiveRuntime } from '../runtime/liveRuntime'

function fetchFor(signedIn: boolean): typeof fetch {
  return async () => new Response(JSON.stringify({
    runtime: 'live', course: courseJson,
    account: { signedIn, accountPartitionId: signedIn ? 'user:42' : null },
    capabilities: { canGenerateAudio: false, canSaveToAccount: signedIn, hasDistinctMandarinVoices: false },
    audio: { courseId: 'mandarin-foundations', contentVersion: '1.1.1', results: [] }, serverTime: 'x',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('live runtime', () => {
  it('bootstraps once, exposes no scenario, and partitions local state by account', async () => {
    let fetches = 0
    const fetchImpl: typeof fetch = async (input, init) => { fetches += 1; return fetchFor(true)(input, init) }
    const gateway = new HttpMandarinGateway({ fetch: fetchImpl, csrfToken: () => null })
    const runtime = await createLiveRuntime({ gateway, speechSynthesis: null, sfx: NULL_SFX_PLAYER })
    expect(runtime.scenario).toBeNull()
    expect(runtime.course.identity.courseId).toBe('mandarin-foundations')
    await runtime.gateway.bootstrap()
    expect(fetches).toBe(2)
    expect(livePartitionPrefix('user:42')).toBe('mandarin.live.user_42.')
    expect(livePartitionPrefix(null)).toBe('mandarin.live.guest.')
    expect(livePartitionPrefix('user:42').startsWith(PREVIEW_STORAGE_PREFIX)).toBe(false)
    runtime.dispose()
  })

  it('keeps guest and account partitions separate in the same storage', () => {
    const map = new Map<string, string>()
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) }, key: (i: number) => [...map.keys()][i] ?? null, get length() { return map.size } }
    const guest = createLocalStore(storage, livePartitionPrefix(null))
    const account = createLocalStore(storage, livePartitionPrefix('user:42'))
    guest.saveProgress({ who: 'guest' })
    account.saveProgress({ who: 'account' })
    expect(guest.loadProgress()).toEqual({ who: 'guest' })
    expect(account.loadProgress()).toEqual({ who: 'account' })
    account.clearAll()
    expect(guest.loadProgress()).toEqual({ who: 'guest' })
    expect(account.loadProgress()).toBeNull()
  })
})
