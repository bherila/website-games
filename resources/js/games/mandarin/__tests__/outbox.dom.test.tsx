/**
 * A session practised with no connection is kept locally and must eventually
 * reach the server. The outbox always persisted correctly; nothing ever replayed
 * it, so those events sat in local storage until a reset threw them away.
 */
import { render, screen, waitFor } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import type { PracticeEvent } from '../contracts/mandarin'
import { loadCourse } from '../domain/course'
import { teachingExposureEvent } from '../domain/events'
import { chunkEvents, drainOutbox, drainOutboxUntilCaughtUp, isPermanentRejection, MAX_EVENT_BATCH, type RejectedEvent } from '../domain/outbox'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

const course = loadCourse()

function strandedEvents(count: number): PracticeEvent[] {
  const context = {
    identity: course.identity,
    clientInstanceId: 'instance-offline',
    sessionId: 'session-offline',
    now: () => '2026-09-07T10:00:00.000Z',
  }

  return Array.from({ length: count }, () => teachingExposureEvent(context, 's1', 's1n1'))
}

function setup(pending: PracticeEvent[]) {
  const store = createMemoryPreviewStore()
  store.saveSettings({ twoDMode: true, lowMotion: true })
  store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.1.1', onboardingComplete: true, currentNodeId: 's1n1' })
  store.saveOutbox(pending)
  const runtime = createPreviewRuntime({ scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })

  return { runtime, store }
}

describe('practice event outbox', () => {
  it('splits a backlog into batches the server will accept', () => {
    // The server caps a batch at `mandarin.events.max_batch` and answers an
    // oversized upload with a 422. For a replay that is permanent, so a long
    // offline session would strand every event behind it.
    const batches = chunkEvents(strandedEvents(120))
    expect(batches).toHaveLength(3)
    expect(batches.every((batch) => batch.length <= MAX_EVENT_BATCH)).toBe(true)
    expect(batches.flat()).toHaveLength(120)
    expect(chunkEvents([])).toEqual([])
  })

  it('keeps exactly the events the server did not acknowledge', async () => {
    const events = strandedEvents(3)
    let held = [...events]
    // The middle event is refused for now; the other two are accepted and must go.
    const outcome = await drainOutbox({
      read: () => held,
      write: (next) => { held = next },
      deadLetter: () => { throw new Error('a retryable rejection is not dead-lettered') },
      send: (batch) => Promise.resolve({
        lastSequence: 2,
        acknowledgments: batch.map((event, index) => ({
          clientEventId: event.clientEventId,
          status: index === 1 ? 'rejected' as const : 'accepted' as const,
          canonicalSequence: null,
          serverAcceptedAt: null,
          correctness: null,
          grade: null,
          reasonCode: index === 1 ? 'unsupported_schema' : null,
        })),
      }),
      isCurrent: () => true,
    })

    expect(outcome).toBe('sent')
    expect(held).toEqual([events[1]])
  })

  function acknowledge(batch: PracticeEvent[], rejectedIds: ReadonlySet<string> = new Set(), reasonCode = 'unsupported_schema') {
    return {
      lastSequence: batch.length,
      acknowledgments: batch.map((event) => ({
        clientEventId: event.clientEventId,
        status: rejectedIds.has(event.clientEventId) ? 'rejected' as const : 'accepted' as const,
        canonicalSequence: null,
        serverAcceptedAt: null,
        correctness: null,
        grade: null,
        reasonCode: rejectedIds.has(event.clientEventId) ? reasonCode : null,
      })),
    }
  }

  it('also sends an answer appended while an upload was in flight', async () => {
    // A review answer can be appended while the previous upload is still running; a
    // single drain reads the outbox once and would leave it behind (#109 review).
    const [first, appended] = strandedEvents(2)
    let held = [first!]
    const sent: string[] = []
    const send = jest.fn((batch: PracticeEvent[]) => {
      sent.push(...batch.map((event) => event.clientEventId))
      if (send.mock.calls.length === 1) held = [...held, appended!]
      return Promise.resolve(acknowledge(batch))
    })
    const outcome = await drainOutboxUntilCaughtUp({ read: () => held, write: (next) => { held = next }, deadLetter: () => {}, send, isCurrent: () => true })

    expect(outcome).toBe('sent')
    expect(held).toEqual([])
    expect(sent).toEqual([first!.clientEventId, appended!.clientEventId])
  })

  it('does not loop on an event the server keeps rejecting', async () => {
    const [refused] = strandedEvents(1)
    let held = [refused!]
    const send = jest.fn((batch: PracticeEvent[]) => Promise.resolve(acknowledge(batch, new Set([refused!.clientEventId]))))
    const outcome = await drainOutboxUntilCaughtUp({ read: () => held, write: (next) => { held = next }, deadLetter: () => {}, send, isCurrent: () => true })

    expect(outcome).toBe('sent')
    expect(held).toEqual([refused])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sets aside an event the server refuses for good, and stops resending it', async () => {
    const [refused, accepted, later] = strandedEvents(3)
    let held = [refused!, accepted!, later!]
    const deadLetters: RejectedEvent[] = []
    const send = jest.fn((batch: PracticeEvent[]) => Promise.resolve(acknowledge(batch, new Set([refused!.clientEventId]), 'conflict')))
    const options = { read: () => held, write: (next: PracticeEvent[]) => { held = next }, deadLetter: (rejected: RejectedEvent[]) => { deadLetters.push(...rejected) }, send, isCurrent: () => true }

    expect(await drainOutbox(options)).toBe('sent')
    expect(held).toEqual([])
    expect(deadLetters).toEqual([{ event: refused, reasonCode: 'conflict' }])

    // The next flush has nothing to resend.
    expect(await drainOutbox(options)).toBe('empty')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('treats only known permanent reasons as permanent', () => {
    const rejected = (reasonCode: string | null) => ({ status: 'rejected' as const, reasonCode })
    for (const reason of ['conflict', 'invalid_payload', 'invalid_kind', 'invalid_option', 'invalid_event_id', 'unknown_exercise', 'unknown_course_revision', 'unknown_scene', 'unknown_node']) {
      expect(isPermanentRejection(rejected(reason))).toBe(true)
    }
    // A server rollback, an expired session or a reason this client does not know yet stays queued.
    for (const reason of ['unsupported_schema', 'unsupported_kind', 'sign_in_required', 'some_future_reason', null]) {
      expect(isPermanentRejection(rejected(reason))).toBe(false)
    }
    expect(isPermanentRejection({ status: 'accepted', reasonCode: 'conflict' })).toBe(false)
  })

  it('stops the drain when the session has expired instead of retrying every batch', async () => {
    let held = strandedEvents(120)
    let calls = 0
    const outcome = await drainOutbox({
      read: () => held,
      write: (next) => { held = next },
      deadLetter: () => { throw new Error('sign-in is not a permanent rejection') },
      send: (batch) => {
        calls += 1

        return Promise.resolve({
          lastSequence: 0,
          acknowledgments: batch.map((event) => ({
            clientEventId: event.clientEventId,
            status: 'rejected' as const,
            canonicalSequence: null,
            serverAcceptedAt: null,
            correctness: null,
            grade: null,
            reasonCode: 'sign_in_required',
          })),
        })
      },
      isCurrent: () => true,
    })

    expect(outcome).toBe('sign_in_required')
    expect(calls).toBe(1)
    // Nothing was acknowledged, so nothing is dropped.
    expect(held).toHaveLength(120)
  })

  it('replays events stranded by an earlier offline session on the next load', async () => {
    const { runtime, store } = setup(strandedEvents(3))
    expect(store.loadOutbox()).toHaveLength(3)

    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')

    await waitFor(() => expect(store.loadOutbox()).toHaveLength(0))
    runtime.dispose()
  })

  it('keeps a refused event on the device, counts it, and sends the rest', async () => {
    const [good, retired] = strandedEvents(2)
    // An event for a content version the server never had is refused for good.
    const { runtime, store } = setup([good!, { ...retired!, contentVersion: '0.0.0' }])

    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')

    await waitFor(() => expect(store.loadOutbox()).toHaveLength(0))
    expect(store.loadDeadLetters()).toEqual([expect.objectContaining({ reasonCode: 'unknown_course_revision', event: expect.objectContaining({ clientEventId: retired!.clientEventId }) })])
    expect(screen.getAllByTestId('not-accepted')[0]).toHaveTextContent('1 answer not accepted')
    runtime.dispose()
  })

  it('drains a backlog larger than one batch without the gateway refusing it', async () => {
    // The mock enforces the same 64-event ceiling as the API, so an unchunked
    // replay throws here exactly as it would 422 in production.
    const { runtime, store } = setup(strandedEvents(120))

    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')

    await waitFor(() => expect(store.loadOutbox()).toHaveLength(0))
    runtime.dispose()
  })

  it('keeps events when the network is down, and sends them when it returns', async () => {
    const store = createMemoryPreviewStore()
    store.saveSettings({ twoDMode: true, lowMotion: true })
    store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.1.1', onboardingComplete: true, currentNodeId: 's1n1' })
    store.saveOutbox(strandedEvents(2))
    const offline = createPreviewRuntime({ scenario: findPreviewScenario('offline'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })

    const view = render(<MandarinGame runtime={offline} />)
    await screen.findByTestId('home-screen')
    // Nothing is lost while the network refuses the upload.
    await waitFor(() => expect(store.loadOutbox()).toHaveLength(2))
    view.unmount()
    offline.dispose()

    // Same store, working connection: the backlog goes out.
    const online = createPreviewRuntime({ scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0 })
    render(<MandarinGame runtime={online} />)
    await screen.findByTestId('home-screen')
    await waitFor(() => expect(store.loadOutbox()).toHaveLength(0))
    online.dispose()
  })
})
