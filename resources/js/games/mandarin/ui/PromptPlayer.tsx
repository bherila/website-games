/**
 * The one control that plays a Mandarin source. Shows the honest audio state
 * for the source: preview (device voice / simulated), pending (bounded wait),
 * failed (explicit retry) or unavailable. Never claims real audio exists.
 */
import { Play, RotateCcw, Snail } from 'lucide-react'
import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import type { SourceStatus } from '../audio/audioManager'
import type { AudioResolution, AudioSourceRef } from '../contracts/mandarin'
import type { PlaybackOutcome } from '../domain/assessment'
import { GameButton } from './primitives'
import { useRuntime } from './RuntimeContext'
import { useSourceStatus, useSpeaking } from './useAudioSource'

export interface PromptPlayerProps {
  source: AudioSourceRef
  /** Slow variant of the same source, when the exercise allows it. */
  slowSource?: AudioSourceRef | null
  /** Called after each playback attempt with the honest outcome. */
  onPlayback?: (variant: 'normal' | 'slow', outcome: PlaybackOutcome) => void
  /** Label for the first play; becomes "Replay" after the first attempt. */
  playLabel?: string
  size?: 'md' | 'lg'
  autoRequest?: boolean
  className?: string
  disabled?: boolean
}

export function describeResolution(status: SourceStatus | null): { tone: 'preview' | 'pending' | 'failed' | 'unavailable' | 'ready' | 'idle'; label: string; retryable: boolean } {
  if (!status) return { tone: 'idle', label: '', retryable: false }
  if (status.transportError) return { tone: 'failed', label: status.transportError, retryable: true }
  const resolution: AudioResolution | null = status.resolution
  if (!resolution) return { tone: 'pending', label: 'Preparing audio…', retryable: false }
  switch (resolution.state) {
    case 'preview':
      return {
        tone: 'preview',
        label: status.effectiveDelivery === 'device_voice'
          ? 'Preview voice from this device. Not the final recording.'
          : 'Simulated playback (no audio). Answers here are unscored.',
        retryable: false,
      }
    case 'ready':
      return { tone: 'ready', label: '', retryable: false }
    case 'queued':
      return { tone: 'pending', label: `Preparing audio… (queued${status.pollCount ? `, check ${status.pollCount}` : ''})`, retryable: false }
    case 'generating':
      return { tone: 'pending', label: `Preparing audio… (generating${status.pollCount ? `, check ${status.pollCount}` : ''})`, retryable: false }
    case 'failed':
      return { tone: 'failed', label: resolution.message, retryable: resolution.retryable }
    case 'unavailable':
      return { tone: 'unavailable', label: resolution.message, retryable: resolution.retryable }
  }
}

export function PromptPlayer({ source, slowSource = null, onPlayback, playLabel = 'Play', size = 'lg', className, disabled = false }: PromptPlayerProps): ReactElement {
  const { audio } = useRuntime()
  const status = useSourceStatus(source)
  const slowStatus = useSourceStatus(slowSource)
  const speaking = useSpeaking()
  const [played, setPlayed] = useState(false)
  const [lastOutcome, setLastOutcome] = useState<PlaybackOutcome | null>(null)
  const info = describeResolution(status)
  const playable = status?.effectiveDelivery !== null && status?.effectiveDelivery !== undefined
  const slowPlayable = !!slowSource && !!slowStatus && slowStatus.effectiveDelivery !== null

  async function run(variant: 'normal' | 'slow'): Promise<void> {
    const ref = variant === 'slow' && slowSource ? slowSource : source
    audio.unlock()
    const outcome = await audio.play(ref)
    setLastOutcome(outcome)
    if (outcome === 'completed' || outcome === 'simulated') setPlayed(true)
    onPlayback?.(variant, outcome)
  }

  const showRetry = info.retryable
  const busy = speaking

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="prompt-player" data-audio-tone={info.tone}>
      <div className="flex flex-wrap items-center gap-2">
        <GameButton
          variant="primary"
          size={size}
          onClick={() => void run('normal')}
          disabled={disabled || !playable}
          aria-label={played ? 'Replay the Mandarin prompt' : 'Play the Mandarin prompt'}
          data-testid="play-button"
          className={cn(size === 'lg' && 'min-w-36')}
        >
          {played ? <RotateCcw aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
          {busy ? 'Playing…' : played ? 'Replay' : playLabel}
        </GameButton>
        {slowSource && (
          <GameButton
            variant="secondary"
            size={size}
            onClick={() => void run('slow')}
            disabled={disabled || !slowPlayable}
            aria-label="Play slower"
            data-testid="slow-button"
          >
            <Snail aria-hidden="true" className="size-5" />
            Slower
          </GameButton>
        )}
        {showRetry && (
          <GameButton variant="secondary" size={size} onClick={() => audio.retry(source)} data-testid="retry-audio">
            Retry audio
          </GameButton>
        )}
      </div>
      {info.label && (
        <p
          role="status"
          data-testid="audio-status"
          className={cn(
            'text-xs leading-snug sm:text-sm',
            info.tone === 'failed' && 'text-[#8a3232]',
            info.tone === 'unavailable' && 'text-[#8a3232]',
            info.tone === 'pending' && 'text-[#33465c]',
            info.tone === 'preview' && 'text-[#7a5a14]',
          )}
        >
          {info.label}
        </p>
      )}
      {lastOutcome === 'blocked' && (
        <p role="status" className="text-xs text-[#33465c] sm:text-sm">Your browser paused audio. Press Play to try again.</p>
      )}
      {lastOutcome === 'failed' && (
        <p role="status" className="text-xs text-[#8a3232] sm:text-sm">Playback stopped before it finished. This attempt is not counted as heard.</p>
      )}
    </div>
  )
}
