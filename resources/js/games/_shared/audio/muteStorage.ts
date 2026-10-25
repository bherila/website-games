/**
 * A versioned, defensive mute preference: unreadable or blocked storage means
 * "sound on". Games keep the key and format they already shipped, so nobody's
 * saved setting resets: 'flag' stores '1'/'0', 'json' stores true/false.
 */
export function createMuteStorage(key: string, format: 'flag' | 'json' = 'json'): { load: () => boolean, save: (muted: boolean) => void } {
  return {
    load() {
      try {
        if (typeof window === 'undefined') return false
        const raw = window.localStorage.getItem(key)
        return format === 'flag' ? raw === '1' : JSON.parse(raw ?? 'false') === true
      } catch {
        return false
      }
    },
    save(muted) {
      try {
        window.localStorage.setItem(key, format === 'flag' ? (muted ? '1' : '0') : JSON.stringify(muted))
      } catch {
        // Private mode or quota: the preference simply doesn't persist.
      }
    },
  }
}
