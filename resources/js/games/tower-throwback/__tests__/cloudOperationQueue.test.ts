import { CloudOperationQueue } from '../cloudOperationQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('CloudOperationQueue', () => {
  it('coalesces waiting pushes without crossing barriers or replacing active work', async () => {
    const queue = new CloudOperationQueue()
    const blocked = deferred()
    const calls: string[] = []
    queue.push('slot-a', async () => { calls.push('A'); await blocked.promise })
    queue.push('slot-a', async () => { calls.push('B') })
    queue.push('slot-a', async () => { calls.push('C') })
    const restore = queue.barrier('slot-a', async () => { calls.push('restore'); return 42 })
    queue.push('slot-a', async () => { calls.push('D') })
    queue.push('slot-a', async () => { calls.push('E') })
    const finished = queue.barrier('slot-a', async () => { calls.push('done') })
    expect(calls).toEqual(['A'])
    blocked.resolve()
    expect(await restore).toBe(42)
    await finished
    expect(calls).toEqual(['A', 'C', 'restore', 'E', 'done'])
  })

  it('keeps slots independent and drains after push and barrier failures', async () => {
    const queue = new CloudOperationQueue()
    const blocked = deferred()
    queue.push('slot-a', async () => { await blocked.promise; throw new Error('Failed push') })
    expect(await queue.barrier('slot-b', async () => 'B')).toBe('B')
    const failed = queue.barrier('slot-a', async () => { throw new Error('Failed barrier') })
    const rejection = expect(failed).rejects.toThrow('Failed barrier')
    const later = queue.barrier('slot-a', async () => 'A recovered')
    blocked.resolve()
    await rejection
    expect(await later).toBe('A recovered')
  })
})
