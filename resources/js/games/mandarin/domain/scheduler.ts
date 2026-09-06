/**
 * Deterministic listening-schedule projection over the server's graded
 * review log, using the pinned ts-fsrs. The backend owns the canonical log
 * and grades; this adapter only replays them. Fuzz is disabled so two
 * devices replaying the same log agree on what is due.
 *
 * Product policy applied here (mirrors the server's schedule_eligible flag):
 * only schedule-eligible reviews advance a card, and the effective due time
 * is never earlier than the end of the per-target window, so a short
 * learning step cannot create an immediately overdue loop.
 */
import { type Card, createEmptyCard, fsrs, generatorParameters, type Grade, Rating } from 'ts-fsrs'

import type { ProgressProjection } from '../contracts/mandarin'

export const SCHEDULER_VERSION = 'ts-fsrs-5.4.2'
export const DESIRED_RETENTION = 0.9

export interface GradedReview {
  targetId: string
  grade: 'Again' | 'Hard' | 'Good' | 'Easy'
  scheduleEligible: boolean
  acceptedAt: string
  sequence: number
}

export interface TargetSchedule {
  targetId: string
  card: Card
  /** FSRS due, pushed out to the end of the review window when needed. */
  effectiveDue: Date
  reviews: number
}

const RATINGS: Record<GradedReview['grade'], Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
}

const scheduler = fsrs(generatorParameters({ request_retention: DESIRED_RETENTION, enable_fuzz: false }))

export function buildSchedules(reviews: readonly GradedReview[], windowMinutes: number): Map<string, TargetSchedule> {
  const ordered = [...reviews].sort((a, b) => a.sequence - b.sequence)
  const schedules = new Map<string, TargetSchedule>()
  for (const review of ordered) {
    if (!review.scheduleEligible) continue
    const at = new Date(review.acceptedAt)
    if (Number.isNaN(at.getTime())) continue
    const existing = schedules.get(review.targetId)
    const card: Card = existing?.card ?? createEmptyCard<Card>(at)
    const { card: next } = scheduler.next(card, at, RATINGS[review.grade])
    const windowEnd = new Date(at.getTime() + windowMinutes * 60_000)
    const effectiveDue = next.due.getTime() < windowEnd.getTime() ? windowEnd : next.due
    schedules.set(review.targetId, { targetId: review.targetId, card: next, effectiveDue, reviews: (existing?.reviews ?? 0) + 1 })
  }
  return schedules
}

/** Targets due at `now`, soonest first. */
export function dueTargetIds(reviews: readonly GradedReview[], windowMinutes: number, now: Date): string[] {
  return [...buildSchedules(reviews, windowMinutes).values()]
    .filter((schedule) => schedule.effectiveDue.getTime() <= now.getTime())
    .sort((a, b) => a.effectiveDue.getTime() - b.effectiveDue.getTime() || a.targetId.localeCompare(b.targetId))
    .map((schedule) => schedule.targetId)
}

interface GradedReviewLog {
  kind: 'graded-review-log'
  windowMinutes?: number
  reviews?: unknown[]
}

function isGradedReviewLog(value: unknown): value is GradedReviewLog {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'graded-review-log'
}

function isGradedReview(value: unknown): value is GradedReview {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.targetId === 'string'
    && typeof record.grade === 'string' && record.grade in RATINGS
    && typeof record.acceptedAt === 'string'
    && typeof record.sequence === 'number'
}

/** Reads the server's `listeningCards` log and derives due targets; unknown shapes yield nothing due. */
export function dueTargetIdsFromProjection(projection: Pick<ProgressProjection, 'listeningCards'>, now: Date): string[] {
  const cards = projection.listeningCards
  if (!isGradedReviewLog(cards)) return []
  const reviews = (cards.reviews ?? []).filter(isGradedReview).map((review) => ({ ...review, scheduleEligible: (review as { scheduleEligible?: unknown }).scheduleEligible !== false }))
  return dueTargetIds(reviews, typeof cards.windowMinutes === 'number' ? cards.windowMinutes : 10, now)
}
