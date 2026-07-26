import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { HOVER_GAME_DATA } from './gameProgress'
import { HoverGame } from './HoverGame'

mountPersistedGame('hover-game-root', () => <HoverGame />, [HOVER_GAME_DATA])
