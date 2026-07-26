/**
 * Pure per-entity movement tween queue. No three.js, no DOM — this is the
 * piece of the scene layer that owns "where is entity X right now" during
 * playback, so it is fully unit-testable headlessly.
 *
 * Each accepted move can enqueue more than one step per entity (a slide
 * chain): steps for the same entity play back sequentially so a multi-tile
 * slide visibly chains, while different entities animate concurrently.
 */
import type { Position } from '../engine/types'

export interface TweenStep {
  readonly from: Position
  readonly to: Position
  readonly durationMs: number
}

interface EntityTweenState {
  position: Position
  queue: TweenStep[]
  elapsedMs: number
}

/** Queued-step backlog (on the busiest entity) beyond which playback accelerates. */
export const BACKLOG_ACCELERATE_THRESHOLD = 2
export const MAX_SPEED_MULTIPLIER = 4
/** Extra speed multiplier applied per queued step beyond the threshold. */
export const BACKLOG_SPEED_STEP = 0.5

/**
 * Playback speed multiplier for a given queued-step backlog depth: 1x while
 * caught up, ramping up to MAX_SPEED_MULTIPLIER as the backlog grows so
 * fast play never permanently falls behind the authoritative state.
 */
export function speedMultiplierForBacklog(backlogSteps: number): number {
  if (backlogSteps <= BACKLOG_ACCELERATE_THRESHOLD) {
    return 1
  }

  const over = backlogSteps - BACKLOG_ACCELERATE_THRESHOLD

  return Math.min(MAX_SPEED_MULTIPLIER, 1 + over * BACKLOG_SPEED_STEP)
}

export function lerpPosition(a: Position, b: Position, t: number): Position {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Classifies the tween speed for the Nth movement event of a given entity
 * within one accepted move's event batch. `playerMoved` carries an explicit
 * `forced` flag; `monsterMoved` / `blockPushed` do not, so the convention is:
 * the first movement for an entity in a batch is a normal step, and any
 * further chained movement for the same entity in the same batch is a
 * forced slide. This mirrors playerMoved's own semantics without requiring
 * an engine/types.ts change.
 */
export function stepDurationMs(
  occurrenceIndex: number,
  stepMs: number,
  slideMs: number,
  explicitlyForced?: boolean,
): number {
  if (explicitlyForced === true) {
    return slideMs
  }

  if (explicitlyForced === false) {
    return stepMs
  }

  return occurrenceIndex === 0 ? stepMs : slideMs
}

export class TweenScheduler<Id = string> {
  private readonly entities = new Map<Id, EntityTweenState>()

  hasEntity(id: Id): boolean {
    return this.entities.has(id)
  }

  positionOf(id: Id): Position | undefined {
    return this.entities.get(id)?.position
  }

  ids(): readonly Id[] {
    return [...this.entities.keys()]
  }

  /** Registers a new entity (or fully resets an existing one) at a fixed position with no pending tween. */
  setEntity(id: Id, position: Position): void {
    this.entities.set(id, { position, queue: [], elapsedMs: 0 })
  }

  removeEntity(id: Id): void {
    this.entities.delete(id)
  }

  /** Instantly repositions an existing entity (teleport/clone spawn); registers it if it doesn't exist yet. */
  snapEntity(id: Id, position: Position): void {
    const entity = this.entities.get(id)
    if (entity) {
      entity.position = position
      entity.queue = []
      entity.elapsedMs = 0
    } else {
      this.setEntity(id, position)
    }
  }

  /** Appends a tween step to an entity's queue. No-ops if the entity isn't registered. */
  enqueue(id: Id, step: TweenStep): void {
    this.entities.get(id)?.queue.push(step)
  }

  /** Clears every entity's pending queue without moving them — used on level reset/restart. */
  clearAllQueues(): void {
    for (const entity of this.entities.values()) {
      entity.queue = []
      entity.elapsedMs = 0
    }
  }

  /** Longest pending queue across all entities — the playback backlog depth. */
  get backlogSteps(): number {
    let max = 0
    for (const entity of this.entities.values()) {
      max = Math.max(max, entity.queue.length)
    }

    return max
  }

  /** Advances every entity's queue by `dtMs`, scaled by the current backlog's speed multiplier. */
  advance(dtMs: number): void {
    const multiplier = speedMultiplierForBacklog(this.backlogSteps)
    const scaledDt = Math.max(0, dtMs) * multiplier

    for (const entity of this.entities.values()) {
      let remaining = scaledDt
      // Cap iterations at the queue length: each pass either fully consumes
      // a step or stops mid-step, so this always terminates.
      let guard = entity.queue.length + 1
      while (remaining > 0 && entity.queue.length > 0 && guard > 0) {
        guard -= 1
        const step = entity.queue[0]
        if (!step) {
          break
        }

        const stepDuration = Math.max(1, step.durationMs)
        entity.elapsedMs += remaining
        if (entity.elapsedMs >= stepDuration) {
          remaining = entity.elapsedMs - stepDuration
          entity.position = step.to
          entity.queue.shift()
          entity.elapsedMs = 0
        } else {
          entity.position = lerpPosition(step.from, step.to, entity.elapsedMs / stepDuration)
          remaining = 0
        }
      }
    }
  }
}
