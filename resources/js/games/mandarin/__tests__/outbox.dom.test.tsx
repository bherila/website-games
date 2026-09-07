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
import { chunkEvents, drainOutbox, MAX_EVENT_BATCH } from '../domain/outbox'
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
  store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.1', onboardingComplete: true, currentNodeId: 's1n1' })
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
    // The middle event is refused; the other two are accepted and must go.
    const outcome = await drainOutbox({
      read: () => held,
      write: (next) => { held = next },
      send: (batch) => Promise.resolve({
        lastSequence: 2,
        acknowledgments: batch.map((event, index) => ({
          clientEventId: event.clientEventId,
          status: index === 1 ? 'rejected' as const : 'accepted' as const,
          canonicalSequence: null,
          serverAcceptedAt: null,
          correctness: null,
          grade: null,
          reasonCode: index === 1 ? 'conflict' : null,
        })),
      }),
      isCurrent: () => true,
    })

    expect(outcome).toBe('sent')
    expect(held).toEqual([events[1]])
  })

  it('stops the drain when the session has expired instead of retrying every batch', async () => {
    let held = strandedEvents(120)
    let calls = 0
    const outcome = await drainOutbox({
      read: () => held,
      write: (next) => { held = next },
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
    store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.1', onboardingComplete: true, currentNodeId: 's1n1' })
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
