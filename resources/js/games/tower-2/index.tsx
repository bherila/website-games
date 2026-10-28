import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { TOWER_2_SAVE_DATA } from './gameProgress'
import { Tower2Game } from './Tower2Game'

mountPersistedGame('tower-2-root', () => <Tower2Game />, [TOWER_2_SAVE_DATA])
