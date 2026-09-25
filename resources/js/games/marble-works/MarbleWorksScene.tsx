import { type PointerEvent as ReactPointerEvent, type ReactElement, useEffect, useRef } from 'react'

import { canvasSizeForContainer } from '../_shared/three/viewport'
import { worldToCell } from './board/grid'
import { type BoardLayout, screenToWorld } from './board/layout'
import type { Cell, LevelDef, PiecePlacement, PlacedPiece } from './levels/levelTypes'
import type { RunStatus } from './physics/runOutcome'
import type { Vec2 } from './pieces/pieceCatalog'
import { MarbleWorksSceneController } from './scene/sceneController'

export interface BoardPointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel' | 'leave'
  /** Cell under the pointer, or null when off the board. */
  cell: Cell | null
  clientX: number
  clientY: number
  pointerType: string
  /** True while a button / finger is held. */
  pressed: boolean
}

export interface MarbleWorksSceneProps {
  level: LevelDef
  placements: readonly PlacedPiece[]
  ghost: { placement: PiecePlacement; ok: boolean } | null
  selected: PiecePlacement | null
  editing: boolean
  freeCells: readonly Cell[]
  tutorialCell: Cell | null
  ghostPath: readonly Vec2[] | null
  /** A new number starts a run with the current placements; null resets the marble. */
  runToken: number | null
  onRunEnd: (status: Exclude<RunStatus, 'running'>, path: Vec2[]) => void
  onLayout: (layout: BoardLayout) => void
  onBoardPointer: (event: BoardPointerEvent) => void
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * React shell around the imperative three.js controller. Mount with `key={level.id}`;
 * each level gets a fresh renderer and physics world.
 */
export function MarbleWorksScene(props: MarbleWorksSceneProps): ReactElement {
  const { level, placements, ghost, selected, editing, freeCells, tutorialCell, ghostPath, runToken } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controllerRef = useRef<MarbleWorksSceneController | null>(null)
  const layoutRef = useRef<BoardLayout | null>(null)
  const pressedRef = useRef(false)
  const placementsRef = useRef(placements)
  const callbacksRef = useRef({ onRunEnd: props.onRunEnd, onLayout: props.onLayout, onBoardPointer: props.onBoardPointer })

  useEffect(() => {
    placementsRef.current = placements
    callbacksRef.current = { onRunEnd: props.onRunEnd, onLayout: props.onLayout, onBoardPointer: props.onBoardPointer }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) {
      return undefined
    }

    const controller = new MarbleWorksSceneController(canvas, level, { reducedMotion: prefersReducedMotion() })
    controllerRef.current = controller
    const applySize = (): void => {
      const size = canvasSizeForContainer(container.clientWidth, container.clientHeight)
      const layout = controller.resize(size.width, size.height)
      layoutRef.current = layout
      callbacksRef.current.onLayout(layout)
    }
    applySize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applySize)
    observer?.observe(container)
    window.addEventListener('resize', applySize)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', applySize)
      controller.dispose()
      controllerRef.current = null
    }
  }, [level])

  useEffect(() => {
    controllerRef.current?.setPlacements(placements)
  }, [placements])

  useEffect(() => {
    controllerRef.current?.setGhost(ghost)
  }, [ghost])

  useEffect(() => {
    controllerRef.current?.setSelection(selected)
  }, [selected])

  useEffect(() => {
    controllerRef.current?.setBuildOverlay(editing, freeCells, tutorialCell)
  }, [editing, freeCells, tutorialCell])

  useEffect(() => {
    controllerRef.current?.setGhostPath(ghostPath)
  }, [ghostPath])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) {
      return
    }
    if (runToken === null) {
      controller.resetRun()
      return
    }
    controller.startRun(placementsRef.current, {
      onEnd: (status, path) => callbacksRef.current.onRunEnd(status, path),
    })
  }, [runToken])

  const emit = (type: BoardPointerEvent['type'], event: ReactPointerEvent<HTMLDivElement>): void => {
    const container = containerRef.current
    const layout = layoutRef.current
    if (!container || !layout) {
      return
    }
    const rect = container.getBoundingClientRect()
    const [x, y] = screenToWorld(level, layout, event.clientX - rect.left, event.clientY - rect.top)
    callbacksRef.current.onBoardPointer({
      type,
      cell: worldToCell(level, x, y),
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
      pressed: pressedRef.current,
    })
  }

  return (
    <div
      className="absolute inset-0 touch-none select-none"
      data-testid="marble-works-board"
      ref={containerRef}
      onPointerCancel={(event) => {
        pressedRef.current = false
        emit('cancel', event)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }
        pressedRef.current = true
        event.currentTarget.setPointerCapture?.(event.pointerId)
        emit('down', event)
      }}
      onPointerLeave={(event) => {
        if (!pressedRef.current) {
          emit('leave', event)
        }
      }}
      onPointerMove={(event) => emit('move', event)}
      onPointerUp={(event) => {
        pressedRef.current = false
        emit('up', event)
      }}
    >
      <canvas aria-label="Marble run board" className="block h-full w-full" data-testid="marble-works-canvas" ref={canvasRef} />
    </div>
  )
}
