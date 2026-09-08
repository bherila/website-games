import courseJson from '../../../../data/mandarin/foundations.v1.json'
import { GatewayHttpError, HttpMandarinGateway, MANDARIN_API } from '../adapters/HttpMandarinGateway'
import type { PracticeEvent } from '../contracts/mandarin'

interface Call { url: string; init: RequestInit }

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function bootstrapBody(signedIn: boolean): unknown {
  return {
    runtime: 'live',
    course: courseJson,
    account: { signedIn, accountPartitionId: signedIn ? 'user:7' : null },
    capabilities: { canGenerateAudio: signedIn, canSaveToAccount: signedIn, hasDistinctMandarinVoices: true },
    audio: { courseId: 'mandarin-foundations', contentVersion: '1.1.0', results: [] },
    serverTime: '2026-09-06T00:00:00Z',
  }
}

function gatewayWith(handler: (call: Call) => Response | Promise<Response>): { gateway: HttpMandarinGateway; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return handler(call)
  }
  return { gateway: new HttpMandarinGateway({ fetch: fetchImpl, csrfToken: () => 'csrf-1', now: () => new Date('2026-09-07T00:00:00Z') }), calls }
}

const event: PracticeEvent = {
  courseId: 'mandarin-foundations', contentVersion: '1.1.0', schemaVersion: 1, clientEventId: 'e1', clientInstanceId: 'c', sessionId: 's',
  clientOccurredAt: '2026-09-06T00:00:00Z', opportunityId: 'o', kind: 'response', mode: 'lesson', sceneId: 's1', nodeId: 's1n1', exerciseId: 'e001',
  source: null, responseAction: 'answer', selectedOptionId: 'e001-o1', orderedTileIds: null, textHelpUsed: false, pinyinHelpUsed: false,
  audioEvidence: { status: 'completed', normalPlayCount: 1, slowPlayCount: 0, interrupted: false },
}

describe('HttpMandarinGateway', () => {
  it('parses the bootstrap course, caches it, and gives guests an empty local projection without calling progress', async () => {
    const { gateway, calls } = gatewayWith(() => jsonResponse(200, bootstrapBody(false)))
    const bootstrap = await gateway.bootstrap()
    expect(bootstrap.course.scenes).toHaveLength(10)
    expect(bootstrap.account.signedIn).toBe(false)
    const projection = await gateway.getProgress()
    expect(projection.currentNodeId).toBe('s1n1')
    expect(projection.dueTargetIds).toEqual([])
    expect(calls.map((call) => call.url)).toEqual([MANDARIN_API.bootstrap])
    expect(calls[0]!.init.credentials).toBe('same-origin')
  })

  it('derives due targets from the server review log with the pinned scheduler', async () => {
    const { gateway, calls } = gatewayWith((call) => call.url === MANDARIN_API.bootstrap
      ? jsonResponse(200, bootstrapBody(true))
      : jsonResponse(200, {
        courseId: 'mandarin-foundations', contentVersion: '1.1.0', lastSequence: 2, completedNodeIds: ['s1n1'], completedSceneIds: [], currentNodeId: 's1n2',
        dueTargetIds: [], checkpointExposedIds: [], schedulerVersion: 'ts-fsrs-5.4.2', schedulerConfigHash: 'x',
        listeningCards: { kind: 'graded-review-log', windowMinutes: 10, reviews: [{ targetId: 'hello', grade: 'Again', scheduleEligible: true, acceptedAt: '2026-09-06T00:00:00Z', sequence: 1 }] },
      }))
    await gateway.bootstrap()
    const projection = await gateway.getProgress()
    expect(projection.completedNodeIds).toEqual(['s1n1'])
    expect(projection.dueTargetIds).toEqual(['hello'])
    expect(calls[1]!.url).toBe(MANDARIN_API.progress)
  })

  it('sends CSRF on writes, refreshes it from responses, and maps 401/419 to sign_in_required rejections', async () => {
    let status = 200
    const { gateway, calls } = gatewayWith(() => status === 200
      ? jsonResponse(200, { acknowledgments: [{ clientEventId: 'e1', status: 'accepted', canonicalSequence: 1, serverAcceptedAt: 'x', correctness: 'correct', grade: 'Good', reasonCode: null }], lastSequence: 1 }, { 'X-CSRF-TOKEN': 'csrf-2' })
      : jsonResponse(status, { message: 'Unauthenticated.' }))
    const ok = await gateway.appendEvents([event])
    expect(ok.acknowledgments[0]?.status).toBe('accepted')
    expect((calls[0]!.init.headers as Record<string, string>)['X-CSRF-TOKEN']).toBe('csrf-1')
    status = 419
    const expired = await gateway.appendEvents([event])
    expect(expired.acknowledgments[0]).toMatchObject({ status: 'rejected', reasonCode: 'sign_in_required' })
    expect((calls[1]!.init.headers as Record<string, string>)['X-CSRF-TOKEN']).toBe('csrf-2')
    status = 401
    expect((await gateway.appendEvents([event])).acknowledgments[0]?.reasonCode).toBe('sign_in_required')
    status = 500
    await expect(gateway.appendEvents([event])).rejects.toBeInstanceOf(GatewayHttpError)
    expect(await gateway.appendEvents([])).toEqual({ acknowledgments: [], lastSequence: 0 })
  })

  it('passes audio resolutions through unchanged, treats auth failures as sign_in_required, and bounds batches', async () => {
    const ready = { state: 'ready', source: { sourceKind: 'utterance', sourceId: '01a', variant: 'normal' }, assetId: '1', url: '/media/games/mandarin/1/abc.m4a', expiresAt: null, contentHash: 'abc', contentType: 'audio/mp4', durationMs: 900, provenance: 'synthesized_speech' }
    let status = 202
    const { gateway } = gatewayWith((call) => call.url === MANDARIN_API.resolve
      ? (status === 202 ? jsonResponse(202, { courseId: 'mandarin-foundations', contentVersion: '1.1.0', results: [ready] }) : jsonResponse(status, {}))
      : jsonResponse(200, ready))
    const request = { courseId: 'mandarin-foundations', contentVersion: '1.1.0', sources: [{ sourceKind: 'utterance' as const, sourceId: '01a', variant: 'normal' as const }] }
    expect((await gateway.resolveAudio(request)).results[0]).toEqual(ready)
    expect(await gateway.pollAudio('1')).toEqual(ready)
    status = 401
    expect((await gateway.resolveAudio(request)).results[0]).toMatchObject({ state: 'unavailable', code: 'sign_in_required' })
    await expect(gateway.resolveAudio({ ...request, sources: Array.from({ length: 17 }, () => request.sources[0]!) })).rejects.toThrow(/at most 16/)
  })

  it('surfaces network failures as thrown errors (offline)', async () => {
    const { gateway } = gatewayWith(() => { throw new TypeError('Failed to fetch') })
    await expect(gateway.bootstrap()).rejects.toThrow('Failed to fetch')
  })
})
