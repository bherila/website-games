import { fireEvent, render, screen } from '@testing-library/react'

import type { DiagnosticPaletteMode, MotionPreference } from '../../presentationPrefs'
import { cssRamp } from '../../scene/diagnosticPalette'
import { DisplaySettings } from '../DisplaySettings'

function renderSettings(
  overrides: Partial<{ paletteMode: DiagnosticPaletteMode; motion: MotionPreference; motionReduced: boolean }> = {},
) {
  const onSetPaletteMode = jest.fn()
  const onSetMotion = jest.fn()
  render(
    <DisplaySettings
      paletteMode={overrides.paletteMode ?? 'classic'}
      motion={overrides.motion ?? 'system'}
      motionReduced={overrides.motionReduced ?? false}
      onSetPaletteMode={onSetPaletteMode}
      onSetMotion={onSetMotion}
    />,
  )
  return { onSetPaletteMode, onSetMotion }
}

describe('DisplaySettings', () => {
  it('stays collapsed until opened', () => {
    renderSettings()

    expect(screen.queryByTestId('display-settings-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('display-settings-toggle'))
    expect(screen.getByTestId('display-settings-panel')).toBeInTheDocument()
  })

  it('reports the active choices via aria-pressed', () => {
    renderSettings({ paletteMode: 'colorSafe', motion: 'reduced', motionReduced: true })
    fireEvent.click(screen.getByTestId('display-settings-toggle'))

    expect(screen.getByTestId('palette-mode-colorSafe')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('palette-mode-classic')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('motion-reduced')).toHaveAttribute('aria-pressed', 'true')
  })

  it('emits the selected palette and motion preferences', () => {
    const h = renderSettings()
    fireEvent.click(screen.getByTestId('display-settings-toggle'))

    fireEvent.click(screen.getByTestId('palette-mode-colorSafe'))
    fireEvent.click(screen.getByTestId('motion-reduced'))

    expect(h.onSetPaletteMode).toHaveBeenCalledWith('colorSafe')
    expect(h.onSetMotion).toHaveBeenCalledWith('reduced')
  })

  it('previews the ramp from the shared palette source', () => {
    renderSettings({ paletteMode: 'colorSafe' })
    fireEvent.click(screen.getByTestId('display-settings-toggle'))

    expect(screen.getByTestId('display-settings-ramp-preview')).toHaveStyle({ background: cssRamp('colorSafe') })
  })

  it('explains what the system motion setting currently resolves to', () => {
    renderSettings({ motion: 'system', motionReduced: true })
    fireEvent.click(screen.getByTestId('display-settings-toggle'))

    expect(screen.getByTestId('motion-resolved')).toHaveTextContent('currently reduced')
  })

  it('closes on Escape', () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('display-settings-toggle'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('display-settings-panel')).toBeNull()
  })

  it('closes when clicking outside the popover', () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('display-settings-toggle'))

    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('display-settings-panel')).toBeNull()
  })
})
