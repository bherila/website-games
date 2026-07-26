import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { BlockBlasterGame } from './BlockBlasterGame'
import { BLOCK_BLASTER_GAME_DATA } from './gameProgress'

mountPersistedGame('block-blaster-root', () => <BlockBlasterGame />, [BLOCK_BLASTER_GAME_DATA])
