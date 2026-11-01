import { clampToolbarX, placeToolbarY, TOOLBAR_TOP_LIMIT } from '../ui/PieceActionBar'

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

describe('placeToolbarY', () => {
  it('sits above the piece when there is room under the HUD', () => {
    expect(placeToolbarY(300, 380, 62, 800)).toBe(230)
  })

  it('drops below a piece near the top instead of covering it', () => {
    expect(placeToolbarY(80, 160, 62, 800)).toBe(168)
  })

  it('stays inside the board when there is room neither above nor below', () => {
    expect(placeToolbarY(60, 760, 62, 800)).toBe(800 - 62 - 8)
    expect(placeToolbarY(60, 100, 62, 120)).toBe(TOOLBAR_TOP_LIMIT)
  })
})
