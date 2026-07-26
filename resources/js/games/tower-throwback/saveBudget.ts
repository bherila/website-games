/**
 * THE shared save-size budgets, and the single place their relationship is
 * stated.
 *
 * There are deliberately TWO different limits, because they protect different
 * things:
 *
 *  - `MAX_SANDBOX_JSON_CHARS` (local): a sanity ceiling on localStorage. It is
 *    generous because tightening it would start REJECTING local saves that
 *    players can make today — a worse failure than not mirroring to the cloud.
 *  - `MAX_CLOUD_PAYLOAD_BYTES` (cloud): must match the server's cap in
 *    `App\Http\Requests\Games\StoreTowerSaveRequest::MAX_PAYLOAD_BYTES` exactly.
 *
 * Before this module the client measured 5,000,000 CHARACTERS while the server
 * rejected anything over 1,048,576 BYTES, and the server's comment claimed it
 * was "mirroring the client's 1 MB budget". A large tower therefore saved
 * locally and then failed every cloud push — silently, because non-conflict
 * push failures were swallowed. Measuring UTF-8 bytes here lets the client
 * predict that rejection and report it honestly instead.
 */

/** Local sanity ceiling, measured in JSON string length. */
export const MAX_SANDBOX_JSON_CHARS = 5_000_000

/**
 * Server-enforced cloud cap, measured in UTF-8 BYTES.
 * MUST equal `StoreTowerSaveRequest::MAX_PAYLOAD_BYTES`.
 */
export const MAX_CLOUD_PAYLOAD_BYTES = 1_048_576

/**
 * UTF-8 byte length of a string. `String.length` counts UTF-16 code units, so
 * it under-reports every non-ASCII character — which is precisely the class of
 * payload that would pass a client-side check and then be rejected by the
 * server. `TextEncoder` is used when available; the fallback computes the same
 * value directly so the check is never silently skipped.
 */
export function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length
  }

  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i) ?? 0
    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code <= 0xffff) {
      bytes += 3
    } else {
      bytes += 4
      i += 1 // surrogate pair consumed
    }
  }
  return bytes
}

/** Whether a serialized save is small enough for the server to accept. */
export function fitsCloudBudget(serialized: string): boolean {
  return utf8ByteLength(serialized) <= MAX_CLOUD_PAYLOAD_BYTES
}
