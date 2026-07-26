import type { EvalBreakdown } from '../../engine/occupancy'
import { evalFactorLines } from '../evalFactors'

function breakdown(overrides: Partial<EvalBreakdown> = {}): EvalBreakdown {
  return {
    score: 70,
    amenityBonus: 0,
    landmarkBonus: 0,
    fallsViewBonus: 0,
    affinityBonus: 0,
    superLobbyBonus: 0,
    glassBonus: 0,
    liveWorkBonus: 0,
    noisePenalty: 0,
    congestionPenalty: 0,
    restroomComfortPenalty: 0,
    trashPenalty: 0,
    dirtyPenalty: 0,
    incidentPenalty: 0,
    parkingPenalty: 0,
    infestationPenalty: 0,
    requestBonus: 0,
    ...overrides,
  }
}

describe('evalFactorLines', () => {
  it('omits zero factors (auto-filters to what is relevant for the unit)', () => {
    expect(evalFactorLines(breakdown())).toEqual([])
  })

  it('shows bonuses as positive and penalties as negative', () => {
    const lines = evalFactorLines(breakdown({ amenityBonus: 8, landmarkBonus: 5, fallsViewBonus: 5, noisePenalty: 6 }))
    expect(lines).toEqual([
      { key: 'amenityBonus', label: 'Nearby amenities', value: 8 },
      { key: 'landmarkBonus', label: 'Nearby landmark', value: 5 },
      { key: 'fallsViewBonus', label: 'Falls view', value: 5 },
      { key: 'noisePenalty', label: 'Noise', value: -6 },
    ])
  })

  it('rounds and preserves the bonus-then-penalty ordering', () => {
    const lines = evalFactorLines(breakdown({ glassBonus: 4.4, liveWorkBonus: 4, parkingPenalty: 3.6, superLobbyBonus: 5 }))
    expect(lines.map((l) => l.key)).toEqual(['superLobbyBonus', 'glassBonus', 'liveWorkBonus', 'parkingPenalty'])
    expect(lines.find((l) => l.key === 'liveWorkBonus')).toEqual({ key: 'liveWorkBonus', label: 'Jobs in the tower', value: 4 })
    expect(lines.find((l) => l.key === 'parkingPenalty')?.value).toBe(-4)
  })
})
