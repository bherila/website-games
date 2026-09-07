/**
 * Construction feedback behaviour: marks describe the arrangement that was
 * checked, hints escalate only on a genuinely new attempt, and the reveal is
 * available as soon as the learner is stuck rather than priced at three
 * failures.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { loadCourse } from '../domain/course'
import { createPreviewRuntime } from '../runtime/previewRuntime'
import { ConstructionExercise } from '../ui/ConstructionExercise'
import { RuntimeProvider } from '../ui/RuntimeContext'

const course = loadCourse()
// 他在这里吗？— four tiles, so a wrong order can be a swap or a stranded 吗.
const exercise = course.constructionById.get('g02')!

function click(element: HTMLElement): void {
  fireEvent.click(element)
}

function setup() {
  const runtime = createPreviewRuntime({ store: createMemoryPreviewStore(), speechSynthesis: null, sfx: NULL_SFX_PLAYER, appendDelayMs: 0, channelDeps: { simulatedDurationMs: () => 1 } })
  const resolved: { solved: boolean; assisted: boolean; attempts: number }[] = []
  render(
    <RuntimeProvider runtime={runtime}>
      <ConstructionExercise
        course={course}
        exercise={exercise}
        showPinyin
        onResolved={({ solved, assisted, attempts }) => resolved.push({ solved, assisted, attempts })}
        onContinue={() => undefined}
      />
    </RuntimeProvider>,
  )
  return { runtime, resolved }
}

function placeTiles(order: readonly string[]): void {
  for (const id of order) {
    click(screen.getByTestId('construction-tiles').querySelector(`[data-tile-id="${id}"]`) as HTMLElement)
  }
}

function marks(): (string | null)[] {
  return within(screen.getByTestId('construction-answer'))
    .queryAllByRole('button')
    .map((button) => button.getAttribute('data-tile-mark'))
}

describe('ConstructionExercise diagnosis', () => {
  const correct = exercise.correctTileIds
  const swapped = [correct[1]!, correct[0]!, correct[2]!, correct[3]!]

  it('marks each position only after a check, and drops the marks when the tray changes', () => {
    const { runtime } = setup()
    placeTiles(swapped)
    expect(marks()).toEqual([null, null, null, null])

    click(screen.getByTestId('construction-check'))
    expect(marks()).toEqual(['wrong', 'wrong', 'correct', 'correct'])

    // Editing invalidates the diagnosis rather than leaving it describing a
    // layout that no longer exists.
    click(within(screen.getByTestId('construction-answer')).getAllByRole('button')[0]!)
    expect(marks()).toEqual([null, null, null])
    runtime.dispose()
  })

  it('does not buy a more specific hint by re-checking an unchanged tray', () => {
    const { runtime, resolved } = setup()
    placeTiles(swapped)
    click(screen.getByTestId('construction-check'))
    const first = screen.getByTestId('construction-hint').textContent
    expect(screen.getByTestId('construction').getAttribute('data-help-level')).toBe('1')

    click(screen.getByTestId('construction-check'))
    expect(screen.getByTestId('construction').getAttribute('data-help-level')).toBe('1')
    expect(screen.getByTestId('construction-hint').textContent).toBe(first)
    // Nor does it count as another attempt.
    expect(resolved).toHaveLength(1)
    runtime.dispose()
  })

  it('escalates to the specific move on a genuinely new attempt', () => {
    const { runtime } = setup()
    placeTiles(swapped)
    click(screen.getByTestId('construction-check'))
    expect(screen.getByTestId('construction-hint')).toHaveTextContent(/starts with|first/i)

    // A genuinely different wrong order: 吗 moved off the end.
    click(screen.getByText('Reset'))
    placeTiles([correct[3]!, correct[0]!, correct[1]!, correct[2]!])
    click(screen.getByTestId('construction-check'))
    expect(screen.getByTestId('construction').getAttribute('data-help-level')).toBe('2')
    const hint = screen.getByTestId('construction-hint')
    // Names the piece with its pinyin and gloss, not just the character.
    expect(hint).toHaveTextContent('吗')
    expect(hint).toHaveTextContent('ma')
    runtime.dispose()
  })

  it('describes the target sentence rather than claiming other orders are ungrammatical', () => {
    const { runtime } = setup()
    placeTiles(swapped)
    click(screen.getByTestId('construction-check'))
    const text = screen.getByTestId('construction-feedback').textContent ?? ''
    expect(text).toMatch(/sentence you heard/i)
    expect(text).not.toMatch(/always|never|ungrammatical|Chinese puts/i)
    runtime.dispose()
  })

  it('offers the reveal on the first wrong check and records the attempt as assisted', () => {
    const { runtime, resolved } = setup()
    placeTiles(swapped)
    click(screen.getByTestId('construction-check'))
    click(screen.getByTestId('construction-reveal'))

    // The reveal fills the tray in; the learner still confirms it.
    click(screen.getByTestId('construction-check'))
    expect(screen.getByTestId('construction-assistance')).toHaveTextContent('With help')
    expect(resolved.at(-1)).toMatchObject({ solved: true, assisted: true })
    runtime.dispose()
  })

  it('reports an unaided solve as unaided', () => {
    const { runtime, resolved } = setup()
    placeTiles(correct)
    click(screen.getByTestId('construction-check'))
    expect(resolved).toEqual([{ solved: true, assisted: false, attempts: 1 }])
    expect(screen.queryByTestId('construction-assistance')).toBeNull()
    runtime.dispose()
  })
})
