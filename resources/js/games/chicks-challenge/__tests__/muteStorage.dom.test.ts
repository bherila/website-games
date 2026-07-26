import { loadMuted, saveMuted } from '../audio/muteStorage'

describe('muteStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to unmuted when nothing is stored', () => {
    expect(loadMuted()).toBe(false)
  })

  it('round-trips a saved true/false value', () => {
    saveMuted(true)
    expect(loadMuted()).toBe(true)

    saveMuted(false)
    expect(loadMuted()).toBe(false)
  })

  it('defaults to unmuted on corrupt JSON', () => {
    window.localStorage.setItem('bwh.chicks-challenge.muted.v1', '{not json')
    expect(loadMuted()).toBe(false)
  })

  it('defaults to unmuted on an unexpected value shape', () => {
    window.localStorage.setItem('bwh.chicks-challenge.muted.v1', '"yes"')
    expect(loadMuted()).toBe(false)

    window.localStorage.setItem('bwh.chicks-challenge.muted.v1', '1')
    expect(loadMuted()).toBe(false)
  })
})
