import { clearGamePwaSession } from '../cacheCleanup'
import {
  GAME_CACHE_PREFIX,
  LAST_AUTHENTICATED_USER_KEY,
} from '../serviceWorkerPolicy'

describe('game PWA logout cleanup', () => {
  const originalCaches = window.caches

  afterEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: originalCaches,
    })
  })

  it('removes account identity and every game Cache Storage entry', async () => {
    const deleteCache = jest.fn().mockResolvedValue(true)
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        delete: deleteCache,
        keys: jest.fn().mockResolvedValue([
          `${GAME_CACHE_PREFIX}shells-old`,
          `${GAME_CACHE_PREFIX}assets-old`,
          'unrelated-cache',
        ]),
      },
    })
    window.localStorage.setItem(LAST_AUTHENTICATED_USER_KEY, '7')

    await clearGamePwaSession()

    expect(window.localStorage.getItem(LAST_AUTHENTICATED_USER_KEY)).toBeNull()
    expect(deleteCache).toHaveBeenCalledTimes(2)
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache')
  })
})
