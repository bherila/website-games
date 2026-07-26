import { act, render, screen } from '@testing-library/react'
import { type ReactElement, useEffect } from 'react'

import { loadPresentationPrefs, savePresentationPrefs } from '../presentationPrefs'
import { usePresentationPrefs } from '../usePresentationPrefs'

interface FakeQuery {
  matches: boolean
  listeners: Set<(event: MediaQueryListEvent) => void>
}

type MatchMedia = typeof window.matchMedia

const originalMatchMedia: MatchMedia | undefined = window.matchMedia

function installMatchMedia(initialMatches: boolean): FakeQuery {
  const query: FakeQuery = { matches: initialMatches, listeners: new Set() }
  window.matchMedia = ((q: string) => ({
    matches: q === '(prefers-reduced-motion: reduce)' ? query.matches : false,
    media: q,
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => query.listeners.add(cb),
    removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => query.listeners.delete(cb),
    addListener: (cb: (event: MediaQueryListEvent) => void) => query.listeners.add(cb),
    removeListener: (cb: (event: MediaQueryListEvent) => void) => query.listeners.delete(cb),
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as MatchMedia
  return query
}

function emit(query: FakeQuery, matches: boolean): void {
  query.matches = matches
  act(() => {
    for (const listener of query.listeners) {
      listener({ matches } as MediaQueryListEvent)
    }
  })
}

/**
 * Published from an effect rather than during render so the harness itself
 * stays a pure component (and the lint rule that enforces that stays useful).
 */
const published: { current: ReturnType<typeof usePresentationPrefs> | null } = { current: null }

function binding(): ReturnType<typeof usePresentationPrefs> {
  if (!published.current) {
    throw new Error('usePresentationPrefs harness has not rendered yet')
  }
  return published.current
}

function Probe(): ReactElement {
  const prefs = usePresentationPrefs()
  useEffect(() => {
    published.current = prefs
  }, [prefs])
  return <span data-testid="motion">{String(prefs.motionReduced)}</span>
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  window.matchMedia = originalMatchMedia as MatchMedia
})

describe('usePresentationPrefs', () => {
  it('defaults to the classic palette and the system motion setting', () => {
    installMatchMedia(false)
    render(<Probe />)

    expect(binding().diagnosticPalette).toBe('classic')
    expect(binding().motion).toBe('system')
    expect(binding().motionReduced).toBe(false)
  })

  it('follows prefers-reduced-motion while the preference is "system"', () => {
    const query = installMatchMedia(true)
    render(<Probe />)

    expect(screen.getByTestId('motion')).toHaveTextContent('true')

    emit(query, false)
    expect(screen.getByTestId('motion')).toHaveTextContent('false')
  })

  it('lets an explicit override win over the system setting in both directions', () => {
    const query = installMatchMedia(true)
    render(<Probe />)

    act(() => binding().setMotion('full'))
    expect(screen.getByTestId('motion')).toHaveTextContent('false')

    // A live system change must not override an explicit choice.
    emit(query, true)
    expect(screen.getByTestId('motion')).toHaveTextContent('false')

    act(() => binding().setMotion('reduced'))
    emit(query, false)
    expect(screen.getByTestId('motion')).toHaveTextContent('true')
  })

  it('persists both preferences and restores them on the next mount', () => {
    installMatchMedia(false)
    const first = render(<Probe />)
    act(() => binding().setDiagnosticPalette('colorSafe'))
    act(() => binding().setMotion('reduced'))
    first.unmount()

    expect(loadPresentationPrefs()).toEqual({ diagnosticPalette: 'colorSafe', motion: 'reduced' })

    render(<Probe />)
    expect(binding().diagnosticPalette).toBe('colorSafe')
    expect(binding().motion).toBe('reduced')
  })

  it('falls back to defaults for corrupt or partial stored preferences', () => {
    localStorage.setItem('towerThrowback.presentation.v1', '{"diagnosticPalette":"neon","motion":42}')
    installMatchMedia(false)
    render(<Probe />)

    expect(binding().diagnosticPalette).toBe('classic')
    expect(binding().motion).toBe('system')
  })

  it('survives a matchMedia-less environment', () => {
    window.matchMedia = undefined as unknown as MatchMedia
    render(<Probe />)

    expect(binding().motionReduced).toBe(false)
  })

  it('does not throw when storage writes are blocked', () => {
    installMatchMedia(false)
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    render(<Probe />)

    expect(() => act(() => binding().setDiagnosticPalette('colorSafe'))).not.toThrow()
    expect(binding().diagnosticPalette).toBe('colorSafe')
    setItem.mockRestore()
  })

  it('round-trips through the plain storage helpers', () => {
    savePresentationPrefs({ diagnosticPalette: 'colorSafe', motion: 'full' })
    expect(loadPresentationPrefs()).toEqual({ diagnosticPalette: 'colorSafe', motion: 'full' })
  })
})
