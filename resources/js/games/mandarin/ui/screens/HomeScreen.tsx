import { BookOpen, Headphones, Play, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { isCheckpointUnlocked, nodeStatus } from '../../domain/progress'
import { useGame } from '../GameContext'
import { JourneyMap } from '../JourneyMap'
import { PreviewBanner } from '../PreviewBanner'
import { Chip, Eyebrow, GameButton, MUTED, Panel, SectionTitle } from '../primitives'
import { useRuntime } from '../RuntimeContext'
import { saveStateLabel } from '../SaveStatusChip'

export function HomeScreen(): ReactElement {
  const game = useGame()
  const { course, progress, projection, bootstrap } = game
  const currentNode = course.nodeById.get(progress.currentNodeId)
  const currentScene = currentNode ? course.sceneForNode(currentNode.id) : course.scenes[0]!
  const currentStatus = nodeStatus(progress, course, progress.currentNodeId)
  const allDone = course.nodes.every((node) => progress.completedNodeIds.includes(node.id))
  const due = projection?.dueTargetIds.length ?? 0
  const checkpointOpen = isCheckpointUnlocked(progress, course)
  const { scenario } = useRuntime()
  const mock = scenario !== null
  const account = saveStateLabel(game.saveState, mock)

  function openCurrent(): void {
    if (!currentNode) return
    game.navigate(currentStatus === 'introduced' ? { name: 'lesson', nodeId: currentNode.id } : { name: 'teaching', nodeId: currentNode.id })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="home-screen">
      <PreviewBanner />
      <Panel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Eyebrow>Find your friend</Eyebrow>
            <SectionTitle>{allDone ? 'You reached the reunion.' : `Scene ${currentScene.order}: ${currentScene.title}`}</SectionTitle>
            <p className={cn('text-sm', MUTED)}>{allDone ? 'Every scene is complete. Review, practice, or take the listening check.' : `Next: ${currentNode?.title ?? ''}. ${currentScene.objective}`}</p>
          </div>
          <Chip tone={account.tone}>{mock ? (bootstrap.account.signedIn ? 'Mock account' : 'Preview') : bootstrap.account.signedIn ? 'Signed in' : 'Guest'}</Chip>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <GameButton variant="primary" size="lg" onClick={openCurrent} disabled={allDone && !currentNode} data-testid="continue-button">
            <Play aria-hidden="true" className="size-5" />
            {progress.completedNodeIds.length > 0 || currentStatus === 'introduced' ? 'Continue' : 'Start'}
          </GameButton>
          <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'review', kind: 'scheduled' })} data-testid="review-button">
            <RefreshCw aria-hidden="true" className="size-5" />
            Review{due > 0 ? ` (${due} due)` : ''}
          </GameButton>
          <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'review', kind: 'extra' })} data-testid="practice-button">
            <BookOpen aria-hidden="true" className="size-5" />
            Practice
          </GameButton>
          <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'checkpoint' })} disabled={!checkpointOpen} data-testid="listening-check-button" title={checkpointOpen ? undefined : 'Unlocks after the last scene'}>
            <Headphones aria-hidden="true" className="size-5" />
            Listening Check{checkpointOpen ? '' : ' (locked)'}
          </GameButton>
        </div>
        {!mock && !bootstrap.account.signedIn && (
          <p className={cn('text-sm', MUTED)} data-testid="guest-notice">
            You can play as a guest. <a className="font-semibold underline decoration-dotted underline-offset-2" href="/login">Sign in</a> to save progress across devices and to generate audio for lines nobody has heard yet.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-xs', MUTED)}>{account.label}</p>
          <GameButton variant="quiet" onClick={() => game.navigate({ name: 'settings' })}>
            <SettingsIcon aria-hidden="true" className="size-4" /> Settings
          </GameButton>
        </div>
      </Panel>
      <section aria-labelledby="journey-heading" className="flex flex-col gap-2">
        <h2 id="journey-heading" className="text-base font-bold">Journey</h2>
        <JourneyMap
          course={course}
          progress={progress}
          onOpenNode={(nodeId) => {
            const status = nodeStatus(progress, course, nodeId)
            game.navigate(status === 'introduced' ? { name: 'lesson', nodeId } : { name: 'teaching', nodeId })
          }}
        />
      </section>
    </div>
  )
}
