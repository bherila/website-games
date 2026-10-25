import { createMuteStorage } from '../../_shared/audio/muteStorage'

/** Versioned device preference stored as JSON true/false; any corruption reads as unmuted. */
const storage = createMuteStorage('bwh.chicks-challenge.muted.v1', 'json')

export const loadMuted = storage.load
export const saveMuted = storage.save
