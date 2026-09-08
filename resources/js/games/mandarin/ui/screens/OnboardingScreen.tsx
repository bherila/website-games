import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import { markOnboardingComplete } from '../../domain/progress'
import { useGame } from '../GameContext'
import { PreviewBanner } from '../PreviewBanner'
import { Eyebrow, GameButton, MUTED, Panel, SectionTitle } from '../primitives'
import { useRuntime } from '../RuntimeContext'

const TONES = [
  { mark: 'ā', name: 'first', hint: 'high and flat' },
  { mark: 'á', name: 'second', hint: 'rising, like a question' },
  { mark: 'ǎ', name: 'third', hint: 'dips, then rises' },
  { mark: 'à', name: 'fourth', hint: 'falls sharply' },
]

export function OnboardingScreen(): ReactElement {
  const game = useGame()
  const { audio, scenario } = useRuntime()
  const [step, setStep] = useState(0)
  const [soundChecked, setSoundChecked] = useState(false)
  const device = audio.deviceVoiceStatus()

  function finish(): void {
    game.updateProgress((progress) => markOnboardingComplete(progress))
    const first = game.course.nodes[0]
    if (first) game.navigate({ name: 'teaching', nodeId: first.id })
    else game.navigate({ name: 'home' })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="onboarding-screen" data-step={step}>
      <PreviewBanner compact />
      {step === 0 && (
        <Panel className="flex flex-col gap-3">
          <Eyebrow>Welcome</Eyebrow>
          <SectionTitle>The Seven-School Supper</SectionTitle>
          <p>{game.course.course.synopsis ?? "Find your friend by listening to the people you meet."}</p>
          <ul className="space-y-2 text-sm">{game.course.course.roles.map((role) => <li key={role.id}><strong>{role.name}</strong> — {role.description}</li>)}</ul>
          <ul className={cn('list-disc space-y-1 pl-5 text-sm', MUTED)}>
            <li>Listen first; recognizing Chinese characters comes next. Every question plays a spoken line first. The words stay hidden until you answer or ask for help.</li>
            <li>Replays, slower playback and help are always available. They are recorded, never punished.</li>
            <li>No microphone. Nothing you say is recorded.</li>
          </ul>
          <GameButton variant="primary" size="lg" onClick={() => setStep(1)} data-testid="onboarding-next">Next: sound check</GameButton>
        </Panel>
      )}
      {step === 1 && (
        <Panel className="flex flex-col gap-3">
          <Eyebrow>Step 2 of 3</Eyebrow>
          <SectionTitle>Sound check</SectionTitle>
          <p>Tap the button. You should hear a short, soft chime. Turn your device volume up if you hear nothing.</p>
          <GameButton variant="primary" size="lg" onClick={() => { audio.unlock(); audio.playSfx('answer-correct'); setSoundChecked(true) }} data-testid="sound-check">
            Play test sound
          </GameButton>
          <p className={cn('text-sm', MUTED)} role="status">
            {scenario === null
              ? 'The chime checks your device volume. In lessons, tap Play to hear recorded Mandarin.'
              : device.available
              ? `Mandarin preview voice on this device: ${device.name ?? 'available'}. It is a stand-in until real recordings are connected.`
              : 'No Mandarin voice was found on this device. Prompts will show a simulated-playback notice and answers stay unscored until real audio is connected.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <GameButton variant="primary" size="lg" onClick={() => setStep(2)} disabled={!soundChecked} data-testid="onboarding-next">I heard it</GameButton>
            <GameButton variant="quiet" onClick={() => setStep(2)}>Skip for now</GameButton>
          </div>
        </Panel>
      )}
      {step === 2 && (
        <Panel className="flex flex-col gap-3">
          <Eyebrow>Step 3 of 3 · optional</Eyebrow>
          <SectionTitle>Pinyin and tones in one minute</SectionTitle>
          <p>Pinyin writes Mandarin sounds with Latin letters. The mark above a vowel shows the tone: the pitch shape of the syllable. Same letters, different tone, different word.</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TONES.map((tone) => (
              <li key={tone.name} className="rounded-xl border border-[#e2dccd] bg-[#faf7f0] p-3 text-center">
                <p className="text-3xl font-medium" lang="zh-Latn-pinyin">{tone.mark}</p>
                <p className="text-xs font-bold uppercase tracking-wide">{tone.name} tone</p>
                <p className={cn('text-xs', MUTED)}>{tone.hint}</p>
              </li>
            ))}
          </ul>
          <p className={cn('text-sm', MUTED)}>You can show or hide pinyin any time in Settings.</p>
          <div className="flex flex-wrap gap-2">
            <GameButton variant="primary" size="lg" onClick={finish} data-testid="onboarding-finish">Start scene 1</GameButton>
            <GameButton variant="quiet" onClick={() => setStep(1)}>Back</GameButton>
          </div>
        </Panel>
      )}
      {step === 0 && (
        <GameButton variant="quiet" onClick={finish} data-testid="onboarding-skip">Skip the intro</GameButton>
      )}
    </div>
  )
}
