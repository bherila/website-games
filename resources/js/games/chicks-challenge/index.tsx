import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { ChicksGame } from './ChicksGame'
import { CHICKS_GAME_DATA } from './gameProgress'

mountPersistedGame('chicks-game-root', () => <ChicksGame />, [CHICKS_GAME_DATA])
