import { useEffect, useRef } from 'react'

import type { GameSpeed } from './gameTypes'
import type { OverlayChoice } from './hud/OverlayToggles'

interface TowerShortcutState {
  speed: GameSpeed
  overlay: OverlayChoice
  hasSelectedTool: boolean
  hasSelection: boolean
  modalOpen: boolean
  /** The shortcut cheat-sheet overlay is open; lets Esc close it first. */
  helpOpen: boolean
}

interface TowerShortcutHandlers {
  onSetSpeed: (speed: GameSpeed) => void
  onToggleBuildMode: () => void
  onCancelTool: () => void
  onDeselect: () => void
  onSetOverlay: (overlay: OverlayChoice) => void
  onToggleMute: () => void
  onToggleFinancials: () => void
  onToggleToastHistory: () => void
  onToggleHelp: () => void
}

export interface TowerShortcutBinding {
  /** Human-readable key(s), e.g. 'Space' or '1 / 8 / 16'. */
  keys: string
  label: string
  description: string
}

/**
 * Single source of truth for the shortcut layer: the hook dispatches these keys
 * and ShortcutHelpOverlay renders this same table, so the two cannot drift.
 */
export const TOWER_SHORTCUT_BINDINGS: readonly TowerShortcutBinding[] = [
  { keys: 'Space', label: 'Pause / resume', description: 'Toggle between paused and the last running speed' },
  { keys: '1 / 8 / 16', label: 'Game speed', description: 'Set the simulation speed multiplier' },
  { keys: 'B', label: 'Build mode', description: 'Toggle the build palette' },
  { keys: 'F', label: 'Financials', description: 'Open or close the financials panel' },
  { keys: 'O', label: 'Cycle overlay', description: 'Step through noise, congestion, and eval overlays' },
  { keys: 'R', label: 'Recent events', description: 'Open or close the toast history drawer' },
  { keys: 'M', label: 'Mute', description: 'Toggle all game audio' },
  { keys: 'Esc', label: 'Cancel', description: 'Close this help, drop the build tool, or clear the selection' },
  { keys: '?', label: 'Shortcuts', description: 'Show or hide this shortcut cheat-sheet' },
]

const OVERLAY_ORDER: readonly OverlayChoice[] = [null, 'noise', 'congestion', 'eval']

export function nextOverlayChoice(current: OverlayChoice): OverlayChoice {
  const index = OVERLAY_ORDER.indexOf(current)
  return OVERLAY_ORDER[(index + 1) % OVERLAY_ORDER.length] ?? null
}

export function shortcutSpeedForKey(key: string): GameSpeed | null {
  switch (key) {
    case '1':
      return 1
    case '8':
      return 8
    case '16':
    case '6':
      return 16
    default:
      return null
  }
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A')
}

function isSpaceKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space'
}

function normalizedKey(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key
}

function shouldIgnoreShortcut(event: KeyboardEvent, modalOpen: boolean): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || modalOpen || isEditableShortcutTarget(event.target) || isInteractiveShortcutTarget(event.target)
}

export function useTowerKeyboardShortcuts(state: TowerShortcutState, handlers: TowerShortcutHandlers): void {
  const stateRef = useRef(state)
  const handlersRef = useRef(handlers)
  const lastRunningSpeedRef = useRef<GameSpeed>(state.speed === 0 ? 1 : state.speed)
  const pressedKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    stateRef.current = state
    handlersRef.current = handlers
  }, [handlers, state])

  useEffect(() => {
    if (state.speed !== 0) {
      lastRunningSpeedRef.current = state.speed
    }
  }, [state.speed])

  useEffect(() => {
    const pressedKeys = pressedKeysRef.current

    const onKeyDown = (event: KeyboardEvent): void => {
      const currentState = stateRef.current
      const currentHandlers = handlersRef.current
      if (shouldIgnoreShortcut(event, currentState.modalOpen)) {
        return
      }

      const keyId = isSpaceKey(event) ? 'Space' : event.code || event.key
      if (event.repeat || pressedKeys.has(keyId)) {
        return
      }
      pressedKeys.add(keyId)

      if (isSpaceKey(event)) {
        event.preventDefault()
        currentHandlers.onSetSpeed(currentState.speed === 0 ? lastRunningSpeedRef.current : 0)
        return
      }

      const key = normalizedKey(event)
      const speed = shortcutSpeedForKey(key)
      if (speed !== null) {
        event.preventDefault()
        currentHandlers.onSetSpeed(speed)
        return
      }

      switch (key) {
        case 'b':
          event.preventDefault()
          currentHandlers.onToggleBuildMode()
          return
        case 'Escape':
          if (currentState.helpOpen) {
            event.preventDefault()
            currentHandlers.onToggleHelp()
            return
          }
          if (currentState.hasSelectedTool) {
            event.preventDefault()
            currentHandlers.onCancelTool()
            return
          }
          if (currentState.hasSelection) {
            event.preventDefault()
            currentHandlers.onDeselect()
          }
          return
        case 'o':
          event.preventDefault()
          currentHandlers.onSetOverlay(nextOverlayChoice(currentState.overlay))
          return
        case 'm':
          event.preventDefault()
          currentHandlers.onToggleMute()
          return
        case 'f':
          event.preventDefault()
          currentHandlers.onToggleFinancials()
          return
        case 'r':
          event.preventDefault()
          currentHandlers.onToggleToastHistory()
          return
        case '?':
          event.preventDefault()
          currentHandlers.onToggleHelp()
          return
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      pressedKeys.delete(isSpaceKey(event) ? 'Space' : event.code || event.key)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      pressedKeys.clear()
    }
  }, [])
}
