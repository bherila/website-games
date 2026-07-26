import { tileIndex } from '../../engine/grid'
import { FLOOR_COUNT, GRID_WIDTH } from '../../gameTypes'
import { HEATMAP_FIELD_MAX, sampleHeatmapField } from '../heatmapLayer'

describe('heatmap field sampling', () => {
  it('uses the shared grid index for clicked tile values', () => {
    const field = new Float32Array(FLOOR_COUNT * GRID_WIDTH)
    field[tileIndex(7, 42)] = 12.5

    expect(sampleHeatmapField(field, 'noise', { floor: 7, x: 42 })).toEqual({
      floor: 7,
      kind: 'noise',
      value: 12.5,
      x: 42,
    })
  })

  it('rejects out-of-grid samples and pins legend ceilings', () => {
    const field = new Float32Array(FLOOR_COUNT * GRID_WIDTH)
    expect(sampleHeatmapField(field, 'congestion', { floor: 100, x: 0 })).toBeNull()
    expect(HEATMAP_FIELD_MAX.noise).toBe(30)
    expect(HEATMAP_FIELD_MAX.congestion).toBe(20)
  })
})
