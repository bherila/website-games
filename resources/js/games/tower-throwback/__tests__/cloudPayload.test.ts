import { CLOUD_ENVELOPE_FORMAT, decodeCloudPayload, encodeCloudPayload } from '../cloudPayload'
import { migrateSandboxPayload } from '../gameProgress'
import { fitsCloudBudget, MAX_CLOUD_PAYLOAD_BYTES } from '../saveBudget'

declare function require(moduleName: string): unknown
declare const process: { cwd(): string }

/** The 1,417-unit bot tower at the morning rush, as the game saved it (about 960 KB of JSON). */
function bigTowerJson(): string {
  const fs = require('node:fs') as { readFileSync(path: string): Uint8Array }
  const zlib = require('node:zlib') as { gunzipSync(data: Uint8Array): Uint8Array }
  const path = `${process.cwd()}/resources/js/games/tower-throwback/__tests__/fixtures/big-bot-tower.v2.json.gz`
  return new TextDecoder().decode(zlib.gunzipSync(fs.readFileSync(path)))
}

describe('cloud payload envelope', () => {
  it('round-trips a large tower exactly and shrinks it far below the cloud cap', () => {
    const json = bigTowerJson()
    const envelope = encodeCloudPayload(json)
    expect(envelope.format).toBe(CLOUD_ENVELOPE_FORMAT)
    expect(envelope.version).toBe(3)
    expect(decodeCloudPayload(envelope)).toEqual(JSON.parse(json))
    expect(JSON.stringify(envelope).length).toBeLessThan(json.length / 15)
  })

  it('lets a tower past the 1 MiB cap sync again', () => {
    // The same tower with twice the commuters in flight: past the cap raw, well inside it enveloped.
    const saved = JSON.parse(bigTowerJson()) as { people: unknown[] }
    const crowded = JSON.stringify({ ...saved, people: [...saved.people, ...saved.people] })
    expect(new TextEncoder().encode(crowded).length).toBeGreaterThan(MAX_CLOUD_PAYLOAD_BYTES)
    expect(fitsCloudBudget(crowded)).toBe(false)
    expect(fitsCloudBudget(JSON.stringify(encodeCloudPayload(crowded)))).toBe(true)
  })

  it('is byte-stable for identical saves', () => {
    const json = JSON.stringify({ version: 2, hello: 'tower' })
    expect(encodeCloudPayload(json)).toEqual(encodeCloudPayload(json))
  })

  it('passes legacy raw saves through to the migration unchanged', () => {
    const json = bigTowerJson()
    const legacy = JSON.parse(json) as unknown
    expect(decodeCloudPayload(legacy)).toBe(legacy)
    expect(migrateSandboxPayload(decodeCloudPayload(legacy))).not.toBeNull()
  })

  it('refuses envelopes it does not understand', () => {
    const envelope = encodeCloudPayload(JSON.stringify({ version: 2 }))
    expect(decodeCloudPayload({ ...envelope, version: 4 })).toBeNull()
    expect(decodeCloudPayload({ ...envelope, format: 'tower-throwback/zstd' })).toBeNull()
    expect(decodeCloudPayload({ ...envelope, data: 42 })).toBeNull()
    expect(decodeCloudPayload({ ...envelope, data: btoa('not gzip') })).toBeNull()
    expect(decodeCloudPayload({ ...envelope, data: '%%%' })).toBeNull()
  })
})
