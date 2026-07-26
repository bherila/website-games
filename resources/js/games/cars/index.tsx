import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { CarsGame } from './CarsGame'
import { CARS_GAME_DATA } from './gameProgress'

mountPersistedGame('cars-game-root', () => <CarsGame />, CARS_GAME_DATA)
