import { lotLook } from '../Tower2Renderer'

describe('the lot', () => {
  test('fades below ground without writing depth, so editing aids underneath still draw', () => {
    expect(lotLook(-1, false)).toEqual({ opacity: 0.07, depthWrite: false })
    expect(lotLook(-3, false).depthWrite).toBe(false)
  })

  test('is solid and writes depth on and above the street floor, and in the exterior view', () => {
    expect(lotLook(0, false)).toEqual({ opacity: 1, depthWrite: true })
    expect(lotLook(5, false)).toEqual({ opacity: 1, depthWrite: true })
    expect(lotLook(-1, true)).toEqual({ opacity: 1, depthWrite: true })
  })
})
