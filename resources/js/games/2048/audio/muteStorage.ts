import { createMuteStorage } from '../../_shared/audio/muteStorage'
import { TWENTY48_MUTED_STORAGE_KEY } from '../gameTypes'

/**
 * Mute is a device preference, not progress: it stays in raw `localStorage` and
 * is never promoted to the account row (see docs/games/persistence.md).
 */
const storage = createMuteStorage(TWENTY48_MUTED_STORAGE_KEY, 'flag')

export const loadMuted = storage.load
export const saveMuted = storage.save
