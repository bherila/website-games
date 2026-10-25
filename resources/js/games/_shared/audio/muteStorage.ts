/** A versioned, defensive mute preference: unreadable or blocked storage means "sound on". */
export function createMuteStorage(key: string): { load: () => boolean, save: (muted: boolean) => void } {
  return {
    load() {
      try {
        return typeof window !== 'undefined' && JSON.parse(window.localStorage.getItem(key) ?? 'false') === true
      } catch {
        return false
      }
    },
    save(muted) {
      try {
        window.localStorage.setItem(key, JSON.stringify(muted))
      } catch {
        // Private mode or quota: the preference simply doesn't persist.
      }
    },
  }
}
