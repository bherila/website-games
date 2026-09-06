/** Tap-to-place sentence construction with undo and reset. Not scored as listening. */
import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import type { CourseIndex } from '../domain/course'
import type { ConstructionExercise as ConstructionExerciseData } from '../domain/courseSchema'
import { GameButton, MUTED, SpokenText } from './primitives'
import { PromptPlayer } from './PromptPlayer'
import { useRuntime } from './RuntimeContext'

interface ConstructionProps {
  course: CourseIndex
  exercise: ConstructionExerciseData
  showPinyin: boolean
  onResolved: (result: { solved: boolean; orderedTileIds: string[]; attempts: number }) => void
  onContinue: () => void
}

export function ConstructionExercise({ course, exercise, showPinyin, onResolved, onContinue }: ConstructionProps): ReactElement {
  const { audio } = useRuntime()
  const [placed, setPlaced] = useState<string[]>([])
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null)
  const utterance = course.utteranceById.get(exercise.sourceUtteranceId)
  const remaining = exercise.tiles.filter((tile) => !placed.includes(tile.id))
  const complete = placed.length === exercise.tiles.length

  function check(): void {
    const solved = placed.length === exercise.correctTileIds.length && placed.every((id, index) => exercise.correctTileIds[index] === id)
    const nextAttempts = attempts + 1
    setAttempts(nextAttempts)
    setResult(solved ? 'correct' : 'incorrect')
    audio.playSfx(solved ? 'answer-correct' : 'answer-help')
    onResolved({ solved, orderedTileIds: placed, attempts: nextAttempts })
  }

  return (
    <div className="flex flex-col gap-4" data-testid="construction" data-construction-id={exercise.id}>
      <div>
        <p className="text-base font-semibold sm:text-lg">{exercise.question}</p>
        <p className={cn('text-sm', MUTED)}>Tap the pieces in order. This builds the sentence you just heard; it is practice, not a listening score.</p>
      </div>

      <div
        className="flex min-h-16 flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-[#cfd6d1] bg-[#faf7f0] p-3"
        aria-live="polite"
        aria-label="Your sentence"
        data-testid="construction-answer"
      >
        {placed.length === 0 && <span className={cn('text-sm', MUTED)}>Your sentence appears here.</span>}
        {placed.map((tileId) => {
          const tile = exercise.tiles.find((item) => item.id === tileId)
          return (
            <GameButton key={tileId} variant="secondary" lang="zh-Hans" className="text-xl" onClick={() => setPlaced((current) => current.filter((id) => id !== tileId))} disabled={result === 'correct'} aria-label={`Remove ${tile?.zh ?? ''}`}>
              {tile?.zh}
            </GameButton>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2" data-testid="construction-tiles">
        {remaining.map((tile) => (
          <GameButton key={tile.id} variant="choice" lang="zh-Hans" className="text-xl" onClick={() => { audio.playSfx('ui-tap'); setPlaced((current) => [...current, tile.id]) }} disabled={result === 'correct'} data-tile-id={tile.id}>
            {tile.zh}
          </GameButton>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <GameButton variant="quiet" onClick={() => setPlaced((current) => current.slice(0, -1))} disabled={placed.length === 0 || result === 'correct'}>Undo</GameButton>
        <GameButton variant="quiet" onClick={() => { setPlaced([]); setResult(null) }} disabled={placed.length === 0 || result === 'correct'}>Reset</GameButton>
        {result !== 'correct' && (
          <GameButton variant="primary" size="lg" onClick={check} disabled={!complete} data-testid="construction-check">Check</GameButton>
        )}
      </div>

      {result && (
        <div role="status" data-testid="construction-feedback" className={cn('rounded-xl border p-3', result === 'correct' ? 'border-[#bfd8c9] bg-[#e4efe8]' : 'border-[#ead7a4] bg-[#fbf3df]')}>
          <p className="font-bold">{result === 'correct' ? 'That’s the sentence.' : 'Not quite. Adjust the order and check again.'}</p>
          <p className="mt-1 text-sm">{exercise.explanation}</p>
          {result === 'correct' && utterance && (
            <div className="mt-3 space-y-3">
              <SpokenText zh={exercise.displayAnswer} pinyin={utterance.pinyin} en={utterance.en} showPinyin={showPinyin} size="md" />
              <PromptPlayer source={{ sourceKind: 'utterance', sourceId: utterance.id, variant: 'normal' }} size="md" playLabel="Hear it" />
              <GameButton variant="primary" size="lg" onClick={onContinue} data-testid="continue">Continue</GameButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
