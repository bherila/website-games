/** Optional recognition after teaching. Never emits a listening or scheduling result. */
import { type ReactElement, useState } from 'react'

import type { CourseIndex } from '../domain/course'
import type { CourseUtterance } from '../domain/courseSchema'
import { GameButton } from './primitives'
import { PromptPlayer } from './PromptPlayer'

export function CharacterPractice({ course, utterances }: { course: CourseIndex; utterances: readonly CourseUtterance[] }): ReactElement | null {
  const [round, setRound] = useState(0)
  // Duplicated greetings are one written choice; reserved lines never enter practice.
  const choices = utterances.filter((line, i, all) => !course.reservedUtteranceIds.has(line.id) && all.findIndex((other) => other.zh === line.zh) === i)
  if (choices.length < 2) return null
  const prompt = choices[round % choices.length]!
  return (
    <details className="rounded-xl border border-[#e2dccd] bg-white/80 p-3" data-testid="character-practice">
      <summary className="cursor-pointer font-bold">Then recognize the characters · optional</summary>
      <p className="my-2 text-sm">Listen to a familiar line, then choose its Chinese writing. This optional practice is separate from your listening results.</p>
      <CharacterRound key={prompt.id} prompt={prompt} choices={choices} onNext={() => setRound(round + 1)} />
    </details>
  )
}

// A keyed round owns playback evidence. A late callback from a previous line
// cannot unlock answers for the next one.
function CharacterRound({ prompt, choices, onNext }: { prompt: CourseUtterance; choices: readonly CourseUtterance[]; onNext: () => void }): ReactElement {
  const [selected, setSelected] = useState<string | null>(null)
  const [heard, setHeard] = useState(false)
  const options = [...choices].sort((a, b) => a.zh.localeCompare(b.zh, 'zh'))
  return <div>
      <PromptPlayer source={{ sourceKind: 'utterance', sourceId: prompt.id, variant: 'normal' }} onPlayback={(_variant, outcome) => { if (outcome === 'completed') setHeard(true) }} />
      <p className="my-2 text-sm">{heard ? 'Which written line did you hear?' : 'Play the recording first. You can also explore the written lines in the exchange above.'}</p>
      <div className="flex flex-col gap-2">{options.map((line) => <GameButton key={line.id} variant="secondary" disabled={!heard || selected !== null} onClick={() => setSelected(line.id)}><span lang="zh-Hans" className="text-xl">{line.zh}</span></GameButton>)}</div>
      {selected !== null && <div className="mt-3 space-y-2" role="status">
        <p>{selected === prompt.id ? 'That is the written line.' : 'Compare the characters with this line, then listen again.'}</p>
        <p lang="zh-Hans" className="text-xl">{prompt.zh}</p>
        <p>{prompt.en}</p>
        <GameButton variant="quiet" onClick={onNext}>Try another line</GameButton>
      </div>}
  </div>
}
