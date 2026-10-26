import { render, screen } from '@testing-library/react'

import { getPalette, registeredPaletteThemes } from '../../scene/palette'
import { DisplaySettings } from '../DisplaySettings'
import { HUD_TOOLBAR_BUTTON, HUD_TOOLBAR_SAVE_BUTTON } from '../hudButtonStyles'
import { ToastHistoryButton } from '../ToastHistoryDrawer'

declare function require(moduleName: string): unknown
declare const process: { cwd(): string }

/** Tailwind v4 palette values for the fills the toolbar styles may use. */
const TAILWIND_RGB: Record<string, [number, number, number]> = {
  'slate-950': [2, 6, 23],
  'slate-800': [29, 41, 61],
  'emerald-800': [0, 95, 70],
  'emerald-700': [0, 122, 85],
  white: [255, 255, 255],
}

function channel(value: number): number {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The resting fill (`bg-<color>/<alpha>`) of a toolbar class list, composited over a sky. */
function restingFillOver(classes: string, sky: number): [number, number, number] {
  const match = /(?:^|\s)bg-([a-z]+(?:-\d+)?)\/(\d+)/.exec(classes)
  if (!match) {
    throw new Error(`no translucent resting fill in "${classes}"`)
  }
  const fill = TAILWIND_RGB[match[1]!]
  if (!fill) {
    throw new Error(`unknown Tailwind color ${match[1]}`)
  }
  const alpha = Number(match[2]) / 100
  const skyRgb: [number, number, number] = [(sky >> 16) & 0xff, (sky >> 8) & 0xff, sky & 0xff]
  return fill.map((value, i) => Math.round(value * alpha + skyRgb[i]! * (1 - alpha))) as [number, number, number]
}

const skies = registeredPaletteThemes().flatMap((theme) => {
  const palette = getPalette(theme)
  return [
    { label: `${theme} day`, sky: palette.skyDay },
    { label: `${theme} night`, sky: palette.skyNight },
  ]
})

describe('toolbar controls drawn on the sky', () => {
  it.each(skies)('keep white labels at WCAG AA contrast over the $label sky', ({ sky }) => {
    for (const classes of [HUD_TOOLBAR_BUTTON, HUD_TOOLBAR_SAVE_BUTTON]) {
      expect(classes).toContain('text-white')
      expect(contrast(TAILWIND_RGB.white!, restingFillOver(classes, sky))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('apply the shared toolbar style to the recent-events and display toggles', () => {
    render(
      <>
        <ToastHistoryButton count={0} open={false} onToggle={() => {}} />
        <DisplaySettings
          paletteMode="classic"
          motion="system"
          motionReduced={false}
          onSetPaletteMode={() => {}}
          onSetMotion={() => {}}
        />
      </>,
    )
    for (const control of [screen.getByRole('button', { name: 'Toggle recent events' }), screen.getByTestId('display-settings-toggle')]) {
      for (const token of HUD_TOOLBAR_BUTTON.split(' ')) {
        expect(control).toHaveClass(token)
      }
    }
  })

  it('leave no translucent-white fill on the game shell toolbar', () => {
    const fs = require('node:fs') as { readFileSync(path: string, encoding: string): string }
    const source = fs.readFileSync(`${process.cwd()}/resources/js/games/tower-throwback/TowerGame.tsx`, 'utf8')
    expect(source).not.toMatch(/bg-white\/(5|10|15|20)\b/)
    expect(source).not.toMatch(/bg-emerald-500\/25/)
  })
})
