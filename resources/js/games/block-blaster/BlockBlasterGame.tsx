import { type ReactElement, useCallback, useMemo, useRef, useState } from 'react'

import { TapHint } from '../_shared/TapHint'
import { PortraitGameShell } from '../PortraitGameShell'
import { BlockBlasterScene } from './BlockBlasterScene'
import { GameHud } from './GameHud'
import { GameOverOverlay } from './GameOverOverlay'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import { computeStars, type GameStatus, type HintScreenPosition, type SavedProgress } from './gameTypes'
import { LevelCompleteOverlay } from './LevelCompleteOverlay'
import { LEVELS } from './levels/levels'
import type { LevelDef } from './levels/levelTypes'
import { LevelSelect } from './LevelSelect'

/**
 * Dev jump: `?level=N` starts directly in level N (read once, at mount) without touching
 * persisted unlock progress — allowed in production per docs/games/block-blaster.md criteria H.
 */
function resolveDevJumpLevel(): LevelDef | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = new URLSearchParams(window.location.search).get('level')
  if (raw === null) {
    return null
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > LEVELS.length) {
    return null
  }

  return LEVELS.find((candidate) => candidate.id === parsed) ?? null
}

export function BlockBlasterGame(): ReactElement {
  const devJumpLevel = useMemo(() => resolveDevJumpLevel(), [])

  const [progress, setProgress] = useState<SavedProgress>(() => loadProgress())
  const [status, setStatus] = useState<GameStatus>(devJumpLevel ? 'playing' : 'select')
  const [levelId, setLevelId] = useState<number | null>(devJumpLevel?.id ?? null)
  const [ballsRemaining, setBallsRemaining] = useState(devJumpLevel?.balls ?? 0)
  const [attempt, setAttempt] = useState(devJumpLevel ? 1 : 0)
  const [hintVisible, setHintVisible] = useState(Boolean(devJumpLevel?.hint))
  const [hintPosition, setHintPosition] = useState<HintScreenPosition | null>(null)
  const [lastWinStars, setLastWinStars] = useState<1 | 2 | 3>(1)

  // Synchronous mirrors: scene callbacks arrive from native listeners/rAF, where React state can
  // lag a frame. The ended latch keeps a late onWin from overwriting a shown Game Over (and vice
  // versa); the ball mirror keeps star computation exact on same-frame win+shot interleavings.
  const endedRef = useRef(false)
  const ballsRemainingRef = useRef(devJumpLevel?.balls ?? 0)

  const level = useMemo(() => LEVELS.find((candidate) => candidate.id === levelId) ?? null, [levelId])

  const startLevel = useCallback((id: number): void => {
    const target = LEVELS.find((candidate) => candidate.id === id)
    if (!target) {
      return
    }

    endedRef.current = false
    ballsRemainingRef.current = target.balls
    setLevelId(id)
    setBallsRemaining(target.balls)
    setStatus('playing')
    setHintVisible(Boolean(target.hint))
    setHintPosition(null)
    setAttempt((current) => current + 1)
  }, [])

  const handleSelectLevel = useCallback((id: number): void => {
    startLevel(id)
  }, [startLevel])

  const handleRetry = useCallback((): void => {
    if (levelId !== null) {
      startLevel(levelId)
    }
  }, [levelId, startLevel])

  const handleGoToSelect = useCallback((): void => {
    setStatus('select')
    setLevelId(null)
  }, [])

  const handleNext = useCallback((): void => {
    if (levelId !== null) {
      startLevel(levelId + 1)
    }
  }, [levelId, startLevel])

  const handleShotFired = useCallback((): void => {
    ballsRemainingRef.current = Math.max(0, ballsRemainingRef.current - 1)
    setBallsRemaining(ballsRemainingRef.current)
    setHintVisible(false)
  }, [])

  const handleBlocksCleared = useCallback((): void => {}, [])

  const handleWin = useCallback((): void => {
    if (level === null || endedRef.current) {
      return
    }

    endedRef.current = true
    const stars = computeStars(ballsRemainingRef.current, level.starThresholds)
    setLastWinStars(stars)
    setStatus('won')
    const next = recordWin(loadProgress(), level.id, stars)
    saveProgress(next)
    setProgress(next)
  }, [level])

  const handleLose = useCallback((): void => {
    if (endedRef.current) {
      return
    }

    endedRef.current = true
    setStatus('lost')
  }, [])

  if (status === 'select' || level === null) {
    return (
      <PortraitGameShell>
        <LevelSelect levels={LEVELS} progress={progress} onSelectLevel={handleSelectLevel} />
      </PortraitGameShell>
    )
  }

  return (
    <PortraitGameShell>
      <section className="relative min-h-0 flex-1">
        <BlockBlasterScene
          key={`${level.id}-${attempt}`}
          ballsRemaining={ballsRemaining}
          hintVisible={hintVisible}
          level={level}
          status={status === 'won' || status === 'lost' ? status : 'playing'}
          onBlocksCleared={handleBlocksCleared}
          onHintPosition={setHintPosition}
          onLose={handleLose}
          onShotFired={handleShotFired}
          onWin={handleWin}
        />

        <GameHud ballsRemaining={ballsRemaining} level={level.id} onLevelSelect={handleGoToSelect} onRetry={handleRetry} />

        <TapHint position={hintVisible ? hintPosition : null} />

        {status === 'won' && (
          <LevelCompleteOverlay
            isFinalLevel={level.id >= LEVELS.length}
            stars={lastWinStars}
            onNext={handleNext}
            onReplay={handleRetry}
          />
        )}

        {status === 'lost' && (
          <GameOverOverlay onLevelSelect={handleGoToSelect} onReplay={handleRetry} />
        )}
      </section>
    </PortraitGameShell>
  )
}
