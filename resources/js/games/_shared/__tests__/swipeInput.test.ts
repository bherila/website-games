import { directionFromKey, swipeDirection } from '../swipeInput'

describe('directionFromKey', () => {
  it('maps arrows and WASD in both cases', () => {
    expect(directionFromKey('ArrowUp')).toBe('up')
    expect(directionFromKey('ArrowDown')).toBe('down')
    expect(directionFromKey('ArrowLeft')).toBe('left')
    expect(directionFromKey('ArrowRight')).toBe('right')
    expect(directionFromKey('w')).toBe('up')
    expect(directionFromKey('S')).toBe('down')
    expect(directionFromKey('a')).toBe('left')
    expect(directionFromKey('D')).toBe('right')
  })

  it('ignores keys that are not movement', () => {
    expect(directionFromKey(' ')).toBeNull()
    expect(directionFromKey('Enter')).toBeNull()
    expect(directionFromKey('q')).toBeNull()
  })
})

describe('swipeDirection', () => {
  it('requires the threshold to be met on the dominant axis', () => {
    expect(swipeDirection(10, 4, 24)).toBeNull()
    expect(swipeDirection(0, 0, 24)).toBeNull()
    expect(swipeDirection(30, 4, 24)).toBe('right')
    expect(swipeDirection(-30, 4, 24)).toBe('left')
    expect(swipeDirection(4, 30, 24)).toBe('down')
    expect(swipeDirection(4, -30, 24)).toBe('up')
  })

  it('resolves a perfectly diagonal gesture to the vertical axis', () => {
    expect(swipeDirection(30, 30, 24)).toBe('down')
    expect(swipeDirection(30, -30, 24)).toBe('up')
  })

  it('fires exactly at the threshold', () => {
    expect(swipeDirection(24, 0, 24)).toBe('right')
    expect(swipeDirection(23.9, 0, 24)).toBeNull()
  })
})
