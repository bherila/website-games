import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { Game2048 } from './Game2048'
import { TWENTY48_GAME_DATA, TWENTY48_SAVE_DATA } from './gameProgress'

mountPersistedGame('game-2048-root', () => <Game2048 />, [TWENTY48_GAME_DATA, TWENTY48_SAVE_DATA])
