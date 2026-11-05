import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { TOWER_DEFENSE_GAME_DATA } from './gameProgress'
import { TowerDefenseGame } from './TowerDefenseGame'

mountPersistedGame('tower-defense-root', () => <TowerDefenseGame />, [TOWER_DEFENSE_GAME_DATA])
