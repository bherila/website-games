import type { ProgressProjection } from '../contracts/mandarin'

/**
 * Progress reads are not serialised: a refresh started after one session can
 * be answered before a refresh started after an earlier one. `lastSequence`
 * only grows as the server accepts events, so a response with a lower
 * sequence than the projection already held is older and must not replace it.
 * Equal sequences are taken, since the due list also moves with time.
 */
export function newerProjection(current: ProgressProjection | null, next: ProgressProjection): ProgressProjection {
  if (current && next.lastSequence < current.lastSequence) return current

  return next
}
