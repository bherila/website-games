import { DATABASE_GAME_PROGRESS_DATA } from '../_shared/databaseGameData'
import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { GameSelectPage } from './GameSelectPage'

mountPersistedGame('game-select-root', () => <GameSelectPage />, DATABASE_GAME_PROGRESS_DATA)
