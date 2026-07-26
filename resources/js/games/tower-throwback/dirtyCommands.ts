/**
 * Which engine commands arm the dirty autosave.
 *
 * Split from the autosave hook so the exhaustiveness check over `EngineCommand`
 * lives next to the decision it guards: adding a command type without deciding
 * whether it dirties the tower must be a compile error, not a silent "no".
 */
import type { EngineCommand } from './gameTypes'

/**
 * Commands whose acceptance changes something worth losing, and so should arm
 * the dirty autosave. `setSpeed` / `setFastMode` are excluded: they are view
 * controls the player re-picks instantly, and treating them as dirtying would
 * make idle speed-fiddling write the whole tower to storage repeatedly.
 *
 * Exhaustive over `EngineCommand` by construction — the `never` check below
 * fails to compile if a new command type is added without a decision here.
 */
export function isStateChangingCommand(cmd: EngineCommand): boolean {
  switch (cmd.type) {
    case 'setSpeed':
    case 'setFastMode':
      return false
    case 'place':
    case 'placeShaft':
    case 'resizeShaft':
    case 'addCar':
    case 'demolishUnit':
    case 'demolishShaft':
    case 'setRentTier':
    case 'applyUpgrade':
    case 'setShaftProgram':
    case 'setStopEnabled':
    case 'setCarHomeFloor':
    case 'setDisastersEnabled':
    case 'acceptLoan':
    case 'declineLoan':
    case 'resolveBombThreat':
    case 'respondToFire':
    case 'pestControl':
    case 'repairUnit':
      return true
    default: {
      const exhaustive: never = cmd
      return Boolean(exhaustive)
    }
  }
}
