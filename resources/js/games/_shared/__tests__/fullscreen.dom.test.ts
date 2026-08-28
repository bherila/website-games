import {
  exitAppFullscreen,
  isFullscreenActive,
  isFullscreenSupported,
  isStandaloneDisplayMode,
  requestAppFullscreen,
  subscribeFullscreenChange,
} from '../fullscreen'

function fakeWindow(overrides: { standaloneMedia?: boolean; navigatorStandalone?: boolean }): Window {
  return {
    matchMedia: jest.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)' && overrides.standaloneMedia === true,
      media: query,
    })),
    navigator: { standalone: overrides.navigatorStandalone },
  } as unknown as Window
}

describe('fullscreen helpers', () => {
  it('detects support via the standard and webkit-prefixed flags', () => {
    expect(isFullscreenSupported({} as Document)).toBe(false)
    expect(isFullscreenSupported({ fullscreenEnabled: true } as Document)).toBe(true)
    expect(isFullscreenSupported({ webkitFullscreenEnabled: true } as unknown as Document)).toBe(true)
  })

  it('detects standalone display mode via media query or iOS navigator flag', () => {
    expect(isStandaloneDisplayMode(fakeWindow({}))).toBe(false)
    expect(isStandaloneDisplayMode(fakeWindow({ standaloneMedia: true }))).toBe(true)
    expect(isStandaloneDisplayMode(fakeWindow({ navigatorStandalone: true }))).toBe(true)
  })

  it('reports active state from either fullscreen element property', () => {
    expect(isFullscreenActive({} as Document)).toBe(false)
    expect(isFullscreenActive({ fullscreenElement: {} } as Document)).toBe(true)
    expect(isFullscreenActive({ webkitFullscreenElement: {} } as unknown as Document)).toBe(true)
  })

  it('prefers the standard request API and falls back to the webkit one', async () => {
    const requestFullscreen = jest.fn().mockResolvedValue(undefined)
    const webkitRequestFullscreen = jest.fn()
    await requestAppFullscreen({ requestFullscreen, webkitRequestFullscreen } as unknown as Element)
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
    expect(webkitRequestFullscreen).not.toHaveBeenCalled()

    await requestAppFullscreen({ webkitRequestFullscreen } as unknown as Element)
    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('swallows request rejections instead of throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const requestFullscreen = jest.fn().mockRejectedValue(new Error('denied'))
    await expect(requestAppFullscreen({ requestFullscreen } as unknown as Element)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('prefers the standard exit API and falls back to the webkit one', async () => {
    const exitFullscreen = jest.fn().mockResolvedValue(undefined)
    const webkitExitFullscreen = jest.fn()
    await exitAppFullscreen({ exitFullscreen, webkitExitFullscreen } as unknown as Document)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(webkitExitFullscreen).not.toHaveBeenCalled()

    await exitAppFullscreen({ webkitExitFullscreen } as unknown as Document)
    expect(webkitExitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('subscribes to both change event names and unsubscribes cleanly', () => {
    const addEventListener = jest.fn()
    const removeEventListener = jest.fn()
    const doc = { addEventListener, removeEventListener } as unknown as Document
    const callback = () => {}

    const unsubscribe = subscribeFullscreenChange(callback, doc)
    expect(addEventListener).toHaveBeenCalledWith('fullscreenchange', callback)
    expect(addEventListener).toHaveBeenCalledWith('webkitfullscreenchange', callback)

    unsubscribe()
    expect(removeEventListener).toHaveBeenCalledWith('fullscreenchange', callback)
    expect(removeEventListener).toHaveBeenCalledWith('webkitfullscreenchange', callback)
  })
})
