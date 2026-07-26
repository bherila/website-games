import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { MATH_HORDE_GAME_DATA } from './gameProgress'
import { MathHordeGame } from './MathHordeGame'

mountPersistedGame('math-horde-root', () => <MathHordeGame />, [MATH_HORDE_GAME_DATA])
