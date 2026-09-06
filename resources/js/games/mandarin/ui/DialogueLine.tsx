/** One spoken line in teaching: portrait slot, text, and its managed Play control. */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { SlotImage } from '../assets/SlotImage'
import { isVisualSlotId } from '../assets/visualRegistry'
import type { AudioSourceRef } from '../contracts/mandarin'
import type { CourseIndex } from '../domain/course'
import type { CourseUtterance } from '../domain/courseSchema'
import { MUTED, SpokenText } from './primitives'
import { PromptPlayer } from './PromptPlayer'

export function DialogueLine({ course, utterance, showPinyin, compact = false }: { course: CourseIndex; utterance: CourseUtterance; showPinyin: boolean; compact?: boolean }): ReactElement {
  const role = course.roleById.get(utterance.roleId)
  const slotId = role?.portraitSlotId ?? null
  const source: AudioSourceRef = { sourceKind: 'utterance', sourceId: utterance.id, variant: 'normal' }
  const slow: AudioSourceRef | null = utterance.audioVariants.includes('slow') ? { sourceKind: 'utterance', sourceId: utterance.id, variant: 'slow' } : null
  return (
    <article className="flex gap-3 rounded-xl border border-[#e2dccd] bg-white/90 p-3" data-testid="dialogue-line" data-utterance-id={utterance.id}>
      {slotId && isVisualSlotId(slotId) && (
        <SlotImage slotId={slotId} className="size-12 shrink-0 rounded-full border border-[#e2dccd] object-cover sm:size-14" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn('text-xs font-bold uppercase tracking-wide', MUTED)}>{role?.name ?? utterance.roleId}</p>
        <SpokenText zh={utterance.zh} pinyin={utterance.pinyin} en={utterance.en} showPinyin={showPinyin} size={compact ? 'md' : 'lg'} />
        <PromptPlayer source={source} slowSource={slow} size="md" playLabel="Play" />
      </div>
    </article>
  )
}
