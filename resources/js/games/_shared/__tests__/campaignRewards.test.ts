import { earnsCompletionReward } from '../campaignRewards'

describe('earnsCompletionReward', () => {
  it('rewards first clears and star improvements only', () => {
    expect(earnsCompletionReward(0, 1)).toBe(true)
    expect(earnsCompletionReward(1, 3)).toBe(true)
    expect(earnsCompletionReward(3, 3)).toBe(false)
    expect(earnsCompletionReward(3, 1)).toBe(false)
  })
})
