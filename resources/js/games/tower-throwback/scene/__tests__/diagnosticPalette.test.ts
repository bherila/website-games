import { cssRamp, DIAGNOSTIC_RAMPS, diagnosticRamp, relativeLuminance } from '../diagnosticPalette'
import { evalTint } from '../evalTint'

const MODES = ['classic', 'colorSafe'] as const

describe('diagnosticPalette', () => {
  it('keeps the classic ramp byte-identical to the pre-existing palette', () => {
    // Guards against a silent visual regression for players who never opt in.
    expect(DIAGNOSTIC_RAMPS.classic).toEqual({
      low: 0x3fae52,
      mid: 0xe0c030,
      high: 0xd83a2a,
      catchment: 0x38bdf8,
    })
  })

  it('builds the legend gradient from the same stops the meshes use', () => {
    for (const mode of MODES) {
      const ramp = diagnosticRamp(mode)
      const hex = (v: number): string => `#${v.toString(16).padStart(6, '0')}`

      expect(cssRamp(mode)).toBe(`linear-gradient(90deg, ${hex(ramp.low)}, ${hex(ramp.mid)}, ${hex(ramp.high)})`)
      // The desirability legend reverses direction but must reuse the colours.
      expect(cssRamp(mode, true)).toBe(`linear-gradient(90deg, ${hex(ramp.high)}, ${hex(ramp.mid)}, ${hex(ramp.low)})`)
    }
  })

  it('separates the colour-safe ramp endpoints on luminance, not just hue', () => {
    const { low, high, mid } = DIAGNOSTIC_RAMPS.colorSafe
    const lum = (v: number): number => relativeLuminance(v)

    // A CVD-safe ramp must survive being reduced to greyscale: the two ends and
    // the midpoint all need to be tellable apart without colour information.
    expect(Math.abs(lum(low) - lum(high))).toBeGreaterThan(0.15)
    expect(Math.abs(lum(mid) - lum(high))).toBeGreaterThan(0.15)
    expect(Math.abs(lum(mid) - lum(low))).toBeGreaterThan(0.15)
  })

  it('keeps the catchment highlight distinct from every ramp stop', () => {
    for (const mode of MODES) {
      const { low, mid, high, catchment } = diagnosticRamp(mode)
      expect([low, mid, high]).not.toContain(catchment)
    }
  })

  it('drives eval tints from the same ramp, reversed', () => {
    // Vacant is the ramp's worst stop; a thriving unit is its best.
    for (const mode of MODES) {
      const ramp = diagnosticRamp(mode)
      expect(evalTint({ kind: 'officeS', occupied: false, evalScore: 80 }, mode)).toBe(ramp.high)
      expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 100 }, mode)).toBe(ramp.low)
      expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 20 }, mode)).toBe(ramp.mid)
    }
  })

  it('defaults eval tints to the classic ramp when no mode is supplied', () => {
    expect(evalTint({ kind: 'officeS', occupied: false, evalScore: 80 })).toBe(DIAGNOSTIC_RAMPS.classic.high)
  })
})
