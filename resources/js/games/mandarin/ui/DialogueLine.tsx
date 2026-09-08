/** Listen first; characters, pinyin and meaning are separate, optional supports. */
import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import { SlotImage } from '../assets/SlotImage'
import { isVisualSlotId } from '../assets/visualRegistry'
import type { AudioSourceRef } from '../contracts/mandarin'
import type { CourseIndex } from '../domain/course'
import type { CourseUtterance } from '../domain/courseSchema'
import { GameButton, MUTED } from './primitives'
import { PromptPlayer } from './PromptPlayer'

export function DialogueLine({ course, utterance, showPinyin, compact = false }: { course: CourseIndex; utterance: CourseUtterance; showPinyin: boolean; compact?: boolean }): ReactElement {
  const [characters, setCharacters] = useState(false)
  const [pinyin, setPinyin] = useState(false)
  const [meaning, setMeaning] = useState(false)
  const role = course.roleById.get(utterance.roleId)
  const slotId = role?.portraitSlotId ?? null
  const source: AudioSourceRef = { sourceKind: 'utterance', sourceId: utterance.id, variant: 'normal' }
  const slow: AudioSourceRef | null = utterance.audioVariants.includes('slow') ? { sourceKind: 'utterance', sourceId: utterance.id, variant: 'slow' } : null
  return (
    <article className="flex gap-3 rounded-xl border border-[#e2dccd] bg-white/90 p-3" data-testid="dialogue-line" data-utterance-id={utterance.id}>
      {slotId && isVisualSlotId(slotId) && <SlotImage slotId={slotId} className="size-12 shrink-0 rounded-full border border-[#e2dccd] object-cover sm:size-14" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn('text-xs font-bold uppercase tracking-wide', MUTED)}>{role?.name ?? utterance.roleId}</p>
        <PromptPlayer source={source} slowSource={slow} size="md" playLabel="Play" />
        <div className="flex flex-wrap gap-1">
          <GameButton variant="quiet" aria-expanded={characters} onClick={() => setCharacters(!characters)}>{characters ? 'Hide Chinese' : 'Show Chinese'}</GameButton>
          <GameButton variant="quiet" aria-expanded={meaning} onClick={() => setMeaning(!meaning)}>{meaning ? 'Hide meaning' : 'Show meaning'}</GameButton>
        </div>
        {characters && <div className="space-y-1" data-testid="dialogue-characters">
          <p lang="zh-Hans" className={compact ? 'text-xl' : 'text-2xl'}>{utterance.zh}</p>
          <GameButton variant="quiet" aria-expanded={pinyin || showPinyin} onClick={() => setPinyin(!pinyin)} disabled={showPinyin}>{showPinyin ? 'Pinyin on in Settings' : pinyin ? 'Hide pinyin' : 'Show pinyin'}</GameButton>
          {(pinyin || showPinyin) && <p lang="zh-Latn-pinyin" className={cn('text-sm', MUTED)}>{utterance.pinyin}</p>}
        </div>}
        {meaning && <p className="text-sm" data-testid="dialogue-meaning">{utterance.en}</p>}
      </div>
    </article>
  )
}
