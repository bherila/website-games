import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react'

import type { AudioEvidence, PracticeEvent } from '../contracts/mandarin'
import type { PlaybackOutcome } from '../domain/assessment'
import type { RecallExercise } from '../domain/courseSchema'
import { recallEvent } from '../domain/events'
import { randomId } from '../domain/random'
import { useGame } from './GameContext'
import { Eyebrow, GameButton, MUTED } from './primitives'
import { PromptPlayer } from './PromptPlayer'
import { useRuntime } from './RuntimeContext'
import { useSpeaking } from './useAudioSource'

export function RecallQuestion({ exercise, mode, sessionKind, onDone }: {
  exercise: RecallExercise; mode: 'lesson' | 'review'; sessionKind?: 'scheduled' | 'continuation'; onDone: () => void
}): ReactElement {
  const game = useGame()
  const { audio } = useRuntime()
  const speaking = useSpeaking()
  const [opportunityId] = useState(() => randomId('opp'))
  const [revealed, setRevealed] = useState(false)
  const [dontKnow, setDontKnow] = useState(false)
  const [helpUsed, setHelpUsed] = useState(false)
  const [finished, setFinished] = useState(false)
  const finishedRef = useRef(false)
  const active = useRef(true)
  const answerRef = useRef<HTMLDivElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const [evidence, setEvidence] = useState<AudioEvidence>({ status: 'not_required', normalPlayCount: 0, slowPlayCount: 0, interrupted: false })
  const source = useMemo(() => ({ sourceKind: 'utterance' as const, sourceId: exercise.sourceUtteranceId, variant: 'normal' as const }), [exercise.sourceUtteranceId])
  const utterance = game.course.utteranceById.get(exercise.sourceUtteranceId)!
  useEffect(() => { active.current = true; return () => { active.current = false; audio.stop() } }, [audio])
  // The buttons that were focused unmount on reveal and on rating, which would
  // drop keyboard focus to the page body; hand it to the content that replaced them.
  useEffect(() => { if (revealed) answerRef.current?.focus() }, [revealed])
  useEffect(() => { if (finished) continueRef.current?.focus() }, [finished])
  // The glossary can supply words for a spoken answer. Record it as a supported
  // attempt by committing to the answer reveal before opening the glossary.
  useEffect(() => game.registerAssessment({
    opportunityId, strict: false, unanswered: !revealed,
    revealMeaning: () => {
      setDontKnow(true); setHelpUsed(true); setRevealed(true)
      game.appendEvents([{ ...recallEvent(game.eventContext, exercise, opportunityId, mode, 'skip', null, evidence),
        kind: 'help_revealed', responseAction: null, textHelpUsed: true }])
    },
  }), [game.registerAssessment, game.appendEvents, game.eventContext, exercise, mode, opportunityId, revealed, evidence])

  function playback(variant: 'normal' | 'slow', outcome: PlaybackOutcome): void {
    if (!active.current || finishedRef.current) return
    setEvidence((current) => ({
      ...current,
      status: outcome === 'completed' ? 'completed' : outcome === 'simulated' ? 'simulated' : current.status === 'completed' ? 'completed' : 'failed',
      normalPlayCount: current.normalPlayCount + (variant === 'normal' && outcome === 'completed' ? 1 : 0),
      slowPlayCount: current.slowPlayCount + (variant === 'slow' && outcome === 'completed' ? 1 : 0),
      interrupted: current.interrupted || outcome === 'interrupted',
    }))
  }

  function finish(selfRating: NonNullable<PracticeEvent['selfRating']> | null): void {
    if (finishedRef.current || (selfRating !== null && speaking)) return
    finishedRef.current = true
    audio.stop()
    game.appendEvents([{ ...recallEvent({ ...game.eventContext, ...(sessionKind ? { sessionKind } : {}) }, exercise, opportunityId, mode,
      selfRating === null ? 'skip' : dontKnow ? 'dont_know' : 'self_check', dontKnow ? null : selfRating, evidence), textHelpUsed: helpUsed }])
    if (selfRating !== null && evidence.status === 'completed') {
      game.updateProgress((progress) => ({ ...progress, recallExerciseIds: [...new Set([...progress.recallExerciseIds, exercise.id])] }))
    }
    setFinished(true)
  }

  return <div className="flex flex-col gap-3" data-testid="recall-question" data-exercise-id={exercise.id}>
    <Eyebrow>Say it in Mandarin</Eyebrow>
    <p className="text-sm">{exercise.situation}</p>
    <p className="text-xl font-bold">{exercise.cueEn}</p>
    {!revealed && <>
      <p className={`text-sm ${MUTED}`}>Try saying it aloud, then compare with the recording.</p>
      <div className="flex flex-wrap gap-2">
        <GameButton variant="primary" size="lg" onClick={() => setRevealed(true)}>Show answer</GameButton>
        <GameButton variant="secondary" size="lg" onClick={() => { setDontKnow(true); setRevealed(true) }}>I don’t know</GameButton>
      </div>
    </>}
    {revealed && <>
      <div ref={answerRef} tabIndex={-1} role="region" aria-label="Answer" aria-live="polite" data-testid="recall-answer" className="flex flex-col gap-1 outline-none">
        <p lang="zh-CN" className="text-2xl font-bold">{utterance.zh}</p>
        <p lang="zh-Latn-pinyin">{utterance.pinyin}</p>
        <p className="text-sm">{exercise.explanation}</p>
      </div>
      <PromptPlayer source={source} slowSource={{ ...source, variant: 'slow' }} playLabel="Hear the answer" onPlayback={playback} disabled={finished} autoPlay />
      {!finished && <>
        <p className={`text-sm ${MUTED}`}>Listen to the answer, then rate your attempt. This is your own assessment.</p>
        <div className="flex flex-wrap gap-2">
          {!dontKnow && <GameButton variant="primary" size="lg" disabled={speaking || evidence.status === 'not_required'} onClick={() => finish('said_it')}>Said it</GameButton>}
          {!dontKnow && <GameButton variant="secondary" size="lg" disabled={speaking || evidence.status === 'not_required'} onClick={() => finish('partly')}>Partly</GameButton>}
          <GameButton variant="secondary" size="lg" disabled={speaking || evidence.status === 'not_required'} onClick={() => finish('missed')}>{dontKnow ? 'Keep practising' : 'Missed'}</GameButton>
          <GameButton variant="quiet" size="lg" onClick={() => finish(null)}>Continue without rating</GameButton>
        </div>
      </>}
      {finished && <>
        <p role="status" className="text-sm">{evidence.status === 'completed' ? 'Attempt recorded. Listening and speaking practice have separate review dates.' : 'Practice recorded without a score because the recording did not finish.'}</p>
        <GameButton ref={continueRef} variant="primary" size="lg" onClick={onDone}>Continue</GameButton>
      </>}
    </>}
  </div>
}
