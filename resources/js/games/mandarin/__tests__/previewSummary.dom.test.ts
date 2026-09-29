import { loadCourse } from '../domain/course'
import { completeNode, createInitialProgress, markNodeIntroduced } from '../domain/progress'
import {
  resolveMandarinAccountPartitionId,
  summarizeMandarinLive,
  summarizeMandarinPreview,
} from '../previewSummary'

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  rawEntries(): Record<string, string> {
    return Object.fromEntries(this.map.entries())
  }
}

function setInitialDataScript(data: unknown | null): void {
  const existing = document.getElementById('app-initial-data')
  if (existing) {
    existing.remove()
  }
  if (data !== null) {
    const script = document.createElement('script')
    script.id = 'app-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify(data)
    document.body.appendChild(script)
  }
}

describe('previewSummary', () => {
  const course = loadCourse()

  beforeEach(() => {
    setInitialDataScript(null)
  })

  afterEach(() => {
    setInitialDataScript(null)
  })

  describe('summarizeMandarinPreview', () => {
    it('returns empty progress when storage is empty or null', () => {
      expect(summarizeMandarinPreview(null)).toEqual({
        started: false,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 0,
        totalNodes: 20,
      })

      const storage = new MemoryStorage()
      expect(summarizeMandarinPreview(storage)).toEqual({
        started: false,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 0,
        totalNodes: 20,
      })
    })

    it('reads strictly from preview partition and ignores live partitions', () => {
      const storage = new MemoryStorage()

      // Save live progress in guest and user partitions
      let liveProgress = createInitialProgress(course)
      liveProgress = completeNode(markNodeIntroduced(liveProgress, 's1n1'), course, 's1n1').progress
      storage.setItem('mandarin.live.guest.progress.v1', JSON.stringify(liveProgress))
      storage.setItem('mandarin.live.user_42.progress.v1', JSON.stringify(liveProgress))

      // Preview should still be unstarted
      expect(summarizeMandarinPreview(storage)).toEqual({
        started: false,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 0,
        totalNodes: 20,
      })

      // Now save preview progress
      let previewProgress = createInitialProgress(course)
      previewProgress = completeNode(markNodeIntroduced(previewProgress, 's1n1'), course, 's1n1').progress
      previewProgress = completeNode(markNodeIntroduced(previewProgress, 's1n2'), course, 's1n2').progress
      storage.setItem('mandarin.preview.progress.v1', JSON.stringify(previewProgress))

      expect(summarizeMandarinPreview(storage)).toEqual({
        started: true,
        scenesCompleted: 1,
        totalScenes: 10,
        nodesCompleted: 2,
        totalNodes: 20,
      })
    })
  })

  describe('summarizeMandarinLive', () => {
    it('summarizes guest progress by default when unauthenticated', () => {
      const storage = new MemoryStorage()

      expect(summarizeMandarinLive(storage)).toEqual({
        started: false,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 0,
        totalNodes: 20,
      })

      let guestProgress = createInitialProgress(course)
      guestProgress = completeNode(markNodeIntroduced(guestProgress, 's1n1'), course, 's1n1').progress
      storage.setItem('mandarin.live.guest.progress.v1', JSON.stringify(guestProgress))

      expect(summarizeMandarinLive(storage)).toEqual({
        started: true,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 1,
        totalNodes: 20,
      })
    })

    it('does not read preview storage for live summary', () => {
      const storage = new MemoryStorage()

      let previewProgress = createInitialProgress(course)
      previewProgress = completeNode(markNodeIntroduced(previewProgress, 's1n1'), course, 's1n1').progress
      storage.setItem('mandarin.preview.progress.v1', JSON.stringify(previewProgress))

      expect(summarizeMandarinLive(storage)).toEqual({
        started: false,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 0,
        totalNodes: 20,
      })
    })

    it('resolves authenticated user partition and isolates from guest progress', () => {
      const storage = new MemoryStorage()

      // Guest has completed 1 lesson
      let guestProgress = createInitialProgress(course)
      guestProgress = completeNode(markNodeIntroduced(guestProgress, 's1n1'), course, 's1n1').progress
      storage.setItem('mandarin.live.guest.progress.v1', JSON.stringify(guestProgress))

      // User 42 has completed 2 scenes (4 lessons)
      let user42Progress = createInitialProgress(course)
      for (const nodeId of ['s1n1', 's1n2', 's2n1', 's2n2']) {
        user42Progress = completeNode(markNodeIntroduced(user42Progress, nodeId), course, nodeId).progress
      }
      storage.setItem('mandarin.live.user_42.progress.v1', JSON.stringify(user42Progress))

      // Unauthenticated -> sees guest progress
      expect(summarizeMandarinLive(storage)).toEqual({
        started: true,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 1,
        totalNodes: 20,
      })

      // Authenticate as user 42
      setInitialDataScript({ authenticated: true, currentUser: { id: 42 } })

      expect(summarizeMandarinLive(storage)).toEqual({
        started: true,
        scenesCompleted: 2,
        totalScenes: 10,
        nodesCompleted: 4,
        totalNodes: 20,
      })

      // Explicit partition override works
      expect(summarizeMandarinLive(storage, null)).toEqual({
        started: true,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 1,
        totalNodes: 20,
      })
      expect(summarizeMandarinLive(storage, 'user:42')).toEqual({
        started: true,
        scenesCompleted: 2,
        totalScenes: 10,
        nodesCompleted: 4,
        totalNodes: 20,
      })
    })

    it('switches accounts and handles sign-out without leaking progress', () => {
      const storage = new MemoryStorage()

      // User 1 has completed scene 1
      let user1Progress = createInitialProgress(course)
      for (const nodeId of ['s1n1', 's1n2']) {
        user1Progress = completeNode(markNodeIntroduced(user1Progress, nodeId), course, nodeId).progress
      }
      storage.setItem('mandarin.live.user_1.progress.v1', JSON.stringify(user1Progress))

      // User 2 has completed scenes 1 through 3
      let user2Progress = createInitialProgress(course)
      for (const nodeId of ['s1n1', 's1n2', 's2n1', 's2n2', 's3n1', 's3n2']) {
        user2Progress = completeNode(markNodeIntroduced(user2Progress, nodeId), course, nodeId).progress
      }
      storage.setItem('mandarin.live.user_2.progress.v1', JSON.stringify(user2Progress))

      // User 1 logged in
      setInitialDataScript({ authenticated: true, currentUser: { id: 1 } })
      expect(summarizeMandarinLive(storage).scenesCompleted).toBe(1)
      expect(summarizeMandarinLive(storage).nodesCompleted).toBe(2)

      // Switch to User 2
      setInitialDataScript({ authenticated: true, currentUser: { id: 2 } })
      expect(summarizeMandarinLive(storage).scenesCompleted).toBe(3)
      expect(summarizeMandarinLive(storage).nodesCompleted).toBe(6)

      // Sign out
      setInitialDataScript({ authenticated: false })
      expect(summarizeMandarinLive(storage)).toEqual({
        started: false,
        scenesCompleted: 0,
        totalScenes: 10,
        nodesCompleted: 0,
        totalNodes: 20,
      })
    })

    it('never modifies, touches, or relabels queued events in outboxes', () => {
      const storage = new MemoryStorage()

      const guestOutbox = [
        {
          eventId: 'evt-guest-1',
          attemptId: 'att-1',
          opportunityId: 'opp-1',
          exerciseId: 'ex-1',
          mode: 'lesson',
          action: 'answer',
          correct: true,
          assistance: 'unaided',
          durationMs: 1200,
          at: '2026-09-28T00:00:00.000Z',
        },
      ]
      const userOutbox = [
        {
          eventId: 'evt-user-1',
          attemptId: 'att-2',
          opportunityId: 'opp-2',
          exerciseId: 'ex-2',
          mode: 'lesson',
          action: 'answer',
          correct: true,
          assistance: 'unaided',
          durationMs: 900,
          at: '2026-09-28T00:01:00.000Z',
        },
      ]

      storage.setItem('mandarin.live.guest.outbox.v1', JSON.stringify(guestOutbox))
      storage.setItem('mandarin.live.user_42.outbox.v1', JSON.stringify(userOutbox))

      // Perform multiple summary calls across guest and user identities
      summarizeMandarinLive(storage)
      setInitialDataScript({ authenticated: true, currentUser: { id: 42 } })
      summarizeMandarinLive(storage)
      setInitialDataScript({ authenticated: false })
      summarizeMandarinLive(storage)

      // Ensure outbox keys remain pristine
      expect(JSON.parse(storage.getItem('mandarin.live.guest.outbox.v1')!)).toEqual(guestOutbox)
      expect(JSON.parse(storage.getItem('mandarin.live.user_42.outbox.v1')!)).toEqual(userOutbox)
    })
  })

  describe('resolveMandarinAccountPartitionId', () => {
    it('returns null when unauthenticated or script is missing', () => {
      const storage = new MemoryStorage()
      expect(resolveMandarinAccountPartitionId(storage)).toBeNull()

      setInitialDataScript({ authenticated: false, currentUser: null })
      expect(resolveMandarinAccountPartitionId(storage)).toBeNull()
    })

    it('returns prefixed partition ID when authenticated', () => {
      const storage = new MemoryStorage()
      setInitialDataScript({ authenticated: true, currentUser: { id: 42 } })
      expect(resolveMandarinAccountPartitionId(storage)).toBe('user:42')

      setInitialDataScript({ authenticated: true, currentUser: { id: 'acct-99' } })
      expect(resolveMandarinAccountPartitionId(storage)).toBe('user:acct-99')
    })

    it('resolves from cached user in PWA cached shell', () => {
      const storage = new MemoryStorage()
      storage.setItem('bwh.games.last-authenticated-user.v1', '77')
      setInitialDataScript({ pwaCachedShell: true })

      expect(resolveMandarinAccountPartitionId(storage)).toBe('user:77')
    })
  })
})
