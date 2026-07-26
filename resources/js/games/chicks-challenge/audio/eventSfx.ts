import type { EngineEvent } from '../engine/types'
import type { SfxName } from './sfx'

/** Cap on distinct sounds triggered by a single accepted (or rejected) move. */
const MAX_SFX_PER_MOVE = 4

/** Maps one engine event to a sound, or null when the event is silent. */
function sfxForEvent(event: EngineEvent): SfxName | null {
  switch (event.type) {
    case 'playerMoved':
      return 'step'
    case 'bumped':
      return 'bump'
    case 'pickedUp':
      switch (event.tile) {
        case 'chip':
          return 'pickup-chip'
        case 'keyRed':
        case 'keyGreen':
        case 'keyBlue':
        case 'keyYellow':
          return 'pickup-key'
        case 'flippers':
        case 'fireBoots':
        case 'skates':
        case 'suctionBoots':
          return 'pickup-boot'
        default:
          return null
      }
    case 'doorOpened':
      return 'door-open'
    case 'socketOpened':
      return 'socket-open'
    case 'blockPushed':
      return 'block-push'
    case 'splash':
      return 'splash'
    case 'toggleFlipped':
      return 'toggle'
    case 'tanksReversed':
      return 'tank-reverse'
    case 'cloned':
      return 'clone'
    case 'teleported':
      return 'teleport'
    case 'bootsStolen':
      return 'thief'
    case 'monsterDrowned':
      return 'monster-drowned'
    case 'died':
      switch (event.cause) {
        case 'drowned':
          return 'death-drowned'
        case 'burned':
          return 'death-burned'
        case 'monster':
          return 'death-monster'
        default:
          return null
      }
    case 'won':
      return 'win'
    case 'waited':
    case 'dirtCleared':
    case 'popupRaised':
    case 'monsterMoved':
      return null
    default:
      return null
  }
}

/** Priority tier: lower plays first and survives the cap. */
function tierFor(name: SfxName): 0 | 1 | 2 {
  if (name === 'win' || name === 'death-drowned' || name === 'death-burned' || name === 'death-monster') {
    return 0
  }
  if (name === 'step' || name === 'bump') {
    return 2
  }

  return 1
}

/**
 * Pure mapping from one move's `EngineEvent[]` to the (deduped, capped,
 * priority-ordered) list of sounds to play. Priority: death/win beats
 * interactions beats movement, so a fatal move never gets drowned out by its
 * own footstep. Deduped per name so a multi-tile forced slide chain plays at
 * most one `step` and doesn't repeat the same pickup sound per item.
 */
export function sfxForEvents(events: readonly EngineEvent[]): SfxName[] {
  const seen = new Set<SfxName>()
  const tiers: [SfxName[], SfxName[], SfxName[]] = [[], [], []]

  for (const event of events) {
    const name = sfxForEvent(event)
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    tiers[tierFor(name)].push(name)
  }

  return [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, MAX_SFX_PER_MOVE)
}
