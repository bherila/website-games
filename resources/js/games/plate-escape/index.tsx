import { mountPersistedGame } from '../_shared/mountPersistedGame'
import { PLATE_ESCAPE_GAME_DATA } from './gameProgress'
import { PlateEscapeGame } from './PlateEscapeGame'

mountPersistedGame('plate-escape-root', () => <PlateEscapeGame />, [PLATE_ESCAPE_GAME_DATA])
