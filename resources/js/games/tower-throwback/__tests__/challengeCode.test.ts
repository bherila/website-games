import {
  decodeChallengeCode,
  encodeChallengeCode,
  formatChallengeCode,
  normalizeChallengeCode,
  randomSeed,
} from '../challengeCode'

describe('challenge codes', () => {
  it('round-trips every lobby height and a spread of seeds', () => {
    const seeds = [0, 1, 42, 1_234_567, 0xffff_ffff]
    for (const seed of seeds) {
      for (const lobbyHeight of [1, 2, 3] as const) {
        expect(decodeChallengeCode(encodeChallengeCode({ seed, lobbyHeight, mapId: 'city-tower' }))).toEqual({ seed, lobbyHeight, mapId: 'city-tower' })
      }
    }
  })

  it('produces a fixed-width canonical code', () => {
    expect(encodeChallengeCode({ seed: 0, lobbyHeight: 1, mapId: 'city-tower' })).toHaveLength(10)
    expect(encodeChallengeCode({ seed: 0xffff_ffff, lobbyHeight: 3, mapId: 'city-tower' })).toHaveLength(10)
    // Short seeds are padded, so codes never vary in length.
    expect(encodeChallengeCode({ seed: 1, lobbyHeight: 1, mapId: 'city-tower' })).toMatch(/^000000[0-9A-Z]{4}$/)
  })

  it('still decodes pre-map codes to the original city map', () => {
    // Codes shared before maps existed are 9 chars with no map field. They must
    // keep working forever — invalidating them would break every link already
    // posted somewhere.
    expect(decodeChallengeCode('0002N9C1B')).toEqual({ seed: 123_456, lobbyHeight: 1, mapId: 'city-tower' })
  })

  it('accepts any presentation a player might paste', () => {
    const code = encodeChallengeCode({ seed: 987_654, lobbyHeight: 2, mapId: 'city-tower' })
    const expected = { seed: 987_654, lobbyHeight: 2, mapId: 'city-tower' }

    expect(decodeChallengeCode(formatChallengeCode(code))).toEqual(expected)
    expect(decodeChallengeCode(code.toLowerCase())).toEqual(expected)
    expect(decodeChallengeCode(`  ${formatChallengeCode(code)}  `)).toEqual(expected)
    expect(decodeChallengeCode(code.split('').join(' '))).toEqual(expected)
  })

  it('rejects a mistyped code instead of silently starting a different tower', () => {
    // This is the whole point of the checksum: a single wrong character must
    // fail loudly, not quietly seed some other run.
    const code = encodeChallengeCode({ seed: 4242, lobbyHeight: 1, mapId: 'city-tower' })
    const mistyped = `${code[0] === 'A' ? 'B' : 'A'}${code.slice(1)}`

    expect(decodeChallengeCode(mistyped)).toBeNull()
  })

  it('detects a single-character typo in every position', () => {
    const input = { seed: 123_456_789, lobbyHeight: 3, mapId: 'city-tower' } as const
    const code = encodeChallengeCode(input)

    for (let i = 0; i < code.length; i++) {
      const replacement = code[i] === 'Z' ? 'Y' : 'Z'
      const typo = `${code.slice(0, i)}${replacement}${code.slice(i + 1)}`
      if (typo === code) {
        continue
      }
      expect(decodeChallengeCode(typo)).toBeNull()
    }
  })

  it('rejects malformed, empty, and wrong-length input', () => {
    expect(decodeChallengeCode('')).toBeNull()
    expect(decodeChallengeCode('ABC')).toBeNull()
    expect(decodeChallengeCode('TOOLONGCODE12345')).toBeNull()
    expect(decodeChallengeCode('!!!!!!!!!')).toBeNull()
  })

  it('rejects an impossible lobby height', () => {
    // Hand-build a well-formed code whose lobby digit is out of range.
    const body = '00000004'
    const sum = [...body].reduce((acc, char) => acc + Number.parseInt(char, 36), 0)
    const forged = `${body}${(sum % 36).toString(36)}`.toUpperCase()

    expect(decodeChallengeCode(forged)).toBeNull()
  })

  it('normalizes to bare alphanumerics', () => {
    expect(normalizeChallengeCode('1z1-41z3 2a')).toBe('1Z141Z32A')
  })

  it('derives a uint32 seed from the clock', () => {
    expect(randomSeed(1_700_000_000_000)).toBe(1_700_000_000_000 >>> 0)
    expect(randomSeed(0)).toBe(0)
  })
})
