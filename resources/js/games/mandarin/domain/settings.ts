/** Device-local preferences. Never synced; lives in the preview partition. */

export interface MandarinSettings {
  /** 0..1, applied to speech playback (device voice + future real assets). */
  speechVolume: number
  /** 0..1, applied to the small procedural cues. */
  sfxVolume: number
  /** Suppress non-essential motion regardless of the OS preference. */
  lowMotion: boolean
  /** Use the static poster instead of the WebGL diorama. */
  twoDMode: boolean
  pinyinAssist: 'always' | 'on_request'
  /** Opt-in: use a Mandarin device voice as a labelled preview when one exists. */
  deviceVoicePreview: boolean
}

export const DEFAULT_SETTINGS: MandarinSettings = {
  speechVolume: 1,
  sfxVolume: 0.6,
  lowMotion: false,
  twoDMode: false,
  pinyinAssist: 'always',
  deviceVoicePreview: true,
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
}

export function parseSettings(value: unknown): MandarinSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS }
  const record = value as Record<string, unknown>
  return {
    speechVolume: clamp01(record.speechVolume, DEFAULT_SETTINGS.speechVolume),
    sfxVolume: clamp01(record.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    lowMotion: record.lowMotion === true,
    twoDMode: record.twoDMode === true,
    pinyinAssist: record.pinyinAssist === 'on_request' ? 'on_request' : 'always',
    deviceVoicePreview: record.deviceVoicePreview !== false,
  }
}
