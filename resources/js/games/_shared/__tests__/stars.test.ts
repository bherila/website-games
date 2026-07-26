import { starsForAssists } from '../stars'

describe('starsForAssists', () => {
  it.each([
    [0, 3],
    [1, 2],
    [2, 2],
    [3, 1],
  ])('maps %i assists to %i stars', (assists, stars) => {
    expect(starsForAssists(assists)).toBe(stars)
  })
})
