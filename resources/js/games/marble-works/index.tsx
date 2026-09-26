import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { MARBLE_WORKS_GAME_DATA } from './gameProgress'
import { MarbleWorksGame } from './MarbleWorksGame'

mountPersistedGame('marble-works-root', () => <MarbleWorksGame />, [MARBLE_WORKS_GAME_DATA])
