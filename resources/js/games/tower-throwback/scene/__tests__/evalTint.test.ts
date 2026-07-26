import { evalTint } from '../evalTint'

describe('evalTint', () => {
  it('does not tint units without an income model', () => {
    expect(evalTint({ kind: 'slab', occupied: false, evalScore: 0 })).toBeNull()
    expect(evalTint({ kind: 'stairs', occupied: true, evalScore: 75 })).toBeNull()
    expect(evalTint({ kind: 'restroom', occupied: true, evalScore: 75 })).toBeNull()
    expect(evalTint({ kind: 'securityOffice', occupied: true, evalScore: 75 })).toBeNull()
  })

  it('tints vacant or non-operating income units red', () => {
    expect(evalTint({ kind: 'officeS', occupied: false, evalScore: 80 })).toBe(0xd83a2a)
    expect(evalTint({ kind: 'shop', occupied: false, evalScore: 80 })).toBe(0xd83a2a)
    expect(evalTint({ kind: 'medicalClinic', occupied: false, evalScore: 80 })).toBe(0xd83a2a)
  })

  it('ramps occupied income units from yellow at 35 to green at 85', () => {
    expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 20 })).toBe(0xe0c030)
    expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 35 })).toBe(0xe0c030)
    expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 60 })).toBe(0x90b741)
    expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 85 })).toBe(0x3fae52)
    expect(evalTint({ kind: 'aptStudio', occupied: true, evalScore: 100 })).toBe(0x3fae52)
  })
})
