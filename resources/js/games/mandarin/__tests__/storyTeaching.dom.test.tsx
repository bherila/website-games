import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { loadCourse } from '../domain/course'
import { CharacterPractice } from '../ui/CharacterPractice'
import { DialogueLine } from '../ui/DialogueLine'
import type { PromptPlayerProps } from '../ui/PromptPlayer'

let mockPlayback: PromptPlayerProps['onPlayback']

jest.mock('../ui/PromptPlayer', () => ({
  PromptPlayer: ({ onPlayback }: PromptPlayerProps) => {
    mockPlayback = onPlayback
    return <div>
    <button onClick={() => onPlayback?.('normal', 'completed')}>Complete audio</button>
    <button onClick={() => onPlayback?.('normal', 'simulated')}>Simulate audio</button>
    <button onClick={() => onPlayback?.('normal', 'failed')}>Fail audio</button>
  </div>
  },
}))

const course = loadCourse()
const lines = course.nodeById.get('s6n1')!.teachingUtteranceIds.map((id) => course.utteranceById.get(id)!)

describe('listening first, characters second', () => {
  it('keeps all written support hidden initially, even when pinyin assist is always on', () => {
    const line = lines[0]!
    render(<DialogueLine course={course} utterance={line} showPinyin />)
    expect(screen.queryByText(line.zh)).toBeNull()
    expect(screen.queryByText(line.pinyin)).toBeNull()
    expect(screen.queryByText(line.en)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show Chinese' }))
    expect(screen.getByText(line.zh)).toBeVisible()
    expect(screen.getByText(line.pinyin)).toBeVisible()
    expect(screen.queryByText(line.en)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show meaning' }))
    expect(screen.getByText(line.en)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Chinese' }))
    expect(screen.queryByText(line.zh)).toBeNull()
    expect(screen.queryByText(line.pinyin)).toBeNull()
  })

  it('requires completed audio, and resets that requirement for the next character round', () => {
    render(<CharacterPractice course={course} utterances={lines} />)
    const practice = screen.getByTestId('character-practice')
    fireEvent.click(within(practice).getByText('Then recognize the characters · optional'))
    const answer = screen.getByRole('button', { name: lines[0]!.zh })
    expect(answer).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Simulate audio' }))
    expect(answer).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Fail audio' }))
    expect(answer).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Complete audio' }))
    expect(answer).toBeEnabled()
    fireEvent.click(answer)
    expect(screen.getByRole('status')).toHaveTextContent('That is the written line.')
    const previousPlayback = mockPlayback
    fireEvent.click(screen.getByRole('button', { name: 'Try another line' }))
    act(() => previousPlayback?.('normal', 'completed'))
    expect(screen.getByRole('button', { name: lines[1]!.zh })).toBeDisabled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('never offers a reserved listening-check line as character practice', () => {
    const reserved = course.utteranceById.get('T11')!
    render(<CharacterPractice course={course} utterances={[reserved, ...lines]} />)
    expect(screen.queryByText(reserved.zh)).toBeNull()
  })
})
