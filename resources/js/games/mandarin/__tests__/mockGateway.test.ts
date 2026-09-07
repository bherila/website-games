import { MockMandarinGateway } from '../adapters/MockMandarinGateway'
import { findPreviewScenario } from '../adapters/previewScenarios'
import type { AudioResolution, AudioSourceRef, PracticeEvent } from '../contracts/mandarin'
import { loadCourse } from '../domain/course'

const course = loadCourse()
const utterance: AudioSourceRef = { sourceKind: 'utterance', sourceId: '01a', variant: 'normal' }
const now = (): Date => new Date('2026-09-06T00:00:00Z')

function gateway(id: string, seed: string[] = []): MockMandarinGateway {
  return new MockMandarinGateway(course, findPreviewScenario(id), { now, seedCompletedNodeIds: seed })
}

async function resolve(g: MockMandarinGateway, source: AudioSourceRef = utterance): Promise<AudioResolution> {
  const response = await g.resolveAudio({ ...course.identity, sources: [source] })
  return response.results[0]!
}

function event(overrides: Partial<PracticeEvent> = {}): PracticeEvent {
  return {
    ...course.identity,
    schemaVersion: 1,
    clientEventId: 'evt-1',
    clientInstanceId: 'client',
    sessionId: 'session',
    clientOccurredAt: now().toISOString(),
    opportunityId: 'opp',
    kind: 'response',
    mode: 'lesson',
    sceneId: 's1',
    nodeId: 's1n1',
    exerciseId: 'e001',
    source: utterance,
    responseAction: 'answer',
    selectedOptionId: 'e001-o1',
    orderedTileIds: null,
    textHelpUsed: false,
    pinyinHelpUsed: false,
    audioEvidence: { status: 'completed', normalPlayCount: 1, slowPlayCount: 0, interrupted: false },
    ...overrides,
  }
}

describe('MockMandarinGateway audio', () => {
  it('bootstraps as preview with no ready assets', async () => {
    const boot = await gateway('fresh').bootstrap()
    expect(boot.runtime).toBe('preview')
    expect(boot.audio.results).toEqual([])
    expect(boot.capabilities.canSaveToAccount).toBe(false)
  })

  it('never returns a ready state for speech in any scenario', async () => {
    for (const id of ['fresh', 'queuedAudio', 'generatingAudio', 'readyAudio', 'providerUnavailable', 'retryableError', 'guest']) {
      const g = gateway(id)
      let resolution = await resolve(g)
      for (let i = 0; i < 4 && (resolution.state === 'queued' || resolution.state === 'generating'); i += 1) {
        resolution = await g.pollAudio(resolution.requestId)
      }
      expect(resolution.state).not.toBe('ready')
    }
  })

  it('walks queued → generating → preview in the readyAudio scenario', async () => {
    const g = gateway('readyAudio')
    const first = await resolve(g)
    expect(first.state).toBe('queued')
    if (first.state !== 'queued') return
    const second = await g.pollAudio(first.requestId)
    expect(second.state).toBe('generating')
    if (second.state !== 'generating') return
    const third = await g.pollAudio(second.requestId)
    expect(third.state).toBe('preview')
  })

  it('stays queued forever in the queuedAudio scenario', async () => {
    const g = gateway('queuedAudio')
    let resolution = await resolve(g)
    for (let i = 0; i < 5; i += 1) {
      expect(resolution.state).toBe('queued')
      if (resolution.state !== 'queued') return
      resolution = await g.pollAudio(resolution.requestId)
    }
  })

  it('fails retryably once, then succeeds on explicit retry', async () => {
    const g = gateway('retryableError')
    const first = await resolve(g)
    expect(first).toMatchObject({ state: 'failed', retryable: true, code: 'provider_unavailable' })
    const second = await resolve(g)
    expect(second.state).toBe('preview')
  })

  it('reports unavailable states honestly', async () => {
    expect(await resolve(gateway('providerUnavailable'))).toMatchObject({ state: 'unavailable', code: 'provider_unconfigured', retryable: false })
    expect(await resolve(gateway('guest'))).toMatchObject({ state: 'unavailable', code: 'sign_in_required' })
    await expect(resolve(gateway('offline'))).rejects.toThrow('Failed to fetch')
  })

  it('rejects unknown sources, foreign course revisions, and oversized batches', async () => {
    const g = gateway('fresh')
    expect(await resolve(g, { sourceKind: 'utterance', sourceId: 'nope', variant: 'normal' })).toMatchObject({ state: 'failed', code: 'unknown_source', retryable: false })
    expect(await resolve(g, { sourceKind: 'support', sourceId: 'nope', variant: 'normal' })).toMatchObject({ state: 'failed', code: 'unknown_source', retryable: false })
    await expect(g.resolveAudio({ courseId: 'x', contentVersion: '1', sources: [] })).rejects.toThrow(/Unknown course revision/)
    await expect(g.resolveAudio({ ...course.identity, sources: Array.from({ length: 17 }, () => utterance) })).rejects.toThrow(/at most 16/)
    expect(await resolve(g, { sourceKind: 'sfx', sourceId: 'ui-tap', variant: 'default' })).toMatchObject({ state: 'preview', delivery: 'simulated' })
    expect(await resolve(g, { sourceKind: 'support', sourceId: 'please', variant: 'normal' })).toMatchObject({ state: 'preview', delivery: 'simulated' })
  })
})

describe('MockMandarinGateway events', () => {
  it('accepts, grades, and is idempotent for identical payloads', async () => {
    const g = gateway('fresh')
    const first = await g.appendEvents([event()])
    expect(first.acknowledgments[0]).toMatchObject({ status: 'accepted', canonicalSequence: 1, correctness: 'correct', grade: 'Good' })
    const again = await g.appendEvents([event()])
    expect(again.acknowledgments[0]).toMatchObject({ status: 'already_present', canonicalSequence: 1 })
    const conflict = await g.appendEvents([event({ selectedOptionId: 'e001-o2' })])
    expect(conflict.acknowledgments[0]).toMatchObject({ status: 'rejected', reasonCode: 'conflict' })
  })

  it('does not score answers without completed audio', async () => {
    const g = gateway('fresh')
    const ack = (await g.appendEvents([event({ clientEventId: 'evt-2', audioEvidence: { status: 'simulated', normalPlayCount: 0, slowPlayCount: 0, interrupted: false } })])).acknowledgments[0]!
    expect(ack.correctness).toBe('unscored')
    expect(ack.grade).toBeNull()
  })

  it('rejects saves when sign-in is required and throws when offline', async () => {
    const rejected = await gateway('signInRequired').appendEvents([event()])
    expect(rejected.acknowledgments[0]).toMatchObject({ status: 'rejected', reasonCode: 'sign_in_required' })
    await expect(gateway('offline').appendEvents([event()])).rejects.toThrow('Failed to fetch')
  })

  it('projects node completion from accepted events and seeds', async () => {
    const g = gateway('returning', ['s1n1', 's1n2'])
    const before = await g.getProgress()
    expect(before.completedSceneIds).toEqual(['s1'])
    expect(before.currentNodeId).toBe('s2n1')
    await g.appendEvents([event({ clientEventId: 'evt-3', kind: 'node_complete', nodeId: 's2n1', responseAction: null, exerciseId: null, source: null })])
    const after = await g.getProgress()
    expect(after.completedNodeIds).toContain('s2n1')
    expect(after.currentNodeId).toBe('s2n2')
    expect(after.dueTargetIds.length).toBe(12)
  })
})
