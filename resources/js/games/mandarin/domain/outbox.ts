import type { AppendResult, PracticeEvent } from '../contracts/mandarin'

/**
 * Batching for the practice-event outbox.
 *
 * Events are held locally until the server acknowledges them, so a session
 * played with no connection is replayed later rather than lost. The server
 * enforces `mandarin.events.max_batch` (default 64) and answers an oversized
 * upload with a 422, which for a replay is permanent: the backlog can only grow,
 * so one long offline session would strand every event behind it forever.
 *
 * Replay is safe because `(user_id, client_event_id)` is unique and an identical
 * re-upload is acknowledged `already_present` rather than inserted twice.
 */

/**
 * Kept below the server's default deliberately. `MandarinEventBatchTest` asserts
 * the configured limit is not lowered past it, so the two cannot drift apart
 * silently.
 */
export const MAX_EVENT_BATCH = 50

export function chunkEvents<T>(events: readonly T[], size: number = MAX_EVENT_BATCH): T[][] {
  if (size < 1) throw new Error('Batch size must be at least 1.')
  const batches: T[][] = []
  for (let index = 0; index < events.length; index += size) {
    batches.push(events.slice(index, index + size))
  }

  return batches
}

export type DrainOutcome = 'sent' | 'empty' | 'sign_in_required' | 'offline'

export interface DrainOptions {
  /** The events still awaiting acknowledgment. */
  read: () => PracticeEvent[]
  /** Persists the remaining events; called after each acknowledged batch. */
  write: (events: PracticeEvent[]) => void
  send: (events: PracticeEvent[]) => Promise<AppendResult>
  /** False once a reset has invalidated this drain, so it stops writing. */
  isCurrent: () => boolean
}

/**
 * Uploads the outbox in acceptable batches, clearing each entry the server
 * acknowledges. Anything not acknowledged stays put for the next attempt, so a
 * failure mid-backlog costs the remaining batches and nothing else.
 */
export async function drainOutbox(options: DrainOptions): Promise<DrainOutcome> {
  const pending = options.read()
  if (pending.length === 0) return 'empty'

  try {
    for (const batch of chunkEvents(pending)) {
      const result = await options.send(batch)
      if (!options.isCurrent()) return 'sent'
      const acknowledged = new Set(
        result.acknowledgments.filter((ack) => ack.status !== 'rejected').map((ack) => ack.clientEventId),
      )
      options.write(options.read().filter((event) => !acknowledged.has(event.clientEventId)))
      // A stale session rejects everything that follows; stop rather than
      // hammer the endpoint once per batch.
      if (result.acknowledgments.some((ack) => ack.reasonCode === 'sign_in_required')) {
        return 'sign_in_required'
      }
    }

    return 'sent'
  } catch {
    // Kept for the next append, reconnect or load.
    return 'offline'
  }
}
