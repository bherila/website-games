import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import { PREVIEW_SCENARIOS, previewScenarioHref } from '../../adapters/previewScenarios'
import { PREVIEW_STORAGE_PREFIX } from '../../adapters/previewStore'
import { useGame } from '../GameContext'
import { PreviewBanner } from '../PreviewBanner'
import { Eyebrow, GameButton, MUTED, Panel, SectionTitle } from '../primitives'
import { useRuntime } from '../RuntimeContext'

export function SettingsScreen(): ReactElement {
  const game = useGame()
  const { audio, scenario } = useRuntime()
  const { settings } = game
  const [confirmReset, setConfirmReset] = useState(false)
  const device = audio.deviceVoiceStatus()

  return (
    <div className="flex flex-col gap-3" data-testid="settings-screen">
      <PreviewBanner compact />
      <Panel className="flex flex-col gap-4">
        <div>
          <Eyebrow>Settings</Eyebrow>
          <SectionTitle>Sound</SectionTitle>
        </div>
        <Slider id="speech-volume" label="Speech volume" value={settings.speechVolume} onChange={(value) => game.updateSettings({ speechVolume: value })} />
        <Slider id="sfx-volume" label="Sound effects volume" value={settings.sfxVolume} onChange={(value) => game.updateSettings({ sfxVolume: value })} onCommit={() => audio.playSfx('ui-tap')} />
        <Toggle
          id="device-voice"
          label="Use a Mandarin voice from this device as a preview"
          description={device.available ? `Found: ${device.name ?? 'a Mandarin voice'}. It stands in for the real recordings and is labelled as a preview.` : 'No Mandarin voice is installed on this device. Prompts will show a simulated-playback notice.'}
          checked={settings.deviceVoicePreview}
          onChange={(checked) => game.updateSettings({ deviceVoicePreview: checked })}
        />
        <p className={cn('text-sm', MUTED)}>There is no microphone option. Nothing you say is recorded.</p>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <SectionTitle>Display</SectionTitle>
        <Toggle id="low-motion" label="Reduce motion" description="Stops camera and character animation in the scenery." checked={settings.lowMotion} onChange={(checked) => game.updateSettings({ lowMotion: checked })} />
        <Toggle id="two-d" label="Use 2D scenery" description="Shows the still picture instead of the 3D diorama. Saves battery and works without WebGL." checked={settings.twoDMode} onChange={(checked) => game.updateSettings({ twoDMode: checked })} />
        <fieldset className="m-0 border-0 p-0">
          <legend className="text-sm font-semibold">Pinyin</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['always', 'on_request'] as const).map((value) => (
              <label key={value} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm', settings.pinyinAssist === value ? 'border-[#5d8a70] bg-[#e4efe8]' : 'border-[#cfd6d1] bg-white')}>
                <input type="radio" name="pinyin" value={value} checked={settings.pinyinAssist === value} onChange={() => game.updateSettings({ pinyinAssist: value })} className="size-4 accent-[#5d8a70]" />
                {value === 'always' ? 'Show with every word' : 'Only when I ask'}
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Your data</SectionTitle>
        <p className="text-sm">
          This preview stores progress and settings only in this browser, under keys starting with <code className="rounded bg-[#eef0ec] px-1">{PREVIEW_STORAGE_PREFIX}</code>. Nothing is sent to a server. Preview progress is never imported into a real account.
        </p>
        {!confirmReset && (
          <GameButton variant="danger" onClick={() => setConfirmReset(true)} data-testid="reset-preview">Reset preview progress</GameButton>
        )}
        {confirmReset && (
          <div role="alertdialog" aria-labelledby="reset-title" aria-describedby="reset-desc" className="flex flex-col gap-2 rounded-xl border border-[#e0bcbc] bg-[#fbf1f1] p-3" data-testid="reset-confirm">
            <p id="reset-title" className="font-bold">Delete all preview progress on this browser?</p>
            <p id="reset-desc" className="text-sm">Scenes, answers and settings go back to the start. This cannot be undone.</p>
            <div className="flex flex-wrap gap-2">
              <GameButton variant="danger" onClick={() => { game.resetPreview(); setConfirmReset(false) }} data-testid="reset-confirm-button">Yes, reset</GameButton>
              <GameButton variant="secondary" onClick={() => setConfirmReset(false)}>Keep my progress</GameButton>
            </div>
          </div>
        )}
      </Panel>

      {scenario && (
        <Panel className="flex flex-col gap-2">
          <SectionTitle>Preview scenarios</SectionTitle>
          <p className={cn('text-sm', MUTED)}>Deterministic mock states for testing. Current: <strong>{scenario.label}</strong>. Switching reloads the page; local progress is kept.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {PREVIEW_SCENARIOS.map((item) => (
              <li key={item.id}>
                <a className={cn('block min-h-11 rounded-lg border px-3 py-2 text-sm', item.id === scenario.id ? 'border-[#5d8a70] bg-[#e4efe8]' : 'border-[#e2dccd] bg-white hover:bg-[#faf7f0]')} href={previewScenarioHref(item.id)} aria-current={item.id === scenario.id ? 'true' : undefined}>
                  <span className="font-semibold">{item.label}</span>
                  <span className={cn('block text-xs', MUTED)}>{item.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <GameButton variant="secondary" size="lg" onClick={() => game.navigate({ name: 'home' })}>Back to journey</GameButton>
    </div>
  )
}

function Slider({ id, label, value, onChange, onCommit }: { id: string; label: string; value: number; onChange: (value: number) => void; onCommit?: () => void }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-sm font-semibold"><span>{label}</span><span className={MUTED}>{Math.round(value * 100)}%</span></label>
      <input id={id} type="range" min={0} max={1} step={0.05} value={value} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} className="h-11 w-full accent-[#5d8a70]" />
    </div>
  )
}

function Toggle({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-5 shrink-0 accent-[#5d8a70]" />
      <label htmlFor={id} className="flex min-h-11 flex-col text-sm">
        <span className="font-semibold">{label}</span>
        <span className={MUTED}>{description}</span>
      </label>
    </div>
  )
}
