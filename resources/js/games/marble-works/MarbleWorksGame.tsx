import { Eraser, Grid3x3, Play, Square } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { FullscreenBottomControlButton } from '../_shared/FullscreenButton'
import { BottomControlButton, GAME_TOOLBAR_PADDING_CLASS, GameBottomToolbar } from '../_shared/GameControlPrimitives'
import type { LevelStarsProgress } from '../_shared/levelStarsProgress'
import { TapHint, type TapHintPosition } from '../_shared/TapHint'
import { PortraitGameShell } from '../PortraitGameShell'
import {
  canFlip,
  canRotate,
  cellCenter,
  computeStars,
  flipPlacement,
  matchesTutorial,
  onTutorialCell,
  placementAt,
  placementProblem,
  placementSize,
  remainingCount,
  rotatePlacement,
} from './board/grid'
import { type BoardLayout, worldToScreen } from './board/layout'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import { LEVELS } from './levels/levels'
import type { Cell, LevelDef, PiecePlacement, PlacedPiece } from './levels/levelTypes'
import { LevelSelect } from './LevelSelect'
import { type BoardPointerEvent, MarbleWorksScene } from './MarbleWorksScene'
import type { MarbleKind } from './physics/marbles'
import type { FailStatus } from './physics/runOutcome'
import { marbleSchedule, type RunResult } from './physics/runWorld'
import { PIECE_IDS, type PieceId, type Vec2 } from './pieces/pieceCatalog'
import { GameHud } from './ui/GameHud'
import { HintBubble, LevelCompleteOverlay, RunFailedToast, type WinSummary } from './ui/Overlays'
import { PieceActionBar } from './ui/PieceActionBar'
import { PieceIcon } from './ui/PieceIcon'
import { PieceTray } from './ui/PieceTray'

type Phase = 'edit' | 'running' | 'won'

interface Armed {
  pieceId: PieceId
  variant: number
  flipped: boolean
}

interface Drag {
  kind: 'place' | 'move'
  uid: string | null
  originCell: Cell
  placement: PiecePlacement
  moved: boolean
}

/**
 * A mouse or pen press on a tray card. It becomes a drag (one piece carried to the board)
 * once the pointer travels `TRAY_DRAG_THRESHOLD_PX`; released before that, it is a click.
 */
interface TrayDrag {
  pieceId: PieceId
  pointerId: number
  x: number
  y: number
  moved: boolean
}

type TutorialStep = 'pick' | 'place' | 'fix' | 'flip' | 'go'

const TRAY_DRAG_THRESHOLD_PX = 6
/** A click this soon after a tray drag ends is the drag's own release, not a pick. */
const TRAY_CLICK_AFTER_DRAG_MS = 250

const FAIL_RESET_DELAY_MS = 650

/** Dev jump: `?level=N` opens level N directly without touching saved progress. */
function resolveDevJumpLevel(): number | null {
  if (typeof window === 'undefined') {
    return null
  }
  const parsed = Number.parseInt(new URLSearchParams(window.location.search).get('level') ?? '', 10)

  return LEVELS.some((level) => level.id === parsed) ? parsed : null
}

/** Anchors a footprint so the pointer sits over its top-centre cell. */
function anchoredPlacement(armed: Armed, cell: Cell): PiecePlacement {
  const { w } = placementSize(armed)

  return { ...armed, col: cell.col - Math.floor((w - 1) / 2), row: cell.row }
}

function sameCell(a: Cell | null, b: Cell | null): boolean {
  return a !== null && b !== null && a.col === b.col && a.row === b.row
}

export function MarbleWorksGame(): ReactElement {
  const devJumpLevel = useMemo(() => resolveDevJumpLevel(), [])
  const [progress, setProgress] = useState<LevelStarsProgress>(() => loadProgress())
  const [levelId, setLevelId] = useState<number | null>(devJumpLevel)
  const [placements, setPlacements] = useState<PlacedPiece[]>([])
  const [armed, setArmed] = useState<Armed | null>(null)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<PiecePlacement | null>(null)
  const [phase, setPhase] = useState<Phase>('edit')
  const [runToken, setRunToken] = useState<number | null>(null)
  const [failed, setFailed] = useState<{ status: FailStatus; kind: MarbleKind | null } | null>(null)
  const [ghostPaths, setGhostPaths] = useState<Vec2[][] | null>(null)
  const [liveGems, setLiveGems] = useState(0)
  const [layout, setLayout] = useState<BoardLayout | null>(null)
  const [hintOpen, setHintOpen] = useState(false)
  const [lastWin, setLastWin] = useState<WinSummary | null>(null)
  const [trayShake, setTrayShake] = useState<{ pieceId: PieceId; key: number } | null>(null)
  const [tutorialHint, setTutorialHint] = useState<TapHintPosition | null>(null)
  const [trayDragIcon, setTrayDragIcon] = useState<{ pieceId: PieceId; x: number; y: number } | null>(null)
  const trayDragRef = useRef<TrayDrag | null>(null)
  const trayDragEndedAtRef = useRef(Number.NEGATIVE_INFINITY)

  const placementsByLevelRef = useRef(new Map<number, PlacedPiece[]>())
  const orientationsRef = useRef(new Map<PieceId, { variant: number; flipped: boolean }>())
  const nextUidRef = useRef(1)
  const failTimerRef = useRef<number | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const playRef = useRef<HTMLDivElement | null>(null)
  const trayRef = useRef<HTMLDivElement | null>(null)
  const goButtonRef = useRef<HTMLDivElement | null>(null)

  const level = useMemo<LevelDef | null>(() => LEVELS.find((candidate) => candidate.id === levelId) ?? null, [levelId])
  const editing = phase === 'edit'

  useEffect(() => () => {
    if (failTimerRef.current !== null) {
      window.clearTimeout(failTimerRef.current)
    }
  }, [])

  const clearFailTimer = (): void => {
    if (failTimerRef.current !== null) {
      window.clearTimeout(failTimerRef.current)
      failTimerRef.current = null
    }
  }

  const updatePlacements = useCallback((next: PlacedPiece[]): void => {
    setPlacements(next)
    setGhostPaths(null)
    setFailed(null)
    if (levelId !== null) {
      placementsByLevelRef.current.set(levelId, next)
    }
  }, [levelId])

  const startLevel = useCallback((id: number): void => {
    const target = LEVELS.find((candidate) => candidate.id === id)
    if (!target) {
      return
    }
    clearFailTimer()
    setLevelId(id)
    setPlacements(placementsByLevelRef.current.get(id) ?? [])
    setArmed(null)
    setSelectedUid(null)
    setDrag(null)
    setHover(null)
    setPhase('edit')
    setRunToken(null)
    setFailed(null)
    setGhostPaths(null)
    setLiveGems(0)
    setLastWin(null)
    setHintOpen(Boolean(target.hint) && target.autoHint === true && !target.tutorial && progress.stars[id] === undefined)
  }, [progress.stars])

  const goToSelect = useCallback((): void => {
    clearFailTimer()
    setLevelId(null)
    setRunToken(null)
    setPhase('edit')
  }, [])

  const remaining = useMemo(() => {
    const counts: Partial<Record<PieceId, number>> = {}
    if (level) {
      for (const pieceId of PIECE_IDS) {
        if (level.inventory[pieceId] !== undefined) {
          counts[pieceId] = remainingCount(level, placements, pieceId)
        }
      }
    }

    return counts
  }, [level, placements])

  const selectedIndex = placements.findIndex((placement) => placement.uid === selectedUid)
  const selected = selectedIndex >= 0 ? placements[selectedIndex] ?? null : null

  const ghost = useMemo(() => {
    if (!level || !editing) {
      return null
    }
    if (drag && (drag.kind === 'place' || drag.moved)) {
      const ignore = drag.kind === 'move' ? placements.findIndex((placement) => placement.uid === drag.uid) : null
      return { placement: drag.placement, ok: placementProblem(level, placements, drag.placement, ignore) === null }
    }
    if (hover && armed) {
      return { placement: hover, ok: placementProblem(level, placements, hover) === null }
    }

    return null
  }, [armed, drag, editing, hover, level, placements])

  // Highlight exactly the cells a tap would accept: same anchoring and legality check as placing.
  const freeCells = useMemo<Cell[]>(() => {
    if (!level || !armed || !editing) {
      return []
    }
    const cells: Cell[] = []
    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.cols; col += 1) {
        if (placementProblem(level, placements, anchoredPlacement(armed, { col, row })) === null) {
          cells.push({ col, row })
        }
      }
    }

    return cells
  }, [armed, editing, level, placements])

  const tutorial = level?.tutorial && progress.stars[level.id] === undefined ? level.tutorial : null
  const tutorialStep: TutorialStep | null = !tutorial || !editing
    ? null
    : placements.length === 0
      ? (armed?.pieceId === tutorial.pieceId ? 'place' : 'pick')
      : placements.some((placement) => matchesTutorial(placement, tutorial))
        ? 'go'
        : placements.some((placement) => onTutorialCell(placement, tutorial))
          ? 'flip'
          : 'fix'

  const shakeTray = (pieceId: PieceId): void => setTrayShake((current) => ({ pieceId, key: (current?.key ?? 0) + 1 }))

  const handleArm = (pieceId: PieceId): void => {
    if (!level || !editing || performance.now() - trayDragEndedAtRef.current < TRAY_CLICK_AFTER_DRAG_MS) {
      return
    }
    if (armed?.pieceId === pieceId) {
      setArmed(null)
      setHover(null)
      return
    }
    if ((remaining[pieceId] ?? 0) <= 0) {
      shakeTray(pieceId)
      return
    }
    const orientation = orientationsRef.current.get(pieceId) ?? { variant: 0, flipped: false }
    setArmed({ pieceId, ...orientation })
    setSelectedUid(null)
    setHintOpen(false)
  }

  /** Starts a possible tray drag. Touch keeps tap-to-pick, so the tray strip still scrolls. */
  const handleTrayPointerDown = (pieceId: PieceId, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType === 'touch' || event.button !== 0 || !level || !editing || (remaining[pieceId] ?? 0) <= 0) {
      return
    }
    trayDragRef.current = { pieceId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }

  // A tray drag follows the pointer across the page. The board's own pointer events (no
  // capture, since the press began on the tray) show the ghost and drop the piece; the window
  // listener runs after them and ends the drag wherever the button is released.
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const current = trayDragRef.current
      if (!current || event.pointerId !== current.pointerId) {
        return
      }
      if (!current.moved) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < TRAY_DRAG_THRESHOLD_PX) {
          return
        }
        current.moved = true
        const orientation = orientationsRef.current.get(current.pieceId) ?? { variant: 0, flipped: false }
        setArmed({ pieceId: current.pieceId, ...orientation })
        setSelectedUid(null)
        setHintOpen(false)
      }
      setTrayDragIcon({ pieceId: current.pieceId, x: event.clientX, y: event.clientY })
    }
    const onEnd = (event: PointerEvent): void => {
      const current = trayDragRef.current
      if (!current || event.pointerId !== current.pointerId) {
        return
      }
      trayDragRef.current = null
      if (!current.moved) {
        return
      }
      setTrayDragIcon(null)
      setArmed(null)
      setHover(null)
      // Releasing over the card it came from would also click it; that is not a pick.
      trayDragEndedAtRef.current = performance.now()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [])

  const placeArmed = (placement: PiecePlacement): void => {
    if (!level) {
      return
    }
    if (placementProblem(level, placements, placement) !== null) {
      return
    }
    const uid = `p${nextUidRef.current}`
    nextUidRef.current += 1
    const next = [...placements, { ...placement, uid }]
    updatePlacements(next)
    // Select what just landed, so Rotate / Flip are one tap away while it is still in mind.
    setSelectedUid(uid)
    if (remainingCount(level, next, placement.pieceId) <= 0) {
      setArmed(null)
      setHover(null)
    }
  }

  const replaceSelected = (transform: (placement: PlacedPiece) => PlacedPiece): void => {
    if (!level || !selected) {
      return
    }
    const candidate = transform(selected)
    if (placementProblem(level, placements, candidate, selectedIndex) !== null) {
      return
    }
    orientationsRef.current.set(candidate.pieceId, { variant: candidate.variant, flipped: candidate.flipped })
    updatePlacements(placements.map((placement) => (placement.uid === candidate.uid ? candidate : placement)))
  }

  const removeSelected = (): void => {
    if (!selected) {
      return
    }
    updatePlacements(placements.filter((placement) => placement.uid !== selected.uid))
    setSelectedUid(null)
  }

  const transformArmed = (transform: (armedPiece: PiecePlacement) => PiecePlacement): void => {
    if (!armed) {
      return
    }
    const next = transform({ ...armed, col: 0, row: 0 })
    const orientation = { variant: next.variant, flipped: next.flipped }
    orientationsRef.current.set(armed.pieceId, orientation)
    setArmed({ pieceId: armed.pieceId, ...orientation })
    setHover((current) => (current ? { ...current, ...orientation } : null))
  }

  const isOverTray = (clientX: number, clientY: number): boolean => {
    const rect = trayRef.current?.getBoundingClientRect()

    return Boolean(rect && rect.width > 0 && rect.height > 0
      && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom)
  }

  const handleBoardPointer = (event: BoardPointerEvent): void => {
    if (!level || !editing) {
      return
    }
    const { cell } = event

    if (event.type === 'down') {
      setHintOpen(false)
      if (!cell) {
        setSelectedUid(null)
        return
      }
      if (armed) {
        setDrag({ kind: 'place', uid: null, originCell: cell, placement: anchoredPlacement(armed, cell), moved: false })
        return
      }
      const index = placementAt(placements, cell)
      const target = placements[index]
      if (target) {
        setSelectedUid(target.uid)
        setDrag({ kind: 'move', uid: target.uid, originCell: cell, placement: target, moved: false })
      } else {
        setSelectedUid(null)
      }
      return
    }

    if (event.type === 'move') {
      if (drag && cell) {
        if (drag.kind === 'place') {
          if (armed && !sameCell(cell, drag.originCell)) {
            setDrag({ ...drag, originCell: cell, placement: anchoredPlacement(armed, cell) })
          }
        } else {
          const source = placements.find((placement) => placement.uid === drag.uid)
          if (source) {
            const moved = drag.moved || !sameCell(cell, drag.originCell)
            const placement = { ...source, col: source.col + (cell.col - drag.originCell.col), row: source.row + (cell.row - drag.originCell.row) }
            if (moved !== drag.moved || placement.col !== drag.placement.col || placement.row !== drag.placement.row) {
              setDrag({ ...drag, moved, placement })
            }
          }
        }
      } else if (!drag && armed && event.pointerType !== 'touch') {
        const next = cell ? anchoredPlacement(armed, cell) : null
        if (next?.col !== hover?.col || next?.row !== hover?.row || next?.variant !== hover?.variant || next?.flipped !== hover?.flipped) {
          setHover(next)
        }
      }
      return
    }

    if (event.type === 'leave') {
      setHover(null)
      return
    }

    if (event.type === 'cancel') {
      setDrag(null)
      return
    }

    // Pointer up.
    const current = drag
    setDrag(null)
    const fromTray = !current && trayDragRef.current?.moved === true
    if (!current && !fromTray) {
      return
    }
    if (!current || current.kind === 'place') {
      if (cell && armed) {
        const placement = anchoredPlacement(armed, cell)
        if (placementProblem(level, placements, placement) === null) {
          placeArmed(placement)
          // With a mouse or pen a pick places one piece; touch keeps it for the next tap.
          if (event.pointerType !== 'touch') {
            setArmed(null)
            setHover(null)
          }
        } else {
          shakeTray(armed.pieceId)
        }
      }
      return
    }

    if (!current.moved) {
      return
    }
    const index = placements.findIndex((placement) => placement.uid === current.uid)
    const source = placements[index]
    if (!source) {
      return
    }
    if (isOverTray(event.clientX, event.clientY)) {
      updatePlacements(placements.filter((placement) => placement.uid !== source.uid))
      setSelectedUid(null)
      return
    }
    if (placementProblem(level, placements, current.placement, index) === null) {
      updatePlacements(placements.map((placement) => (placement.uid === source.uid ? { ...source, col: current.placement.col, row: current.placement.row } : placement)))
    }
  }

  const handleGo = (): void => {
    if (!level) {
      return
    }
    if (phase === 'edit') {
      clearFailTimer()
      setArmed(null)
      setHover(null)
      setSelectedUid(null)
      setDrag(null)
      setFailed(null)
      setGhostPaths(null)
      setLiveGems(0)
      setHintOpen(false)
      setPhase('running')
      setRunToken((current) => (current ?? 0) + 1)
    } else if (phase === 'running') {
      clearFailTimer()
      setPhase('edit')
      setRunToken(null)
    }
  }

  const handleRunEnd = useCallback((result: RunResult): void => {
    if (!level) {
      return
    }
    setLiveGems(result.gems)
    if (result.status === 'won') {
      const breakdown = computeStars(placements.length, level, result.gems)
      setLastWin({ ...breakdown, pieces: placements.length, parPieces: level.par, gemsCollected: result.gems, gemsTotal: level.gems.length })
      setPhase('won')
      const next = recordWin(loadProgress(), level.id, breakdown.stars)
      saveProgress(next)
      setProgress(next)
      return
    }
    if (result.status === 'running') {
      return
    }
    setFailed({ status: result.status, kind: marbleSchedule(level)[result.failedMarble]?.kind ?? null })
    setGhostPaths(result.paths)
    clearFailTimer()
    failTimerRef.current = window.setTimeout(() => {
      failTimerRef.current = null
      setPhase('edit')
      setRunToken(null)
    }, FAIL_RESET_DELAY_MS)
  }, [level, placements.length])

  const handleReplay = (): void => {
    setLastWin(null)
    setPhase('edit')
    setRunToken(null)
  }

  const handleClear = (): void => {
    updatePlacements([])
    setSelectedUid(null)
  }

  useEffect(() => {
    if (!level) {
      return undefined
    }
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === ' ') {
        if (target?.tagName === 'BUTTON') {
          return
        }
        event.preventDefault()
        handleGo()
      } else if (!editing) {
        return
      } else if (key === 'r') {
        if (selected) {
          replaceSelected(rotatePlacement)
        } else {
          transformArmed(rotatePlacement)
        }
      } else if (key === 'f') {
        if (selected) {
          replaceSelected(flipPlacement)
        } else {
          transformArmed(flipPlacement)
        }
      } else if (key === 'delete' || key === 'backspace') {
        removeSelected()
      } else if (key === 'escape') {
        setArmed(null)
        setHover(null)
        setSelectedUid(null)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const play = playRef.current
    const section = sectionRef.current
    if (!tutorial || !tutorialStep || !play || !section) {
      setTutorialHint(null)
      return
    }
    // Every hint is positioned relative to the outer play container, which holds the
    // board, the tray and the toolbar.
    const playRect = play.getBoundingClientRect()
    const centerOf = (element: Element | null | undefined): TapHintPosition | null => {
      if (!element) {
        return null
      }
      const rect = element.getBoundingClientRect()

      return { x: rect.left + (rect.width / 2) - playRect.left, y: rect.top + (rect.height / 2) - playRect.top }
    }
    if (tutorialStep === 'pick') {
      setTutorialHint(centerOf(trayRef.current?.querySelector(`[data-piece="${tutorial.pieceId}"]`)))
    } else if (tutorialStep === 'go') {
      setTutorialHint(centerOf(goButtonRef.current))
    } else if (layout && level) {
      const sectionRect = section.getBoundingClientRect()
      const [wx, wy] = cellCenter(level, tutorial.cell)
      const [x, y] = worldToScreen(level, layout, wx, wy)
      setTutorialHint({ x: x + sectionRect.left - playRect.left, y: y + sectionRect.top - playRect.top })
    }
  }, [layout, level, tutorial, tutorialStep])

  if (!level) {
    return (
      <PortraitGameShell>
        <LevelSelect levels={LEVELS} progress={progress} onSelectLevel={startLevel} />
      </PortraitGameShell>
    )
  }

  const actionBar = selected && layout && editing && !drag
    ? (() => {
        const { w, h } = placementSize(selected)
        const [x, pieceTop] = worldToScreen(level, layout, selected.col + (w / 2), level.rows - selected.row)
        const [, pieceBottom] = worldToScreen(level, layout, selected.col + (w / 2), level.rows - selected.row - h)
        const fits = (candidate: PiecePlacement): boolean => placementProblem(level, placements, candidate, selectedIndex) === null

        return { x, pieceTop, pieceBottom, rotateFits: fits(rotatePlacement(selected)), flipFits: fits(flipPlacement(selected)) }
      })()
    : null

  const tutorialMessage = tutorialStep === 'pick'
    ? 'Tap the ramp to pick it up.'
    : tutorialStep === 'place'
      ? 'Now tap the glowing spot to place it.'
      : tutorialStep === 'fix'
        ? 'Almost! Drag your ramp onto the glowing spot.'
        : tutorialStep === 'flip'
          ? 'Almost! Tap your ramp and use Flip so it slopes toward the basket.'
          : tutorialStep === 'go'
            ? 'Press Go and let it roll!'
            : null

  return (
    <PortraitGameShell allowLandscape>
      <div className={`relative flex min-h-0 flex-1 flex-col md:flex-row ${GAME_TOOLBAR_PADDING_CLASS}`} data-phase={phase} data-testid="marble-works-play" ref={playRef}>
        <section className="relative min-h-0 flex-1 overflow-hidden md:order-2" ref={sectionRef}>
          <MarbleWorksScene
            editing={editing}
            freeCells={freeCells}
            ghost={ghost}
            ghostPaths={ghostPaths}
            key={level.id}
            level={level}
            placements={placements}
            runToken={runToken}
            selected={editing ? selected : null}
            tutorialCell={tutorialStep === 'place' || tutorialStep === 'fix' || tutorialStep === 'flip' ? tutorial?.cell ?? null : null}
            onBoardPointer={handleBoardPointer}
            onGem={setLiveGems}
            onLayout={setLayout}
            onRunEnd={handleRunEnd}
          />

          <GameHud gemsCollected={liveGems} hintOpen={hintOpen} level={level} piecesUsed={placements.length} onToggleHint={() => setHintOpen((open) => !open)} />

          {hintOpen && level.hint && <HintBubble text={level.hint} onClose={() => setHintOpen(false)} />}

          {tutorialMessage && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center" data-testid="tutorial-message" role="status">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-2 text-center text-sm font-bold text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100">
                {tutorialMessage}
              </div>
            </div>
          )}

          {failed && <RunFailedToast kind={failed.kind} status={failed.status} />}

          {actionBar && selected && (
            <PieceActionBar
              canFlip={canFlip(selected.pieceId)}
              canRotate={canRotate(selected.pieceId)}
              containerHeight={layout?.height ?? 0}
              containerWidth={layout?.width ?? 0}
              flipFits={actionBar.flipFits}
              flipped={selected.flipped}
              pieceBottom={actionBar.pieceBottom}
              pieceId={selected.pieceId}
              pieceTop={actionBar.pieceTop}
              rotateFits={actionBar.rotateFits}
              variant={selected.variant}
              x={actionBar.x}
              onFlip={() => replaceSelected(flipPlacement)}
              onRemove={removeSelected}
              onRotate={() => replaceSelected(rotatePlacement)}
            />
          )}

          {phase === 'won' && lastWin && (
            <LevelCompleteOverlay
              isFinalLevel={level.id >= LEVELS.length}
              summary={lastWin}
              onLevels={goToSelect}
              onNext={() => startLevel(level.id + 1)}
              onReplay={handleReplay}
            />
          )}
        </section>

        <PieceTray
          armed={armed?.pieceId ?? null}
          className="md:order-1"
          disabled={!editing}
          level={level}
          remaining={remaining}
          shakePiece={trayShake}
          trayRef={trayRef}
          onArm={handleArm}
          onPiecePointerDown={handleTrayPointerDown}
        />

        {trayDragIcon && !hover && createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg"
            data-testid="tray-drag-icon"
            style={{ left: trayDragIcon.x, top: trayDragIcon.y }}
          >
            <PieceIcon className="size-12" pieceId={trayDragIcon.pieceId} />
          </div>,
          document.body,
        )}

        <div className="pointer-events-none absolute inset-0 z-30">
          <TapHint position={tutorialStep ? tutorialHint : null} />
        </div>

        <GameBottomToolbar>
          <BottomControlButton disabled={false} icon={<Grid3x3 />} label="Level select" variant="ghost" onClick={goToSelect} />
          <BottomControlButton
            confirmation={{ title: 'Clear the board?', description: 'Every piece you placed goes back in the tray.', actionLabel: 'Clear' }}
            disabled={!editing || placements.length === 0}
            icon={<Eraser />}
            label="Clear board"
            variant="ghost"
            onClick={handleClear}
          />
          <div ref={goButtonRef}>
            <BottomControlButton
              accentClassName={phase === 'running'
                ? 'border-rose-600 bg-rose-500 text-white hover:bg-rose-500 dark:border-rose-500 dark:bg-rose-500 dark:text-white sm:size-16 size-14'
                : 'border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-white sm:size-16 size-14'}
              disabled={phase === 'won'}
              icon={phase === 'running' ? <Square className="fill-current" /> : <Play className="fill-current" />}
              label={phase === 'running' ? 'Stop' : 'Go'}
              onClick={handleGo}
            />
          </div>
          <FullscreenBottomControlButton />
        </GameBottomToolbar>
      </div>
    </PortraitGameShell>
  )
}
