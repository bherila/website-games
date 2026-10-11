import type { AppendResult, EventAcknowledgment, PracticeEvent } from '../contracts/mandarin'

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

/**
 * Rejections a resend can never fix: the payload is malformed, names content the
 * server never had, or reuses an event id with a different payload. Anything else,
 * including `unsupported_schema` (the server may be rolled back) and
 * `sign_in_required`, stays queued. An unrecognised code stays queued too, so a
 * reason added on the server later is never dropped by an older client.
 */
export const PERMANENT_REJECTION_REASONS: ReadonlySet<string> = new Set([
  'conflict',
  'invalid_event_id',
  'invalid_kind',
  'invalid_payload',
  'invalid_option',
  'unknown_course_revision',
  'unknown_scene',
  'unknown_node',
  'unknown_exercise',
])

export function isPermanentRejection(ack: Pick<EventAcknowledgment, 'status' | 'reasonCode'>): boolean {
  return ack.status === 'rejected' && ack.reasonCode !== null && PERMANENT_REJECTION_REASONS.has(ack.reasonCode)
}

/** An event the server refused for good, set aside instead of resent on every flush. */
export interface RejectedEvent {
  event: PracticeEvent
  reasonCode: string
}

export interface DrainOptions {
  /** The events still awaiting acknowledgment. */
  read: () => PracticeEvent[]
  /** Persists the remaining events; called after each acknowledged batch. */
  write: (events: PracticeEvent[]) => void
  /** Receives permanently rejected events before they leave the outbox. */
  deadLetter: (rejected: RejectedEvent[]) => void
  send: (events: PracticeEvent[]) => Promise<AppendResult>
  /** False once a reset has invalidated this drain, so it stops writing. */
  isCurrent: () => boolean
}

/**
 * Uploads the outbox in acceptable batches, clearing each entry the server
 * acknowledges. A permanent rejection is handed to `deadLetter` and removed;
 * anything else not acknowledged stays put for the next attempt, so a failure
 * mid-backlog costs the remaining batches and nothing else.
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
      const permanent = new Map(
        result.acknowledgments.filter(isPermanentRejection).map((ack) => [ack.clientEventId, ack.reasonCode!]),
      )
      // Set aside before removing, so an interruption between the two writes
      // leaves a duplicate rather than losing the event.
      const rejected = batch.filter((event) => permanent.has(event.clientEventId))
      if (rejected.length > 0) {
        options.deadLetter(rejected.map((event) => ({ event, reasonCode: permanent.get(event.clientEventId)! })))
      }
      options.write(options.read().filter((event) => !acknowledged.has(event.clientEventId) && !permanent.has(event.clientEventId)))
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

/**
 * Drains until no event appended during an upload is left behind. `drainOutbox`
 * reads the outbox once, so an answer appended while a batch is in flight would
 * wait for the next append, reconnect or load, and a caller that awaits the
 * drain before reading progress back would read a stale schedule. Only events
 * not yet attempted start another pass, so retryable rejections, which stay in
 * the outbox, cannot make it loop.
 */
export async function drainOutboxUntilCaughtUp(options: DrainOptions): Promise<DrainOutcome> {
  const attempted = new Set<string>()
  const markAttempted = (): void => {
    for (const event of options.read()) attempted.add(event.clientEventId)
  }
  markAttempted()
  let outcome = await drainOutbox(options)
  while (outcome === 'sent' && options.isCurrent() && options.read().some((event) => !attempted.has(event.clientEventId))) {
    markAttempted()
    outcome = await drainOutbox(options)
  }

  return outcome
}
