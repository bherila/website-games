/**
 * The current speaker, shown on the scenery during teaching without subtitles.
 *
 * The diorama is decorative, so this is ordinary DOM rendered as a sibling of
 * the canvas rather than inside it — nothing here depends on WebGL, and it
 * looks the same over the static poster.
 *
 * It follows the audio manager's current source rather than an animation beat,
 * so cancelling, failing or tapping a second line all clear or replace it
 * immediately instead of leaving a stale speaker on screen.
 *
 * It is deliberately `aria-hidden`: the speaker is already identified in the
 * dialogue list below it. Written support is revealed explicitly in that list.
 */
import type { ReactElement } from 'react'

import { SlotImage } from '../assets/SlotImage'
import { isVisualSlotId } from '../assets/visualRegistry'
import type { CourseIndex } from '../domain/course'
import { useSpeakingSource } from './useAudioSource'

export function DialogueStage({ course }: { course: CourseIndex }): ReactElement | null {
  const source = useSpeakingSource()
  if (!source || source.sourceKind !== 'utterance') return null
  const utterance = course.utteranceById.get(source.sourceId)
  // Reserved checkpoint lines are never staged, whatever is playing.
  if (!utterance || course.reservedUtteranceIds.has(utterance.id)) return null
  const role = course.roleById.get(utterance.roleId)
  const slotId = role?.portraitSlotId ?? null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3"
      aria-hidden="true"
      data-testid="dialogue-stage"
      data-utterance-id={utterance.id}
    >
      <div className="flex max-w-md items-center gap-3 rounded-2xl border border-[#e2dccd] bg-[#f5efe3]/95 px-3 py-2 shadow-[0_2px_10px_rgba(47,58,68,0.18)]">
        {slotId && isVisualSlotId(slotId) && (
          <SlotImage slotId={slotId} className="size-10 shrink-0 rounded-full border border-[#e2dccd] object-cover" />
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6d7a86]">{role?.name ?? utterance.roleId}</p>
          <p className="text-sm text-[#2f3a44]">Speaking · listen to the exchange</p>
        </div>
      </div>
    </div>
  )
}
