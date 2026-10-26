import { getVisualTestConfig, shouldShowRenderCost } from '../visualTestMode'

describe('visual test mode', () => {
  it.each(['bulkGhost', 'eval', 'heatmap', 'disasters', 'toastHistory', 'shaftResize'] as const)(
    'parses the %s surface',
    (surface) => {
      expect(getVisualTestConfig(`?visualTest=1&seed=1553&scenario=fire&surface=${surface}`)).toEqual({
        seed: 1553,
        scenario: 'fire',
        surface,
        time: null,
      })
    },
  )

  it('falls back safely for unknown scenarios, surfaces, and seeds', () => {
    expect(getVisualTestConfig('?visualTest=1&seed=nope&scenario=nope&surface=nope')).toEqual({
      seed: 1,
      scenario: 'starter',
      surface: null,
      time: null,
    })
    expect(getVisualTestConfig('?scenario=starter')).toBeNull()
  })

  it.each(['activityDay', 'activityNight'] as const)('parses the %s scenario', (scenario) => {
    expect(getVisualTestConfig(`?visualTest=1&seed=1555&scenario=${scenario}`)).toEqual({ seed: 1555, scenario, surface: null, time: null })
  })

  it('parses the Niagara scenario', () => {
    expect(getVisualTestConfig('?visualTest=1&seed=1676&scenario=niagara')).toEqual({
      seed: 1676,
      scenario: 'niagara',
      surface: null,
      time: null,
    })
  })

  it.each(['day', 'night'] as const)('parses the %s art-pack time', (time) => {
    expect(getVisualTestConfig(`?visualTest=1&seed=1502&scenario=endgame&time=${time}`)).toEqual({
      seed: 1502,
      scenario: 'endgame',
      surface: null,
      time,
    })
  })
})

describe('shouldShowRenderCost', () => {
  it('hides renderer cost telemetry from an ordinary session', () => {
    expect(shouldShowRenderCost('')).toBe(false)
    expect(shouldShowRenderCost('?seed=4')).toBe(false)
  })

  it('shows it to visual tests and to an explicit renderStats request', () => {
    expect(shouldShowRenderCost('?visualTest=1&scenario=endgame')).toBe(true)
    expect(shouldShowRenderCost('?renderStats=1')).toBe(true)
  })
})
