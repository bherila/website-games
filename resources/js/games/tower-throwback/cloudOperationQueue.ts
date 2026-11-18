import type { SandboxSlotId } from './gameTypes'

interface Operation {
  kind: 'push' | 'barrier'
  run: () => Promise<void>
}

interface Worker {
  active: boolean
  waiting: Operation[]
}

/** Serialize each slot independently; only adjacent waiting mirrors coalesce. */
export class CloudOperationQueue {
  private readonly workers = new Map<SandboxSlotId, Worker>()

  private worker(slot: SandboxSlotId): Worker {
    let worker = this.workers.get(slot)
    if (!worker) {
      worker = { active: false, waiting: [] }
      this.workers.set(slot, worker)
    }
    return worker
  }

  isIdle(slot: SandboxSlotId): boolean {
    const worker = this.workers.get(slot)
    return !worker || (!worker.active && worker.waiting.length === 0)
  }

  push(slot: SandboxSlotId, run: () => Promise<void>): void {
    const worker = this.worker(slot)
    const tail = worker.waiting.at(-1)
    if (tail?.kind === 'push') tail.run = run
    else worker.waiting.push({ kind: 'push', run })
    void this.drain(worker)
  }

  barrier<T>(slot: SandboxSlotId, run: () => Promise<T>): Promise<T> {
    const worker = this.worker(slot)
    const result = new Promise<T>((resolve, reject) => {
      worker.waiting.push({ kind: 'barrier', run: async () => {
        try { resolve(await run()) } catch (error) { reject(error) }
      } })
    })
    void this.drain(worker)
    return result
  }

  private async drain(worker: Worker): Promise<void> {
    if (worker.active) return
    worker.active = true
    try {
      let operation: Operation | undefined
      while ((operation = worker.waiting.shift())) {
        // Push callers own their failure status. Unexpected failures must not
        // strand later work or create an unhandled fire-and-forget rejection.
        try { await operation.run() } catch { /* continue draining */ }
      }
    } finally {
      worker.active = false
    }
  }
}
