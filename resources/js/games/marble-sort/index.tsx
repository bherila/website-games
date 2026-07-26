import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { MARBLE_SORT_GAME_DATA } from './gameProgress'
import { MarbleSortGame } from './MarbleSortGame'

mountPersistedGame('marble-sort-root', () => <MarbleSortGame />, MARBLE_SORT_GAME_DATA)
