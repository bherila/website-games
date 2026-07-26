import { createInputQueue, keyboardIntent, swipeIntent } from '../input/inputQueue'

describe('createInputQueue', () => {
  it('dequeues in FIFO order', () => {
    const queue = createInputQueue(2)
    queue.enqueue('up')
    queue.enqueue('down')

    expect(queue.dequeue()).toBe('up')
    expect(queue.dequeue()).toBe('down')
  })

  it('caps enqueues at the configured max size, silently dropping the rest', () => {
    const queue = createInputQueue(2)
    queue.enqueue('up')
    queue.enqueue('down')
    queue.enqueue('left')

    expect(queue.size).toBe(2)
    expect(queue.dequeue()).toBe('up')
    expect(queue.dequeue()).toBe('down')
    expect(queue.dequeue()).toBeNull()
  })

  it('returns null when dequeuing an empty queue', () => {
    const queue = createInputQueue(2)

    expect(queue.dequeue()).toBeNull()
  })

  it('clear empties the queue', () => {
    const queue = createInputQueue(2)
    queue.enqueue('up')
    queue.clear()

    expect(queue.size).toBe(0)
    expect(queue.dequeue()).toBeNull()
  })

  it('allows enqueuing again after dequeuing frees capacity', () => {
    const queue = createInputQueue(1)
    queue.enqueue('up')
    queue.enqueue('down') // dropped, at cap
    queue.dequeue()
    queue.enqueue('right')

    expect(queue.dequeue()).toBe('right')
  })
})

describe('keyboardIntent', () => {
  it.each([
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['w', 'up'],
    ['W', 'up'],
    ['s', 'down'],
    ['S', 'down'],
    ['a', 'left'],
    ['A', 'left'],
    ['d', 'right'],
    ['D', 'right'],
    [' ', 'wait'],
    ['Spacebar', 'wait'],
  ])('maps key %s to intent %s', (key, expected) => {
    expect(keyboardIntent(key)).toBe(expected)
  })

  it('returns null for unmapped keys', () => {
    expect(keyboardIntent('Enter')).toBeNull()
    expect(keyboardIntent('q')).toBeNull()
  })
})

describe('swipeIntent', () => {
  it('returns null below the threshold', () => {
    expect(swipeIntent(10, 5, 24)).toBeNull()
    expect(swipeIntent(-10, -10, 24)).toBeNull()
  })

  it('returns null exactly at the boundary below threshold', () => {
    expect(swipeIntent(23, 0, 24)).toBeNull()
  })

  it('accepts a gesture exactly at the threshold', () => {
    expect(swipeIntent(24, 0, 24)).toBe('right')
  })

  it('picks the dominant horizontal axis', () => {
    expect(swipeIntent(30, 10, 24)).toBe('right')
    expect(swipeIntent(-30, 10, 24)).toBe('left')
  })

  it('picks the dominant vertical axis', () => {
    expect(swipeIntent(10, 30, 24)).toBe('down')
    expect(swipeIntent(10, -30, 24)).toBe('up')
  })
})
