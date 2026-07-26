import { canvasSizeForContainer, pointerNdcForRect } from '../scene/viewport'

describe('Block Blaster viewport helpers', () => {
  it('never grows the renderer beyond a small container', () => {
    expect(canvasSizeForContainer(220, 300)).toEqual({ width: 220, height: 300 })
    expect(canvasSizeForContainer(0, 0)).toEqual({ width: 1, height: 1 })
  })

  it('maps cached client-space bounds into normalized device coordinates', () => {
    const rect = { left: 20, top: 40, width: 200, height: 100 }

    expect(pointerNdcForRect(120, 90, rect)).toEqual({ x: 0, y: -0 })
    expect(pointerNdcForRect(20, 40, rect)).toEqual({ x: -1, y: 1 })
    expect(pointerNdcForRect(220, 140, rect)).toEqual({ x: 1, y: -1 })
  })
})
