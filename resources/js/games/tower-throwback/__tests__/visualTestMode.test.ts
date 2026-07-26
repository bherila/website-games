import { getVisualTestConfig } from '../visualTestMode'

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

  it.each(['day', 'night'] as const)('parses the %s art-pack time', (time) => {
    expect(getVisualTestConfig(`?visualTest=1&seed=1502&scenario=endgame&time=${time}`)).toEqual({
      seed: 1502,
      scenario: 'endgame',
      surface: null,
      time,
    })
  })
})
