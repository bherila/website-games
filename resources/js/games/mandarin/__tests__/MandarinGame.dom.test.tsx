/**
 * Full five-scene preview journey in jsdom (2D scenery, memory store, simulated
 * audio). Asserts the honesty invariants along the way: preview banner, no
 * cloud-save claim, no mastery language, no reserved checkpoint text before
 * the listening check, and preview-only persistence.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { findPreviewScenario } from '../adapters/previewScenarios'
import { createMemoryPreviewStore } from '../adapters/previewStore'
import { NULL_SFX_PLAYER } from '../audio/sfxRecipes'
import { loadCourse } from '../domain/course'
import { MandarinGame } from '../MandarinGame'
import { createPreviewRuntime } from '../runtime/previewRuntime'
import { PREVIEW_BANNER_TEXT } from '../ui/PreviewBanner'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: () => false }))

const course = loadCourse()
const reservedText = [...course.reservedUtteranceIds].map((id) => course.utteranceById.get(id)!.zh)
const FORBIDDEN = /mastered|certified|reviewed by|cloud save enabled|saved to your account/i

function assertHonest(): void {
  const text = document.body.textContent ?? ''
  expect(text).not.toMatch(FORBIDDEN)
  for (const zh of reservedText) expect(text).not.toContain(zh)
}

function click(element: HTMLElement): void {
  fireEvent.click(element)
}

async function answerQuestion(): Promise<void> {
  const question = await screen.findByTestId('listening-question')
  const exerciseId = question.getAttribute('data-exercise-id')!
  const exercise = course.exerciseById.get(exerciseId) ?? course.checkpointById.get(exerciseId)!
  // Hidden text before answering.
  expect(within(question).queryByTestId('transcript')).toBeNull()
  for (const option of within(question).getAllByTestId('answer-option')) {
    expect(option.getAttribute('aria-label')).toBeNull()
  }
  const correct = within(question).getAllByTestId('answer-option').find((option) => option.getAttribute('data-option-id') === exercise.correctOptionId)!
  click(correct)
  click(within(question).getByTestId('check-answer'))
  await within(question).findByTestId('feedback')
  click(within(question).getByTestId('continue'))
}

async function solveConstruction(): Promise<void> {
  const construction = await screen.findByTestId('construction')
  const exercise = course.constructionById.get(construction.getAttribute('data-construction-id')!)!
  for (const tileId of exercise.correctTileIds) {
    click(within(construction).getByTestId('construction-tiles').querySelector(`[data-tile-id="${tileId}"]`) as HTMLElement)
  }
  click(within(construction).getByTestId('construction-check'))
  await within(construction).findByTestId('construction-feedback')
  click(within(construction).getByTestId('continue'))
}

describe('MandarinGame five-scene preview', () => {
  it('walks onboarding → five scenes → listening check with honest labelling throughout', async () => {
    const store = createMemoryPreviewStore()
    store.saveSettings({ twoDMode: true, lowMotion: true })
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const runtime = createPreviewRuntime({
      scenario: findPreviewScenario('fresh'),
      store,
      speechSynthesis: null,
      sfx: NULL_SFX_PLAYER,
      channelDeps: { simulatedDurationMs: () => 1 },
      appendDelayMs: 0,
    })
    render(<MandarinGame runtime={runtime} />)

    // Onboarding first for a fresh partition; the DOM screen never waits on WebGL.
    const onboarding = await screen.findByTestId('onboarding-screen')
    expect(screen.getAllByTestId('preview-banner')[0]).toHaveTextContent(PREVIEW_BANNER_TEXT)
    expect(screen.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'poster')
    click(within(onboarding).getByTestId('onboarding-next'))
    click(screen.getByTestId('sound-check'))
    click(screen.getByTestId('onboarding-next'))
    click(screen.getByTestId('onboarding-finish'))

    let playedOnce = false
    for (const node of course.nodes) {
      const teaching = await screen.findByTestId('teaching-screen')
      expect(teaching).toHaveAttribute('data-node-id', node.id)
      assertHonest()
      click(within(teaching).getByTestId('start-questions'))
      const lesson = await screen.findByTestId('lesson-screen')
      expect(lesson).toHaveAttribute('data-node-id', node.id)
      if (!playedOnce) {
        // Simulated preview playback: enabled after the mock resolves, unscored afterwards.
        const play = await screen.findByTestId('play-button')
        await waitFor(() => expect(play).toBeEnabled())
        await act(async () => { click(play); await new Promise((resolve) => setTimeout(resolve, 10)) })
        expect(screen.getByTestId('audio-status')).toHaveTextContent(/simulated playback/i)
        playedOnce = true
      }
      for (let i = 0; i < node.exerciseIds.length; i += 1) await answerQuestion()
      for (let i = 0; i < node.constructionIds.length; i += 1) await solveConstruction()
      assertHonest()
      const scene = course.sceneForNode(node.id)
      if (scene.nodeIds.at(-1) === node.id) {
        const complete = await screen.findByTestId('scene-complete-screen')
        expect(complete).toHaveAttribute('data-scene-id', scene.id)
        expect(complete.textContent).not.toMatch(/master/i)
        if (scene.id !== 's5') click(within(complete).getByTestId('next-scene'))
      }
    }

    // Final scene: checkpoint opens only now.
    const complete = screen.getByTestId('scene-complete-screen')
    click(within(complete).getByTestId('open-listening-check'))
    const check = await screen.findByTestId('listening-check-screen')
    expect(check).toHaveAttribute('data-check-state', 'intro')
    expect(screen.getByTestId('fresh-chip')).toHaveTextContent('All 10 items are new to you')
    click(screen.getByTestId('start-check'))
    expect(screen.getByTestId('exposure-chip')).toHaveTextContent('First time')
    // Strict mode: no help before answering, no slow control.
    expect(screen.queryByTestId('help-toggle')).toBeNull()
    expect(screen.queryByTestId('slow-button')).toBeNull()
    for (let i = 0; i < 10; i += 1) await answerQuestion()
    expect(await screen.findByTestId('check-complete')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(FORBIDDEN)

    // Preview persistence only: memory store, no fetch, checkpoint exposure recorded.
    expect(fetchSpy).not.toHaveBeenCalled()
    const saved = store.loadProgress() as { completedSceneIds: string[]; checkpoint: { exposedExerciseIds: string[] } }
    expect(saved.completedSceneIds).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(saved.checkpoint.exposedExerciseIds).toHaveLength(10)
    expect(store.loadOutbox()).toEqual([])
    runtime.dispose()
    fetchSpy.mockRestore()
  })

  it('locks the checkpoint and hides reserved text for a fresh learner on Home', async () => {
    const store = createMemoryPreviewStore()
    store.saveSettings({ twoDMode: true })
    store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.0', onboardingComplete: true, currentNodeId: 's1n1' })
    const runtime = createPreviewRuntime({ scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER })
    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')
    expect(screen.getByTestId('listening-check-button')).toBeDisabled()
    click(screen.getByTestId('listening-check-button'))
    expect(screen.queryByTestId('listening-check-screen')).toBeNull()
    assertHonest()
    expect(screen.getAllByTestId('scene-card').map((card) => card.getAttribute('data-scene-status'))).toEqual(['available', 'locked', 'locked', 'locked', 'locked'])
    runtime.dispose()
  })

  it('shows the returning learner with a backlogged review and mock save labels', async () => {
    const store = createMemoryPreviewStore()
    store.saveSettings({ twoDMode: true })
    const runtime = createPreviewRuntime({ scenario: findPreviewScenario('returning'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER })
    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')
    expect(screen.getByTestId('review-button')).toHaveTextContent('12 due')
    expect(screen.getAllByTestId('scene-card').map((card) => card.getAttribute('data-scene-status'))).toEqual(['complete', 'complete', 'available', 'locked', 'locked'])
    click(screen.getByTestId('review-button'))
    const review = await screen.findByTestId('review-screen')
    expect(review).toHaveAttribute('data-review-state', 'backlogged')
    expect(screen.getByTestId('review-backlog')).toHaveTextContent('2 more due')
    assertHonest()
    runtime.dispose()
  })

  it('offers extra practice, visibly distinct, when nothing is due', async () => {
    const store = createMemoryPreviewStore()
    store.saveSettings({ twoDMode: true })
    const runtime = createPreviewRuntime({ scenario: findPreviewScenario('noDueReviews'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER })
    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')
    click(screen.getByTestId('review-button'))
    const review = await screen.findByTestId('review-screen')
    expect(review).toHaveAttribute('data-review-state', 'empty')
    click(within(review).getByText('Extra practice instead'))
    await waitFor(() => expect(screen.getByTestId('review-screen')).toHaveAttribute('data-review-kind', 'extra'))
    expect(screen.getByTestId('review-screen')).toHaveTextContent('does not change your review plan')
    runtime.dispose()
  })

  it('resets the preview partition only after confirmation', async () => {
    const store = createMemoryPreviewStore()
    store.saveSettings({ twoDMode: true })
    store.saveProgress({ version: 1, courseId: 'mandarin-foundations', contentVersion: '1.0.0', onboardingComplete: true, currentNodeId: 's1n1', completedNodeIds: ['s1n1'] })
    const runtime = createPreviewRuntime({ scenario: findPreviewScenario('fresh'), store, speechSynthesis: null, sfx: NULL_SFX_PLAYER })
    render(<MandarinGame runtime={runtime} />)
    await screen.findByTestId('home-screen')
    click(screen.getByLabelText('Settings'))
    await screen.findByTestId('settings-screen')
    click(screen.getByTestId('reset-preview'))
    expect(screen.getByTestId('reset-confirm')).toBeInTheDocument()
    click(screen.getByText('Keep my progress'))
    expect(screen.queryByTestId('reset-confirm')).toBeNull()
    expect((store.loadProgress() as { completedNodeIds: string[] }).completedNodeIds).toEqual(['s1n1'])
    click(screen.getByTestId('reset-preview'))
    click(screen.getByTestId('reset-confirm-button'))
    await screen.findByTestId('onboarding-screen')
    runtime.dispose()
  })
})
