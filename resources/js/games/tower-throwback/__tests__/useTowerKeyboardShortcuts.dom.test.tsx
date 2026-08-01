import { fireEvent, render, renderHook, screen } from '@testing-library/react'

import { ShortcutHelpOverlay } from '../overlays/ShortcutHelpOverlay'
import { TOWER_SHORTCUT_BINDINGS, useTowerKeyboardShortcuts } from '../useTowerKeyboardShortcuts'

type ShortcutState = Parameters<typeof useTowerKeyboardShortcuts>[0]
type ShortcutHandlers = Parameters<typeof useTowerKeyboardShortcuts>[1]

function state(overrides: Partial<ShortcutState> = {}): ShortcutState {
  return {
    speed: 4,
    overlay: null,
    hasSelectedTool: false,
    hasSelection: false,
    modalOpen: false,
    ...overrides,
  } satisfies ShortcutState
}

function handlers() {
  return {
    onSetSpeed: jest.fn(),
    onToggleBuildMode: jest.fn(),
    onCancelTool: jest.fn(),
    onDeselect: jest.fn(),
    onSetOverlay: jest.fn(),
    onToggleMute: jest.fn(),
    onToggleFinancials: jest.fn(),
    onToggleToastHistory: jest.fn(),
    onToggleHelp: jest.fn(),
  } satisfies ShortcutHandlers
}

function keydown(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

function dispatchedKeydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  window.dispatchEvent(event)
  return event
}

function keyup(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...init }))
}

describe('useTowerKeyboardShortcuts', () => {
  it('maps speed keys and space pause to setSpeed commands', () => {
    const h = handlers()
    const { rerender } = renderHook(({ shortcutState }) => useTowerKeyboardShortcuts(shortcutState, h), {
      initialProps: { shortcutState: state({ speed: 4 }) },
    })

    keydown(' ')
    keyup(' ')
    keydown('1')
    keydown('2') // 2× shortcut removed → ignored
    keydown('4') // 4× shortcut removed → ignored
    keydown('8')
    keydown('6')
    keydown('16')

    expect(h.onSetSpeed.mock.calls).toEqual([[0], [1], [8], [16]])

    rerender({ shortcutState: state({ speed: 0 }) })
    keydown(' ')
    expect(h.onSetSpeed).toHaveBeenLastCalledWith(4)
  })

  it('maps HUD control shortcuts to existing actions', () => {
    const h = handlers()
    const { rerender } = renderHook(({ shortcutState }) => useTowerKeyboardShortcuts(shortcutState, h), {
      initialProps: { shortcutState: state({ overlay: null }) },
    })

    keydown('b')
    keydown('m')
    keydown('f')
    keydown('o')
    keydown('r')

    expect(h.onToggleBuildMode).toHaveBeenCalledTimes(1)
    expect(h.onToggleMute).toHaveBeenCalledTimes(1)
    expect(h.onToggleFinancials).toHaveBeenCalledTimes(1)
    expect(h.onSetOverlay).toHaveBeenLastCalledWith('noise')
    expect(h.onToggleToastHistory).toHaveBeenCalledTimes(1)

    keyup('o')
    rerender({ shortcutState: state({ overlay: 'noise' }) })
    keydown('o')
    expect(h.onSetOverlay).toHaveBeenLastCalledWith('congestion')

    keyup('o')
    rerender({ shortcutState: state({ overlay: 'congestion' }) })
    keydown('o')
    expect(h.onSetOverlay).toHaveBeenLastCalledWith('eval')

    keyup('o')
    rerender({ shortcutState: state({ overlay: 'eval' }) })
    keydown('o')
    expect(h.onSetOverlay).toHaveBeenLastCalledWith(null)
  })

  it('ignores held-key repeats', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), h))

    keydown('b')
    keydown('b', { repeat: true })
    keydown('b', { repeat: true })
    keydown('m', { repeat: true })

    expect(h.onToggleBuildMode).toHaveBeenCalledTimes(1)
    expect(h.onToggleMute).not.toHaveBeenCalled()

    keydown('b')
    expect(h.onToggleBuildMode).toHaveBeenCalledTimes(1)
    keyup('b')
    keydown('b')
    expect(h.onToggleBuildMode).toHaveBeenCalledTimes(2)
  })

  it('does nothing while an input or textarea has focus', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), h))
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    document.body.append(input, textarea)

    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))
    textarea.focus()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))

    expect(h.onToggleBuildMode).not.toHaveBeenCalled()
    expect(h.onToggleMute).not.toHaveBeenCalled()
    input.remove()
    textarea.remove()
  })

  it('does not hijack browser or OS modified shortcuts', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), h))

    const ctrlFind = dispatchedKeydown('f', { ctrlKey: true })
    const metaBuild = dispatchedKeydown('b', { metaKey: true })
    const altSpeed = dispatchedKeydown('1', { altKey: true })

    expect(ctrlFind.defaultPrevented).toBe(false)
    expect(metaBuild.defaultPrevented).toBe(false)
    expect(altSpeed.defaultPrevented).toBe(false)
    expect(h.onToggleFinancials).not.toHaveBeenCalled()
    expect(h.onToggleBuildMode).not.toHaveBeenCalled()
    expect(h.onSetSpeed).not.toHaveBeenCalled()
  })

  it('lets focused buttons keep their native Space activation', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), h))
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(h.onSetSpeed).not.toHaveBeenCalled()
    button.remove()
  })

  it('does nothing while a modal overlay is open', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state({ modalOpen: true }), h))

    keydown(' ')
    keydown('b')
    keydown('o')
    keydown('Escape')
    keydown('?')

    expect(h.onSetSpeed).not.toHaveBeenCalled()
    expect(h.onToggleBuildMode).not.toHaveBeenCalled()
    expect(h.onSetOverlay).not.toHaveBeenCalled()
    expect(h.onCancelTool).not.toHaveBeenCalled()
    expect(h.onToggleHelp).not.toHaveBeenCalled()
  })

  it('does nothing when a semantic modal is open before parent state propagates', () => {
    const h = handlers()
    render(<section role="dialog" aria-modal="true" aria-label="Blocking surface" />)
    renderHook(() => useTowerKeyboardShortcuts(state(), h))

    keydown('b')
    keydown('6')

    expect(h.onToggleBuildMode).not.toHaveBeenCalled()
    expect(h.onSetSpeed).not.toHaveBeenCalled()
  })

  it('uses Escape for tool cancel before selection deselect', () => {
    const h = handlers()
    const { rerender } = renderHook(({ shortcutState }) => useTowerKeyboardShortcuts(shortcutState, h), {
      initialProps: { shortcutState: state({ hasSelectedTool: true, hasSelection: true }) },
    })

    keydown('Escape')
    expect(h.onCancelTool).toHaveBeenCalledTimes(1)
    expect(h.onDeselect).not.toHaveBeenCalled()

    keyup('Escape')
    rerender({ shortcutState: state({ hasSelectedTool: false, hasSelection: true }) })
    keydown('Escape')
    expect(h.onDeselect).toHaveBeenCalledTimes(1)
  })

  it('toggles the shortcut help overlay with the ? key', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), h))

    keydown('?')
    expect(h.onToggleHelp).toHaveBeenCalledTimes(1)
    // ? is Shift+/, and Shift alone must not gate the shortcut out.
    expect(h.onToggleBuildMode).not.toHaveBeenCalled()
  })

  it('suppresses the ? shortcut while an editable target has focus', () => {
    const h = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), h))
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    expect(h.onToggleHelp).not.toHaveBeenCalled()
    input.remove()
  })

  it('cleans up the window listener on unmount', () => {
    const first = handlers()
    const rendered = renderHook(() => useTowerKeyboardShortcuts(state(), first))

    keydown('f')
    rendered.unmount()
    keydown('f')
    expect(first.onToggleFinancials).toHaveBeenCalledTimes(1)

    const second = handlers()
    renderHook(() => useTowerKeyboardShortcuts(state(), second))
    keydown('f')
    expect(second.onToggleFinancials).toHaveBeenCalledTimes(1)
  })
})

describe('ShortcutHelpOverlay', () => {
  it('renders exactly one row per shared binding, generated from the exported table', () => {
    render(<ShortcutHelpOverlay onClose={jest.fn()} />)

    const rows = screen.getAllByTestId('shortcut-row')
    expect(rows).toHaveLength(TOWER_SHORTCUT_BINDINGS.length)
    for (const binding of TOWER_SHORTCUT_BINDINGS) {
      expect(screen.getByText(binding.label)).toBeInTheDocument()
      expect(screen.getByText(binding.description)).toBeInTheDocument()
    }
    expect(screen.getByText('1 / 8 / 6')).toBeInTheDocument()
    expect(screen.queryByText('1 / 8 / 16')).not.toBeInTheDocument()
  })

  it('closes when its Esc button is clicked', () => {
    const onClose = jest.fn()
    render(<ShortcutHelpOverlay onClose={onClose} />)
    screen.getByLabelText('Close shortcuts').click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('owns close keys and isolates them from gameplay handlers', () => {
    const onClose = jest.fn()
    const underlyingKeyDown = jest.fn()
    render(
      <div onKeyDown={underlyingKeyDown}>
        <ShortcutHelpOverlay onClose={onClose} />
      </div>,
    )

    const dialog = screen.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Close shortcuts')).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.keyDown(dialog, { key: '?' })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(underlyingKeyDown).not.toHaveBeenCalled()
  })
})
