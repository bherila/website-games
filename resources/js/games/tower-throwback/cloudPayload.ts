/**
 * Cloud save wire format v3: the save JSON, gzip-compressed and base64-encoded
 * inside a small envelope.
 *
 * A late-game tower serializes to about 1 MB (roughly 430 bytes per unit and
 * 460 per person in flight), past the server's 1 MiB cloud cap, so big towers
 * silently stopped syncing. The enveloped copy is about 22× smaller.
 *
 * Compatibility, both ways:
 * - Older payloads (raw v1/v2 sandbox objects) still decode: they pass through
 *   unchanged to the existing migration.
 * - Older clients meet a v3 envelope as `{ version: 3, … }`. Their migration
 *   only knows versions 1 and 2, so they reject it as an unknown future save
 *   without touching local storage — the same path any newer save takes.
 * - This client refuses an envelope whose `format` or `version` it does not
 *   know, so a later format cannot be mis-decoded either.
 *
 * Local saves stay uncompressed JSON; only the cloud copy is enveloped.
 * `fflate` is used rather than CompressionStream because jsdom (the test
 * environment) has no CompressionStream, and its synchronous API keeps the
 * push path's byte-budget check synchronous.
 */
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'

import { MAX_SANDBOX_JSON_CHARS } from './saveBudget'

export const CLOUD_ENVELOPE_FORMAT = 'tower-throwback/gzip+base64'
/** Server `wire_version` for an enveloped payload; raw saves keep their sandbox version (1/2). */
export const CLOUD_ENVELOPE_WIRE_VERSION = 3

export interface CloudSaveEnvelope {
  format: typeof CLOUD_ENVELOPE_FORMAT
  version: typeof CLOUD_ENVELOPE_WIRE_VERSION
  /** Base64 of the gzip of the save's JSON. */
  data: string
}

const BASE64_CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Envelope an already-serialized save (`JSON.stringify(saved)`). */
export function encodeCloudPayload(serializedSave: string): CloudSaveEnvelope {
  // mtime 0 keeps identical saves byte-identical on the wire.
  const compressed = gzipSync(strToU8(serializedSave), { level: 6, mtime: 0 })
  return { format: CLOUD_ENVELOPE_FORMAT, version: CLOUD_ENVELOPE_WIRE_VERSION, data: bytesToBase64(compressed) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The raw save object inside a cloud payload, ready for `migrateSandboxPayload`,
 * or `null` when the payload is an envelope this client cannot read (unknown
 * format or version, or corrupt data). A payload without an envelope `format`
 * is a legacy raw save and is returned unchanged.
 */
export function decodeCloudPayload(payload: unknown): unknown {
  if (!isRecord(payload) || !('format' in payload)) {
    return payload
  }
  if (
    payload.format !== CLOUD_ENVELOPE_FORMAT ||
    payload.version !== CLOUD_ENVELOPE_WIRE_VERSION ||
    typeof payload.data !== 'string'
  ) {
    return null
  }
  try {
    const json = strFromU8(gunzipSync(base64ToBytes(payload.data)))
    if (json.length > MAX_SANDBOX_JSON_CHARS) {
      return null
    }
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
}
