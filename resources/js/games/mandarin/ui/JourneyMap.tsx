/** Five scene cards with status. Used on Home and in the Map overlay. */
import { Check, Lock } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { SlotImage } from '../assets/SlotImage'
import { isVisualSlotId } from '../assets/visualRegistry'
import type { CourseIndex } from '../domain/course'
import { nodeStatus, type PreviewProgress, sceneStatus } from '../domain/progress'
import { Chip, MUTED } from './primitives'

interface JourneyMapProps {
  course: CourseIndex
  progress: PreviewProgress
  onOpenNode: (nodeId: string) => void
  compact?: boolean
}

const STATUS_LABEL = { locked: 'Locked', available: 'Ready', in_progress: 'In progress', complete: 'Complete' } as const
const STATUS_TONE = { locked: 'neutral', available: 'slate', in_progress: 'amber', complete: 'jade' } as const

export function JourneyMap({ course, progress, onOpenNode, compact = false }: JourneyMapProps): ReactElement {
  return (
    <ol className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')} data-testid="journey-map">
      {course.scenes.map((scene) => {
        const status = sceneStatus(progress, course, scene.id)
        const isCurrent = course.sceneForNode(progress.currentNodeId).id === scene.id
        return (
          <li
            key={scene.id}
            className={cn('overflow-hidden rounded-2xl border bg-white/95', isCurrent ? 'border-[#5d8a70] ring-2 ring-[#5d8a70]/30' : 'border-[#e2dccd]', status === 'locked' && 'opacity-70')}
            data-testid="scene-card"
            data-scene-id={scene.id}
            data-scene-status={status}
            aria-current={isCurrent ? 'step' : undefined}
          >
            {!compact && isVisualSlotId(scene.artSlotId) && (
              <SlotImage slotId={scene.artSlotId} className="aspect-[3/2] w-full object-cover" />
            )}
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={cn('text-xs font-bold uppercase tracking-wide', MUTED)}>Scene {scene.order}</p>
                  <h3 className="text-base font-bold leading-tight">{scene.title}</h3>
                </div>
                <Chip tone={STATUS_TONE[status]}>
                  {status === 'complete' && <Check aria-hidden="true" className="size-3" />}
                  {status === 'locked' && <Lock aria-hidden="true" className="size-3" />}
                  {STATUS_LABEL[status]}
                </Chip>
              </div>
              <p className={cn('text-sm', MUTED)}>{scene.objective}</p>
              <ul className="flex flex-col gap-1">
                {scene.nodeIds.map((nodeId) => {
                  const node = course.nodeById.get(nodeId)
                  const nStatus = nodeStatus(progress, course, nodeId)
                  const current = progress.currentNodeId === nodeId
                  return (
                    <li key={nodeId}>
                      <button
                        type="button"
                        onClick={() => onOpenNode(nodeId)}
                        disabled={nStatus === 'locked'}
                        className={cn(
                          'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[#d9a441]/60 disabled:cursor-not-allowed',
                          current ? 'border-[#5d8a70] bg-[#e4efe8]' : 'border-[#e2dccd] bg-[#faf7f0] hover:bg-[#f2ede2]',
                        )}
                        data-testid="node-button"
                        data-node-id={nodeId}
                        data-node-status={nStatus}
                        aria-current={current ? 'true' : undefined}
                      >
                        <span>{node?.title ?? nodeId}</span>
                        <span className={cn('text-xs font-normal', MUTED)}>
                          {nStatus === 'complete' ? 'Done' : nStatus === 'introduced' ? 'Started' : nStatus === 'locked' ? 'Locked' : current ? 'Next up' : 'Open'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
