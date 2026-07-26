import { fitsCloudBudget, MAX_CLOUD_PAYLOAD_BYTES, MAX_SANDBOX_JSON_CHARS, utf8ByteLength } from '../saveBudget'

describe('utf8ByteLength', () => {
  it('counts bytes, not UTF-16 code units', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('é')).toBe(2)
    expect(utf8ByteLength('→')).toBe(3)
    // Astral plane: two code units, four bytes. `String.length` would say 2.
    expect(utf8ByteLength('𝄞')).toBe(4)
    expect('𝄞'.length).toBe(2)
  })

  it('agrees with the manual fallback when TextEncoder is missing', () => {
    const samples = ['', 'plain ascii', 'café', '→←↑↓', '𝄞𝄢', 'mixed é→𝄞 text']
    const withEncoder = samples.map(utf8ByteLength)

    const original = globalThis.TextEncoder
    // @ts-expect-error deliberately removing the global to exercise the fallback
    delete globalThis.TextEncoder
    try {
      expect(samples.map(utf8ByteLength)).toEqual(withEncoder)
    } finally {
      globalThis.TextEncoder = original
    }
  })
})

describe('cloud budget', () => {
  it('accepts a payload exactly at the cap and rejects one byte more', () => {
    const atCap = 'a'.repeat(MAX_CLOUD_PAYLOAD_BYTES)
    expect(fitsCloudBudget(atCap)).toBe(true)
    expect(fitsCloudBudget(`${atCap}a`)).toBe(false)
  })

  it('measures multi-byte characters against the cap correctly', () => {
    // Half the cap in 2-byte characters is exactly at the cap; one more is over.
    // Measured by CHARACTERS this would look like it had half the budget spare —
    // which is precisely how an oversized save used to reach the server.
    const atCap = 'é'.repeat(MAX_CLOUD_PAYLOAD_BYTES / 2)
    expect(atCap.length).toBe(MAX_CLOUD_PAYLOAD_BYTES / 2)
    expect(fitsCloudBudget(atCap)).toBe(true)
    expect(fitsCloudBudget(`${atCap}é`)).toBe(false)
  })

  it('keeps the local ceiling above the cloud one', () => {
    // Tightening the local cap to match would start rejecting local saves that
    // players can make today — a worse failure than skipping the mirror.
    expect(MAX_SANDBOX_JSON_CHARS).toBeGreaterThan(MAX_CLOUD_PAYLOAD_BYTES)
  })

  it('pins the cloud cap to the value the server enforces', () => {
    // The two budgets drifted silently once already (client 5,000,000 chars vs
    // server 1,048,576 bytes, with a server comment claiming they matched).
    // `TowerSaveSlotTest::test_client_and_server_cloud_budgets_agree` reads this
    // file and asserts the other direction, so neither side can move alone.
    expect(MAX_CLOUD_PAYLOAD_BYTES).toBe(1_048_576)
  })
})
