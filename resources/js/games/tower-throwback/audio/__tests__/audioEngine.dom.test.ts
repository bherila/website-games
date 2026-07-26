// The repo tsconfig excludes node typings ("types": []); this ambient declare
// scopes the fresh-module require to this jsdom test.
declare const require: (id: '../audioEngine') => typeof import('../audioEngine')

describe('audioEngine — blocked localStorage', () => {
  it('imports and works when the localStorage getter throws (SecurityError)', () => {
    jest.isolateModules(() => {
      const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError')
        },
      })
      try {
        // The regression: module-scope loadMuted() used to crash the whole
        // bundle at import time when storage access throws.

        const engine = require('../audioEngine')
        expect(engine.isAudioMuted()).toBe(false) // blocked storage → default unmuted
        engine.setAudioMuted(true) // persists nowhere, but must not throw
        expect(engine.isAudioMuted()).toBe(true)
        engine.setAudioMuted(false)
        expect(engine.isAudioMuted()).toBe(false)
      } finally {
        if (original) {
          Object.defineProperty(window, 'localStorage', original)
        }
      }
    })
  })

  it('reads the persisted preference when storage is available', () => {
    jest.isolateModules(() => {
      window.localStorage.setItem('bwh.tower-throwback.audio-muted.v1', '1')

      const engine = require('../audioEngine')
      expect(engine.isAudioMuted()).toBe(true)
      engine.setAudioMuted(false)
      expect(window.localStorage.getItem('bwh.tower-throwback.audio-muted.v1')).toBe('0')
      window.localStorage.clear()
    })
  })
})

describe('audioEngine — master volume level', () => {
  const LEVEL_KEY = 'bwh.tower-throwback.audio-level.v1'

  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults to full volume when nothing is persisted', () => {
    jest.isolateModules(() => {
      const engine = require('../audioEngine')
      expect(engine.getAudioLevel()).toBe(1)
    })
  })

  it('persists the level and restores it across a fresh module init', () => {
    jest.isolateModules(() => {
      const engine = require('../audioEngine')
      engine.setAudioLevel(0.4)
      expect(engine.getAudioLevel()).toBe(0.4)
      expect(window.localStorage.getItem(LEVEL_KEY)).toBe('0.4')
    })

    jest.isolateModules(() => {
      const engine = require('../audioEngine')
      expect(engine.getAudioLevel()).toBe(0.4)
    })
  })

  it('clamps the level into [0,1] and ignores NaN', () => {
    jest.isolateModules(() => {
      const engine = require('../audioEngine')
      engine.setAudioLevel(2)
      expect(engine.getAudioLevel()).toBe(1)
      engine.setAudioLevel(-0.5)
      expect(engine.getAudioLevel()).toBe(0)
      engine.setAudioLevel(Number.NaN)
      expect(engine.getAudioLevel()).toBe(1)
    })
  })

  it('preserves the stored level across mute → unmute', () => {
    jest.isolateModules(() => {
      const engine = require('../audioEngine')
      engine.setAudioLevel(0.3)
      engine.setAudioMuted(true)
      expect(engine.getAudioLevel()).toBe(0.3) // mute never overwrites the level
      engine.setAudioMuted(false)
      expect(engine.getAudioLevel()).toBe(0.3) // unmuting returns to the prior level, not 1
    })
  })

  it('restores a clamped level from a malformed persisted value', () => {
    jest.isolateModules(() => {
      window.localStorage.setItem(LEVEL_KEY, '9')
      const engine = require('../audioEngine')
      expect(engine.getAudioLevel()).toBe(1)
    })
  })

  it('no-ops without throwing when storage access is blocked', () => {
    jest.isolateModules(() => {
      const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError')
        },
      })
      try {
        const engine = require('../audioEngine')
        expect(engine.getAudioLevel()).toBe(1) // blocked storage → default full volume
        engine.setAudioLevel(0.25) // persists nowhere, but must not throw
        expect(engine.getAudioLevel()).toBe(0.25)
      } finally {
        if (original) {
          Object.defineProperty(window, 'localStorage', original)
        }
      }
    })
  })
})
