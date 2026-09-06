/**
 * Owns one opportunity's assessment state and emits the matching practice
 * events. A new exercise/opportunity remounts the hook via the caller's key.
 */
import { useCallback, useMemo, useState } from 'react'

import { type AssessmentAction, type AssessmentMode, type AssessmentState, createAssessment, reduceAssessment } from '../domain/assessment'
import type { ChoiceExercise } from '../domain/courseSchema'
import { helpRevealedEvent, responseEvent } from '../domain/events'
import { randomId } from '../domain/random'
import { useGame } from './GameContext'

export interface AssessmentHandle {
  state: AssessmentState
  dispatch: (action: AssessmentAction) => void
}

export function useAssessment(exercise: ChoiceExercise, mode: AssessmentMode, location: { sceneId: string | null; nodeId: string | null }): AssessmentHandle {
  const game = useGame()
  const [state, setState] = useState<AssessmentState>(() => createAssessment(exercise, randomId('opp'), mode))
  const source = useMemo(() => {
    const first = exercise.promptAudio[0]
    return first ? { sourceKind: first.sourceKind, sourceId: first.sourceId, variant: first.variant } : null
  }, [exercise])

  const dispatch = useCallback((action: AssessmentAction) => {
    setState((current) => {
      const next = reduceAssessment(current, action, exercise.correctOptionId)
      if (next === current) return current
      if (action.type === 'reveal') {
        game.appendEvents([helpRevealedEvent(game.eventContext, next, location)])
      }
      if (action.type === 'submit' || action.type === 'dontKnow' || action.type === 'skip') {
        game.appendEvents([responseEvent(game.eventContext, next, location, source)])
      }
      return next
    })
    // location is a plain object recreated by callers; its two ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.correctOptionId, game.appendEvents, game.eventContext, location.sceneId, location.nodeId, source])

  return { state, dispatch }
}
