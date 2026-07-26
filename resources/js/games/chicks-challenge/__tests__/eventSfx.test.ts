import { sfxForEvents } from '../audio/eventSfx'
import type { SfxName } from '../audio/sfx'
import { SFX_NAMES } from '../audio/sfx'
import type { EngineEvent } from '../engine/types'

const AT = { x: 0, y: 0 }

function events(...list: EngineEvent[]): EngineEvent[] {
  return list
}

describe('SFX_NAMES', () => {
  it('contains every name the spec requires, with no duplicates', () => {
    const required: readonly SfxName[] = [
      'step', 'bump', 'pickup-chip', 'pickup-key', 'pickup-boot', 'door-open', 'socket-open',
      'block-push', 'splash', 'teleport', 'button-press', 'toggle', 'tank-reverse', 'clone',
      'thief', 'monster-drowned', 'death-drowned', 'death-burned', 'death-monster', 'win', 'stuck',
    ]
    for (const name of required) {
      expect(SFX_NAMES).toContain(name)
    }
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length)
  })
})

describe('sfxForEvents', () => {
  it('maps a plain step', () => {
    expect(sfxForEvents(events({ type: 'playerMoved', from: AT, to: AT, forced: false }))).toEqual(['step'])
  })

  it('maps a rejected move to bump', () => {
    expect(sfxForEvents(events({ type: 'bumped', at: AT, dir: 'up' }))).toEqual(['bump'])
  })

  it('collapses a multi-tile forced slide into one step, not one per tile', () => {
    const slide = events(
      { type: 'playerMoved', from: AT, to: AT, forced: false },
      { type: 'playerMoved', from: AT, to: AT, forced: true },
      { type: 'playerMoved', from: AT, to: AT, forced: true },
    )
    expect(sfxForEvents(slide)).toEqual(['step'])
  })

  it('maps pickups by tile kind', () => {
    expect(sfxForEvents(events({ type: 'pickedUp', at: AT, tile: 'chip' }))).toEqual(['pickup-chip'])
    expect(sfxForEvents(events({ type: 'pickedUp', at: AT, tile: 'keyGreen' }))).toEqual(['pickup-key'])
    expect(sfxForEvents(events({ type: 'pickedUp', at: AT, tile: 'fireBoots' }))).toEqual(['pickup-boot'])
  })

  it('ignores pickups of tiles with no sound (defensive default)', () => {
    expect(sfxForEvents(events({ type: 'pickedUp', at: AT, tile: 'floor' }))).toEqual([])
  })

  it('maps machinery and interaction events by name', () => {
    expect(sfxForEvents(events({ type: 'doorOpened', at: AT, color: 'red' }))).toEqual(['door-open'])
    expect(sfxForEvents(events({ type: 'socketOpened', at: AT }))).toEqual(['socket-open'])
    expect(sfxForEvents(events({ type: 'blockPushed', from: AT, id: 1, to: AT }))).toEqual(['block-push'])
    expect(sfxForEvents(events({ type: 'splash', at: AT, id: 1 }))).toEqual(['splash'])
    expect(sfxForEvents(events({ type: 'toggleFlipped' }))).toEqual(['toggle'])
    expect(sfxForEvents(events({ type: 'tanksReversed' }))).toEqual(['tank-reverse'])
    expect(sfxForEvents(events({ type: 'cloned', monster: { facing: 'up', id: 1, kind: 'bug', pos: AT } }))).toEqual(['clone'])
    expect(sfxForEvents(events({ type: 'teleported', entity: 'player', from: AT, id: null, to: AT }))).toEqual(['teleport'])
    expect(sfxForEvents(events({ type: 'bootsStolen', at: AT }))).toEqual(['thief'])
    expect(sfxForEvents(events({ type: 'monsterDrowned', at: AT, id: 1 }))).toEqual(['monster-drowned'])
  })

  it('maps death causes to distinct sounds', () => {
    expect(sfxForEvents(events({ type: 'died', at: AT, cause: 'drowned' }))).toEqual(['death-drowned'])
    expect(sfxForEvents(events({ type: 'died', at: AT, cause: 'burned' }))).toEqual(['death-burned'])
    expect(sfxForEvents(events({ type: 'died', at: AT, cause: 'monster' }))).toEqual(['death-monster'])
  })

  it('maps a win', () => {
    expect(sfxForEvents(events({ type: 'won', moves: 10 }))).toEqual(['win'])
  })

  it('silences waited/dirtCleared/popupRaised/monsterMoved', () => {
    expect(sfxForEvents(events({ type: 'waited' }))).toEqual([])
    expect(sfxForEvents(events({ type: 'dirtCleared', at: AT }))).toEqual([])
    expect(sfxForEvents(events({ type: 'popupRaised', at: AT }))).toEqual([])
    expect(sfxForEvents(events({ type: 'monsterMoved', from: AT, id: 1, kind: 'bug', to: AT }))).toEqual([])
  })

  it('prioritizes death over everything else on the same move', () => {
    const mixed = events(
      { type: 'playerMoved', from: AT, to: AT, forced: false },
      { type: 'pickedUp', at: AT, tile: 'chip' },
      { type: 'died', at: AT, cause: 'monster' },
    )
    expect(sfxForEvents(mixed)[0]).toBe('death-monster')
  })

  it('prioritizes win over movement', () => {
    const mixed = events(
      { type: 'playerMoved', from: AT, to: AT, forced: false },
      { type: 'won', moves: 5 },
    )
    expect(sfxForEvents(mixed)[0]).toBe('win')
  })

  it('orders interactions ahead of movement', () => {
    const mixed = events(
      { type: 'playerMoved', from: AT, to: AT, forced: false },
      { type: 'pickedUp', at: AT, tile: 'chip' },
    )
    expect(sfxForEvents(mixed)).toEqual(['pickup-chip', 'step'])
  })

  it('dedupes identical sounds within one move', () => {
    const twoChips = events(
      { type: 'pickedUp', at: AT, tile: 'chip' },
      { type: 'pickedUp', at: { x: 1, y: 0 }, tile: 'chip' },
    )
    expect(sfxForEvents(twoChips)).toEqual(['pickup-chip'])
  })

  it('caps at 4 distinct sounds per move', () => {
    const many = events(
      { type: 'pickedUp', at: AT, tile: 'chip' },
      { type: 'pickedUp', at: AT, tile: 'keyRed' },
      { type: 'pickedUp', at: AT, tile: 'fireBoots' },
      { type: 'doorOpened', at: AT, color: 'red' },
      { type: 'socketOpened', at: AT },
      { type: 'blockPushed', from: AT, id: 1, to: AT },
    )
    expect(sfxForEvents(many)).toHaveLength(4)
  })

  it('returns an empty list for no events', () => {
    expect(sfxForEvents([])).toEqual([])
  })
})
