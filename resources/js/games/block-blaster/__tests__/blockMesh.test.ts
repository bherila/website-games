import { BLOCK_CATALOG, type BlockType } from '../levels/levelTypes'
import { blockVisualSpec } from '../scene/builders/blockMesh'

const ALL_TYPES: BlockType[] = ['crate', 'smallCube', 'beam', 'plank', 'barrel', 'stone']

describe('blockVisualSpec', () => {
  it.each(ALL_TYPES.map((type) => [type] as const))('%s: size/shape/colors match BLOCK_CATALOG', (type) => {
    const spec = blockVisualSpec(type)
    const catalog = BLOCK_CATALOG[type]

    expect(spec.shape).toBe(catalog.shape)
    expect(spec.size).toEqual(catalog.size)
    expect(spec.baseColor).toBe(catalog.color)
    expect(spec.accentColor).toBe(catalog.accentColor)
  })

  it('assigns the spec-mandated look per type (screenshot table)', () => {
    expect(blockVisualSpec('crate').pattern).toBe('frame')
    expect(blockVisualSpec('smallCube').pattern).toBe('flat')
    expect(blockVisualSpec('beam').pattern).toBe('zigzag')
    expect(blockVisualSpec('plank').pattern).toBe('trim')
    expect(blockVisualSpec('barrel').pattern).toBe('badge')
    expect(blockVisualSpec('stone').pattern).toBe('chisel')
  })

  it('barrel is the only cylinder shape', () => {
    for (const type of ALL_TYPES) {
      const spec = blockVisualSpec(type)
      if (type === 'barrel') {
        expect(spec.shape).toBe('cylinder')
      } else {
        expect(spec.shape).toBe('box')
      }
    }
  })

  it('stone is the heaviest-looking block and smallCube the lightest by catalog mass', () => {
    const stoneMass = BLOCK_CATALOG.stone.mass
    const smallCubeMass = BLOCK_CATALOG.smallCube.mass
    for (const type of ALL_TYPES) {
      expect(BLOCK_CATALOG[type].mass).toBeLessThanOrEqual(stoneMass)
      expect(BLOCK_CATALOG[type].mass).toBeGreaterThanOrEqual(smallCubeMass)
    }
  })
})
