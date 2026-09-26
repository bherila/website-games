import { clampToolbarX } from '../ui/PieceActionBar'

describe('clampToolbarX', () => {
  it('leaves a bar that already fits centred on its piece', () => {
    expect(clampToolbarX(200, 150, 400)).toBe(200)
  })

  it('pushes a bar over a left-edge piece back inside the board', () => {
    expect(clampToolbarX(20, 150, 375)).toBe(83)
  })

  it('pushes a bar over a right-edge piece back inside the board', () => {
    expect(clampToolbarX(360, 150, 375)).toBe(292)
  })

  it('centres the bar when the board is narrower than the bar', () => {
    expect(clampToolbarX(10, 150, 120)).toBe(60)
  })
})
