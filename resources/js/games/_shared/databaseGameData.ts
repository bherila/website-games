import { TWENTY48_GAME_DATA, TWENTY48_SAVE_DATA } from '../2048/gameProgress'
import { BLOCK_BLASTER_GAME_DATA } from '../block-blaster/gameProgress'
import { CARS_CATALOG_GAME_DATA, CARS_GAME_DATA } from '../cars/gameProgress'
import { CHICKS_GAME_DATA } from '../chicks-challenge/gameProgress'
import { HOVER_GAME_DATA } from '../hover/gameProgress'
import { MARBLE_SORT_CATALOG_GAME_DATA, MARBLE_SORT_GAME_DATA } from '../marble-sort/gameProgress'
import { MATH_HORDE_GAME_DATA } from '../math-horde/gameProgress'

export const DATABASE_GAME_PROGRESS_DATA = [
  CHICKS_GAME_DATA,
  BLOCK_BLASTER_GAME_DATA,
  MARBLE_SORT_CATALOG_GAME_DATA,
  CARS_CATALOG_GAME_DATA,
  HOVER_GAME_DATA,
  MATH_HORDE_GAME_DATA,
  TWENTY48_GAME_DATA,
] as const

export const DATABASE_GAME_DATA = [
  CHICKS_GAME_DATA,
  BLOCK_BLASTER_GAME_DATA,
  ...MARBLE_SORT_GAME_DATA,
  ...CARS_GAME_DATA,
  HOVER_GAME_DATA,
  MATH_HORDE_GAME_DATA,
  TWENTY48_GAME_DATA,
  TWENTY48_SAVE_DATA,
] as const
