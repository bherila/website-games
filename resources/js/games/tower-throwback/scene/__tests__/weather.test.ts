import { precipScrollPhase, weatherForDay, type WeatherKind, weatherLookForDay } from '../weather'

describe('weatherForDay', () => {
  it('is a deterministic pure function of the day', () => {
    for (let day = 1; day <= 500; day++) {
      expect(weatherForDay(day)).toBe(weatherForDay(day))
    }
  })

  it('produces a sane distribution over many days with every kind represented', () => {
    const counts: Record<WeatherKind, number> = { clear: 0, overcast: 0, rain: 0, snow: 0 }
    const total = 4000
    for (let day = 1; day <= total; day++) {
      counts[weatherForDay(day)] += 1
    }

    // Every kind appears at least occasionally.
    expect(counts.clear).toBeGreaterThan(0)
    expect(counts.overcast).toBeGreaterThan(0)
    expect(counts.rain).toBeGreaterThan(0)
    expect(counts.snow).toBeGreaterThan(0)

    // Clear is the plurality; snow the rarest. Loose bands around 55/25/15/5%.
    expect(counts.clear).toBeGreaterThan(counts.overcast)
    expect(counts.overcast).toBeGreaterThan(counts.rain)
    expect(counts.rain).toBeGreaterThan(counts.snow)
    expect(counts.clear / total).toBeGreaterThan(0.45)
    expect(counts.clear / total).toBeLessThan(0.65)
    expect(counts.snow / total).toBeLessThan(0.12)
  })

  it('maps kinds to a look whose precipitation matches', () => {
    expect(weatherLookForDay(firstDayWith('clear')).precip).toBe('none')
    expect(weatherLookForDay(firstDayWith('overcast')).precip).toBe('none')
    expect(weatherLookForDay(firstDayWith('rain')).precip).toBe('rain')
    expect(weatherLookForDay(firstDayWith('snow')).precip).toBe('snow')
    // Only precipitating kinds are opaque; clear/overcast draw no precipitation.
    expect(weatherLookForDay(firstDayWith('clear')).precipOpacity).toBe(0)
    expect(weatherLookForDay(firstDayWith('rain')).precipOpacity).toBeGreaterThan(0)
  })
})

describe('precipScrollPhase', () => {
  it('is deterministic for the same (day, minute, kind)', () => {
    expect(precipScrollPhase(3, 500, 'rain')).toEqual(precipScrollPhase(3, 500, 'rain'))
    expect(precipScrollPhase(9, 12, 'snow')).toEqual(precipScrollPhase(9, 12, 'snow'))
  })

  it('stays bounded in [0, 1) across a long soak', () => {
    for (let day = 1; day <= 40; day++) {
      for (const minute of [0, 359.7, 720, 1439.9]) {
        for (const kind of ['rain', 'snow'] as const) {
          const phase = precipScrollPhase(day, minute, kind)
          expect(phase.x).toBeGreaterThanOrEqual(0)
          expect(phase.x).toBeLessThan(1)
          expect(phase.y).toBeGreaterThanOrEqual(0)
          expect(phase.y).toBeLessThan(1)
        }
      }
    }
  })

  it('advances as sim minutes pass (rain falls)', () => {
    const early = precipScrollPhase(1, 100, 'rain')
    const later = precipScrollPhase(1, 100.5, 'rain')
    expect(later.y).not.toBe(early.y)
  })
})

function firstDayWith(kind: WeatherKind): number {
  for (let day = 1; day < 5000; day++) {
    if (weatherForDay(day) === kind) {
      return day
    }
  }
  throw new Error(`no day produced weather kind ${kind}`)
}
