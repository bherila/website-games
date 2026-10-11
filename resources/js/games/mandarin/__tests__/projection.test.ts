import type { ProgressProjection } from '../contracts/mandarin'
import { newerProjection } from '../domain/projection'

function projection(lastSequence: number, dueTargetIds: string[]): ProgressProjection {
  return {
    courseId: 'mandarin-foundations',
    contentVersion: '1.1.1',
    lastSequence,
    completedNodeIds: [],
    completedSceneIds: [],
    currentNodeId: 's1n1',
    dueTargetIds,
    checkpointExposedIds: [],
    schedulerVersion: 'test',
    schedulerConfigHash: 'test',
    listeningCards: {},
  } as ProgressProjection
}

describe('newerProjection', () => {
  it('keeps the newer projection when an older read arrives last (#109 review)', () => {
    // Refresh A was sent after session 1, refresh B after session 2; A answers last.
    const afterSession2 = projection(20, ['later'])
    const afterSession1 = projection(10, ['just-reviewed'])
    expect(newerProjection(afterSession2, afterSession1)).toBe(afterSession2)
  })

  it('takes a newer or equal-sequence projection, and any projection when none is held', () => {
    const held = projection(10, ['a'])
    const newer = projection(11, ['b'])
    const sameSequenceLater = projection(10, ['a', 'c'])
    expect(newerProjection(held, newer)).toBe(newer)
    expect(newerProjection(held, sameSequenceLater)).toBe(sameSequenceLater)
    expect(newerProjection(null, held)).toBe(held)
  })
})
