import { type PointerEvent as ReactPointerEvent, type ReactElement, useEffect, useRef, useState } from 'react'

import { canvasSizeForContainer } from '../_shared/three/viewport'
import { worldToCell } from './board/grid'
import { type BoardLayout, screenToWorld } from './board/layout'
import type { Cell, LevelDef, PiecePlacement, PlacedPiece } from './levels/levelTypes'
import type { RunResult } from './physics/runWorld'
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
  /** The last failed run's paths, one per marble. */
  ghostPaths: readonly (readonly Vec2[])[] | null
  /** A new number starts a run with the current placements; null resets the marbles. */
  runToken: number | null
  onReady: (ready: boolean) => void
  onMenu: () => void
  onRunEnd: (result: RunResult) => void
  /** Live gem count during a run. */
  onGem?: (collected: number) => void
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
  const { level, placements, ghost, selected, editing, freeCells, tutorialCell, ghostPaths, runToken } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const readyRef = useRef(false)
  const failRef = useRef<() => void>(() => {})
  const controllerRef = useRef<MarbleWorksSceneController | null>(null)
  const layoutRef = useRef<BoardLayout | null>(null)
  const pressedRef = useRef(false)
  const latestRef = useRef(props)
  useEffect(() => { latestRef.current = props })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let active = true
    let controller: MarbleWorksSceneController | null = null
    let observer: ResizeObserver | null = null
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-label', 'Marble run board')
    canvas.dataset.testid = 'marble-works-canvas'
    canvas.className = 'block h-full w-full'
    container.prepend(canvas)
    const cleanup = (): void => {
      readyRef.current = false
      pressedRef.current = false
      layoutRef.current = null
      observer?.disconnect()
      window.removeEventListener('resize', applySize)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      controllerRef.current = null
      try { controller?.dispose() } catch { /* Canvas and observers must still be released. */ } finally { canvas.remove() }
    }
    const fail = (): void => {
      if (!active) return
      active = false
      try { cleanup() } finally {
        setFailed(true)
        latestRef.current.onReady(false)
      }
    }
    failRef.current = fail
    const applySize = (): void => {
      if (!active || !controller) return
      try {
        const size = canvasSizeForContainer(container.clientWidth, container.clientHeight)
        const layout = controller.resize(size.width, size.height)
        layoutRef.current = layout
        latestRef.current.onLayout(layout)
      } catch { fail() }
    }
    const onContextLost = (event: Event): void => { event.preventDefault(); fail() }
    setFailed(false)
    latestRef.current.onReady(false)
    canvas.addEventListener('webglcontextlost', onContextLost)
    try {
      controller = new MarbleWorksSceneController(canvas, level, { reducedMotion: prefersReducedMotion(), onError: fail })
      if (!active) {
        cleanup()
        return () => { cleanup() }
      }
      controllerRef.current = controller
      applySize()
      if (active) {
        const current = latestRef.current
        controller.setPlacements(current.placements)
        controller.setGhost(current.ghost)
        controller.setSelection(current.selected)
        controller.setBuildOverlay(current.editing, current.freeCells, current.tutorialCell)
        controller.setGhostPaths(current.ghostPaths)
        controller.renderFirstFrame()
        if (!active) return () => { cleanup() }
        readyRef.current = true
        current.onReady(true)
        observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applySize)
        observer?.observe(container)
        window.addEventListener('resize', applySize)
      }
    } catch { fail() }
    return () => {
      active = false
      cleanup()
    }
  }, [level, attempt])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !readyRef.current) return
    try {
      controller.setPlacements(placements)
    } catch { failRef.current() }
  }, [placements])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !readyRef.current) return
    try {
      controller.setGhost(ghost)
    } catch { failRef.current() }
  }, [ghost])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !readyRef.current) return
    try {
      controller.setSelection(selected)
    } catch { failRef.current() }
  }, [selected])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !readyRef.current) return
    try {
      controller.setBuildOverlay(editing, freeCells, tutorialCell)
    } catch { failRef.current() }
  }, [editing, freeCells, tutorialCell])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !readyRef.current) return
    try {
      controller.setGhostPaths(ghostPaths)
    } catch { failRef.current() }
  }, [ghostPaths])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !readyRef.current) return
    try {
      if (runToken === null) controller.resetRun()
      else controller.startRun(latestRef.current.placements, {
        onEnd: (result) => { if (controllerRef.current === controller && readyRef.current) latestRef.current.onRunEnd(result) },
        onGem: (collected) => { if (controllerRef.current === controller && readyRef.current) latestRef.current.onGem?.(collected) },
      })
    } catch { failRef.current() }
  }, [runToken])

  const emit = (type: BoardPointerEvent['type'], event: ReactPointerEvent<HTMLDivElement>): void => {
    const container = containerRef.current
    const layout = layoutRef.current
    if (!container || !layout || !readyRef.current) {
      return
    }
    const rect = container.getBoundingClientRect()
    const [x, y] = screenToWorld(level, layout, event.clientX - rect.left, event.clientY - rect.top)
    latestRef.current.onBoardPointer({
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
      {failed && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-sky-50 p-4 dark:bg-slate-950" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
          <div className="max-w-sm rounded-2xl bg-white p-5 text-center text-slate-900 shadow-lg dark:bg-slate-800 dark:text-white" role="alert">
            <p className="font-bold">The board graphics could not start.</p>
            <p className="my-3 text-sm">Your pieces are kept. Try the graphics again to return to building.</p>
            <button className="m-1 rounded-lg bg-sky-700 px-4 py-3 font-bold text-white" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry graphics</button>
            <button className="m-1 rounded-lg border px-4 py-3 font-bold" type="button" onClick={props.onMenu}>Level select</button>
          </div>
        </div>
      )}
    </div>
  )
}
