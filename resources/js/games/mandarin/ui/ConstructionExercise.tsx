/**
 * Tap-to-place sentence construction with undo, reset and a diagnosis of the
 * actual mistake. Not scored as listening.
 *
 * A wrong attempt used to return one static string, so a learner who put 吗
 * first and one who swapped two middle pieces read exactly the same sentence
 * and were told nothing about which piece was wrong. The tray is now marked
 * per position after a check, and hints escalate from orientation to the
 * specific move — all derived from the target sentence, with the authored
 * explanation left to carry the general rule.
 */
import { Check, X } from 'lucide-react'
import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import { type ConstructionDiagnosis, constructionHint, diagnoseConstruction } from '../domain/construction'
import { describeTile, tileMeta } from '../domain/constructionTiles'
import type { CourseIndex } from '../domain/course'
import type { ConstructionExercise as ConstructionExerciseData } from '../domain/courseSchema'
import { Chip, GameButton, MUTED, SpokenText } from './primitives'
import { PromptPlayer } from './PromptPlayer'
import { useRuntime } from './RuntimeContext'

interface ConstructionProps {
  course: CourseIndex
  exercise: ConstructionExerciseData
  showPinyin: boolean
  onResolved: (result: { solved: boolean; orderedTileIds: string[]; attempts: number; assisted: boolean }) => void
  onContinue: () => void
}

/** What the learner has been shown about this attempt, beyond the tray marks. */
type HelpLevel = 0 | 1 | 2

export function ConstructionExercise({ course, exercise, showPinyin, onResolved, onContinue }: ConstructionProps): ReactElement {
  const { audio } = useRuntime()
  const [placed, setPlaced] = useState<string[]>([])
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null)
  // Marks describe the arrangement that was checked, so they are dropped the
  // moment the tray changes rather than left to describe a stale layout.
  const [diagnosis, setDiagnosis] = useState<ConstructionDiagnosis | null>(null)
  const [checkedOrder, setCheckedOrder] = useState<string | null>(null)
  const [helpLevel, setHelpLevel] = useState<HelpLevel>(0)
  const [revealed, setRevealed] = useState(false)
  const utterance = course.utteranceById.get(exercise.sourceUtteranceId)
  const remaining = exercise.tiles.filter((tile) => !placed.includes(tile.id))
  const complete = placed.length === exercise.tiles.length
  const zhOf = (tileId: string): string => exercise.tiles.find((tile) => tile.id === tileId)?.zh ?? ''
  const describe = (tileId: string): string => describeTile(tileId, zhOf(tileId))
  const assisted = revealed || helpLevel > 0
  const silentTiles = exercise.tiles.filter((tile) => tileMeta(tile.id)?.audio == null)

  function edit(next: string[]): void {
    setPlaced(next)
    setDiagnosis(null)
  }

  function playTile(tileId: string): void {
    const source = tileMeta(tileId)?.audio
    audio.unlock()
    // A later tap supersedes an earlier one rather than queueing behind it.
    audio.stop()
    if (source) void audio.play(source)
    else audio.playSfx('ui-tap')
  }

  function check(): void {
    const next = diagnoseConstruction(placed, exercise.correctTileIds)
    const key = placed.join('>')
    // Re-checking an unchanged tray re-states the same hint; it does not buy a
    // more specific one.
    const advanced = key !== checkedOrder
    const nextHelp: HelpLevel = next.solved || !advanced ? helpLevel : (Math.min(2, helpLevel + 1) as HelpLevel)
    const nextAttempts = advanced ? attempts + 1 : attempts
    setDiagnosis(next)
    setCheckedOrder(key)
    setHelpLevel(nextHelp)
    setAttempts(nextAttempts)
    setResult(next.solved ? 'correct' : 'incorrect')
    audio.playSfx(next.solved ? 'answer-correct' : 'answer-help')
    if (advanced || next.solved) {
      onResolved({ solved: next.solved, orderedTileIds: placed, attempts: nextAttempts, assisted: revealed || nextHelp > 0 })
    }
  }

  function reveal(): void {
    setRevealed(true)
    edit([...exercise.correctTileIds])
  }

  const hint = diagnosis && !diagnosis.solved && helpLevel > 0
    ? constructionHint(diagnosis, helpLevel === 2 ? 2 : 1, describe)
    : null
  const marks = diagnosis && !diagnosis.solved ? diagnosis.marks : []

  return (
    <div className="flex flex-col gap-4" data-testid="construction" data-construction-id={exercise.id} data-help-level={helpLevel}>
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
        {placed.map((tileId, index) => {
          const mark = marks[index]
          const marked = mark !== undefined
          return (
            <GameButton
              key={tileId}
              variant="secondary"
              lang="zh-Hans"
              className={cn(
                'text-xl',
                marked && mark.correct && 'border-[#5d8a70] bg-[#e4efe8]',
                marked && !mark.correct && 'border-[#c98a8a] bg-[#fbeaea]',
              )}
              onClick={() => edit(placed.filter((id) => id !== tileId))}
              disabled={result === 'correct'}
              aria-label={`Remove ${zhOf(tileId)}${marked ? mark.correct ? ', in the right place' : ', in the wrong place' : ''}`}
              data-tile-id={tileId}
              data-tile-mark={marked ? (mark.correct ? 'correct' : 'wrong') : undefined}
            >
              {/* Never colour alone: the icon carries the same information. */}
              {marked && (mark.correct
                ? <Check aria-hidden="true" className="size-4 text-[#2f5d45]" />
                : <X aria-hidden="true" className="size-4 text-[#8a3232]" />)}
              {zhOf(tileId)}
            </GameButton>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2" data-testid="construction-tiles">
        {remaining.map((tile) => {
          const meta = tileMeta(tile.id)
          return (
            <GameButton
              key={tile.id}
              variant="choice"
              lang="zh-Hans"
              className="text-xl"
              onClick={() => { edit([...placed, tile.id]); playTile(tile.id) }}
              disabled={result === 'correct'}
              data-tile-id={tile.id}
              data-tile-audio={meta?.audio ? 'available' : 'none'}
              aria-label={meta ? `${tile.zh}, ${meta.pinyin}` : tile.zh}
            >
              {tile.zh}
            </GameButton>
          )
        })}
      </div>
      {silentTiles.length > 0 && (
        <p className={cn('text-xs', MUTED)} data-testid="construction-audio-gap">
          {silentTiles.map((tile) => tile.zh).join('、')} {silentTiles.length === 1 ? 'has' : 'have'} no recording yet, so tapping {silentTiles.length === 1 ? 'it' : 'them'} plays nothing.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <GameButton variant="quiet" onClick={() => edit(placed.slice(0, -1))} disabled={placed.length === 0 || result === 'correct'}>Undo</GameButton>
        <GameButton variant="quiet" onClick={() => { edit([]); setResult(null) }} disabled={placed.length === 0 || result === 'correct'}>Reset</GameButton>
        {result !== 'correct' && (
          <GameButton variant="primary" size="lg" onClick={check} disabled={!complete} data-testid="construction-check">Check</GameButton>
        )}
        {/* Available as soon as the learner is stuck, rather than priced at three failures. */}
        {result === 'incorrect' && !revealed && (
          <GameButton variant="secondary" onClick={reveal} data-testid="construction-reveal">Show me the order</GameButton>
        )}
      </div>

      {result && (
        <div role="status" data-testid="construction-feedback" className={cn('rounded-xl border p-3', result === 'correct' ? 'border-[#bfd8c9] bg-[#e4efe8]' : 'border-[#ead7a4] bg-[#fbf3df]')}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{result === 'correct' ? 'That’s the sentence.' : 'Not quite.'}</p>
            {/* Labels the outcome, so it belongs on the solve. Next to "Not
                quite" it would read as if help had been used to get it wrong. */}
            {result === 'correct' && assisted && <Chip tone="amber" data-testid="construction-assistance">With help</Chip>}
          </div>
          {hint && (
            <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="construction-hint">
              <p className="text-sm">{hint.text}</p>
              {hint.tileId && tileMeta(hint.tileId)?.audio && (
                <PromptPlayer source={tileMeta(hint.tileId)!.audio!} size="md" playLabel="Hear it" />
              )}
            </div>
          )}
          <p className="mt-1 text-sm">{exercise.explanation}</p>
          {revealed && <p className={cn('mt-1 text-xs', MUTED)} data-testid="construction-revealed">The order is filled in above. Check it to continue.</p>}
          {result === 'correct' && utterance && (
            <div className="mt-3 space-y-3">
              <SpokenText zh={exercise.displayAnswer} pinyin={utterance.pinyin} en={utterance.en} showPinyin={showPinyin} size="md" />
              {/* The whole line, not the pieces: tapping tiles is help with building it. */}
              <PromptPlayer source={{ sourceKind: 'utterance', sourceId: utterance.id, variant: 'normal' }} size="md" playLabel="Hear it" />
              <GameButton variant="primary" size="lg" onClick={onContinue} data-testid="continue">Continue</GameButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
