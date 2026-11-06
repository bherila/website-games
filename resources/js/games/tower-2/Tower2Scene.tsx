/**
 * The canvas host: mount-once render loop, props mirrored to refs, pointer
 * input translated into tiles on the active floor. Edits go back to the game
 * through onApply, so history and saving live in one place.
 */
import { type ReactElement, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { attachContextLossHandlers } from '../_shared/three/contextLoss'
import { normalizeWheelPx, type PinchSnapshot, pinchSnapshot, pinchUpdate, wheelPanDelta, wheelZoomFactor } from '../_shared/three/touchGestures'
import type { BuildingAnalysis } from './engine/analysis'
import { type Building, type EditResult, type Facing, floorLabel } from './engine/building'
import type { PlateTile } from './engine/floorPlate'
import { Crowd } from './engine/people'
import { isRectTool, toolAction, type ToolId, TOOLS } from './interaction'
import { type FrameClock, pixelRatioFor, shouldRender } from './scene/framePacing'
import { followFloor, frameRect, type IsoView, panView, projectionFor, rotateView, type Viewport, zoomViewAt } from './scene/isoCamera'
import { type OverlayKind, type Preview, Tower2Renderer } from './scene/Tower2Renderer'
import type { Guide } from './tutorial'

export interface World {
  building: Building
  analysis: BuildingAnalysis
  /** Changes whenever the building or its identity changes (edits, undo, load). */
  stamp: number
}

export type Selection = { kind: 'room', id: number } | { kind: 'core', id: string } | null

export interface CoreStats {
  wait: number | null
  waiting: number
}

export interface SceneControls {
  rotate(turns: number): void
  zoom(factor: number): void
  frame(): void
}

export interface Tower2SceneProps {
  world: World
  activeFloor: number
  tool: ToolId
  /** The wall new rooms put their door in. */
  facing: Facing
  /** Where the tutorial's current step goes, outlined on the plan. */
  guide?: Guide | null
  overlay: OverlayKind
  exterior: boolean
  /** A game dialog is open; neither pointer nor keyboard may edit the plan. */
  blocked?: boolean
  selection: Selection
  /** On a phone, one finger draws with the tool or pans the view. */
  touchMode: 'draw' | 'move'
  onApply: (commit: (building: Building) => EditResult) => EditResult
  onSelect: (selection: Selection) => void
  onHint: (hint: string | null) => void
  onVisitors?: (count: number) => void
  /** Cars the core tool places. */
  cars?: number
  /** Each core's recent average wait (seconds, null before anyone boards) and current queue, about twice a second. */
  onCoreStats?: (stats: ReadonlyMap<string, CoreStats>) => void
  controlsRef?: Ref<SceneControls>
}

interface Drag {
  pointerId: number
  anchor: PlateTile
}

declare global {
  interface Window {
    /** Read-only hooks for browser tests; never part of the game's own flow. */
    __tower2?: {
      tileToClient(floor: number, x: number, y: number): { x: number, y: number }
      drawCalls(): number
      visitors(): number
      /** Frames rendered since the scene mounted. */
      frames(): number
    }
  }
}

/** The footprint the camera frames on load: every plate, or the site centre when empty. */
function plateBounds(building: Building): { x: number, y: number, width: number, depth: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const floor of building.builtFloors()) {
    const plate = building.plateMask(floor)
    for (let index = 0; index < plate.length; index++) {
      if (plate[index] !== 1) continue
      const x = index % building.width
      const y = Math.floor(index / building.width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  // An empty site frames its street edge, where the first block goes.
  if (!Number.isFinite(minX)) return { x: 8, y: building.depth - 18, width: 24, depth: 20 }
  return { x: minX - 3, y: minY - 3, width: maxX - minX + 7, depth: maxY - minY + 7 }
}

export function Tower2Scene(props: Tower2SceneProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetRef = useRef<HTMLDivElement>(null)
  const [keyboardFeedback, setKeyboardFeedback] = useState<string | null>(null)
  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  })
  const viewRef = useRef<IsoView | null>(null)
  const viewportRef = useRef<Viewport>({ width: 1, height: 1 })
  const floorRef = useRef(props.activeFloor)
  // Shared with the imperative controls so a button press renders at full rate too.
  const clockRef = useRef<FrameClock>({ lastRenderAt: 0, lastInputAt: 0 })
  const markInput = () => { clockRef.current.lastInputAt = performance.now() }

  useImperativeHandle(props.controlsRef, () => ({
    rotate(turns) {
      markInput()
      if (viewRef.current) viewRef.current = rotateView(viewRef.current, turns, viewportRef.current, propsRef.current.activeFloor)
    },
    zoom(factor) {
      markInput()
      const viewport = viewportRef.current
      if (viewRef.current) viewRef.current = zoomViewAt(viewRef.current, factor, { x: viewport.width / 2, y: viewport.height / 2 }, propsRef.current.activeFloor)
    },
    frame() {
      markInput()
      viewRef.current = frameRect(viewportRef.current, plateBounds(propsRef.current.world.building), 0, viewRef.current?.rotation ?? 0)
    },
  }), [])

  // Keep the active floor where it was on screen when stepping floors.
  useEffect(() => {
    if (viewRef.current && floorRef.current !== props.activeFloor) {
      viewRef.current = followFloor(viewRef.current, floorRef.current, props.activeFloor, viewportRef.current)
    }
    floorRef.current = props.activeFloor
  }, [props.activeFloor])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return undefined
    const world = propsRef.current.world
    const renderer = new Tower2Renderer(canvas, { width: world.building.width, depth: world.building.depth })
    const crowd = new Crowd(7)
    let crowdBuilding = world.building
    let hover: PlateTile | null = null
    let drag: Drag | null = null
    const bounds = plateBounds(world.building)
    let cursor: PlateTile = {
      x: Math.min(world.building.width - 1, Math.max(0, Math.floor(bounds.x + bounds.width / 2))),
      y: Math.min(world.building.depth - 1, Math.max(0, Math.floor(bounds.y + bounds.depth / 2))),
    }
    let keyboard = false
    let anchor: PlateTile | null = null
    let context = ''
    let editStamp = world.stamp
    let lastFeedback = ''
    let outcome = ''
    let pan: { pointerId: number, x: number, y: number } | null = null
    const touches = new Map<number, { x: number, y: number }>()
    let pinch: PinchSnapshot | null = null
    let lastHint: string | null = null
    let lastVisitors = -1
    let lastStatsAt = 0
    let running = true
    let rafId = 0
    let lastTime = performance.now()

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const viewport = { width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) }
      viewportRef.current = viewport
      renderer.setSize(viewport, pixelRatioFor(window.devicePixelRatio))
      markInput()
      if (!viewRef.current) viewRef.current = followFloor(frameRect(viewport, plateBounds(propsRef.current.world.building), 0), 0, propsRef.current.activeFloor, viewport)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    const local = (event: { clientX: number, clientY: number }) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const tileAt = (event: { clientX: number, clientY: number }): PlateTile | null => {
      if (!viewRef.current) return null
      const { x, y } = projectionFor(viewRef.current).screenToTile(local(event), propsRef.current.activeFloor)
      return { x, y }
    }
    const action = () => {
      const { world, tool, activeFloor, facing, cars } = propsRef.current
      return toolAction(world.building, tool, activeFloor, keyboard ? cursor : hover, keyboard ? anchor : drag?.anchor ?? null, facing, cars)
    }
    const syncContext = () => {
      const current = propsRef.current
      const next = `${current.activeFloor}:${current.tool}:${current.facing}:${current.cars}:${current.exterior}:${current.blocked}`
      if (context !== next) {
        anchor = null
        drag = null
        outcome = ''
        context = next
      }
      if (editStamp !== current.world.stamp) {
        anchor = null
        drag = null
        cursor = {
          x: Math.min(current.world.building.width - 1, cursor.x),
          y: Math.min(current.world.building.depth - 1, cursor.y),
        }
        editStamp = current.world.stamp
      }
    }
    const feedback = () => {
      if (!keyboard) return
      const { activeFloor, tool, facing, exterior, blocked } = propsRef.current
      const label = TOOLS.find((candidate) => candidate.id === tool)!.label
      const act = action()
      const instruction = anchor
        ? `Anchor column ${anchor.x + 1}, row ${anchor.y + 1}. Enter or Space commits.`
        : isRectTool(tool) ? 'Enter or Space sets the rectangle anchor.' : 'Enter or Space places or selects.'
      const detail = blocked ? 'Close the dialog to build.' : exterior ? 'Return to plan view (X) to build.'
        : `${instruction} ${outcome || act.hint || (act.preview ? 'Ready.' : '')}`
      const text = `${floorLabel(activeFloor)} · column ${cursor.x + 1}, row ${cursor.y + 1} · ${label}${act.preview?.kind === 'room' ? `, door ${facing}` : ''}. ${detail}`
      if (text !== lastFeedback) {
        lastFeedback = text
        setKeyboardFeedback(text)
      }
    }
    const keepCursorVisible = () => {
      if (!viewRef.current) return
      const point = projectionFor(viewRef.current).tileToScreen({ x: cursor.x + 0.5, y: cursor.y + 0.5, floor: propsRef.current.activeFloor })
      const { width, height } = viewportRef.current
      const x = Math.min(width * 0.8, Math.max(width * 0.2, point.x))
      const y = Math.min(height * 0.7, Math.max(height * 0.3, point.y))
      viewRef.current = panView(viewRef.current, x - point.x, y - point.y)
    }
    const onFocus = () => {
      if (drag || pan) return
      keyboard = true
      syncContext()
      keepCursorVisible()
      feedback()
      markInput()
    }
    const onBlur = () => {
      keyboard = false
      anchor = null
      outcome = ''
      setKeyboardFeedback(null)
      if (targetRef.current) targetRef.current.hidden = true
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(event.key)) return
      if (propsRef.current.blocked) return
      event.preventDefault()
      syncContext()
      keyboard = true
      hover = null
      drag = null
      markInput()
      outcome = ''
      const { world, tool, activeFloor, onSelect, onApply, exterior } = propsRef.current
      if (event.key.startsWith('Arrow')) {
        cursor = {
          x: Math.min(world.building.width - 1, Math.max(0, cursor.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))),
          y: Math.min(world.building.depth - 1, Math.max(0, cursor.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))),
        }
        keepCursorVisible()
      } else if (event.key === 'Escape') {
        anchor = null
        outcome = 'Cancelled.'
      } else if (!event.repeat && !exterior) {
        if (tool === 'select') {
          const room = world.building.roomAt(activeFloor, cursor.x, cursor.y)
          const core = world.building.coreAt(activeFloor, cursor.x, cursor.y)
          onSelect(room ? { kind: 'room', id: room.id } : core ? { kind: 'core', id: core.id } : null)
          outcome = room ? 'Room selected.' : core ? 'Core selected.' : 'Nothing to select here.'
        } else if (isRectTool(tool) && !anchor) anchor = { ...cursor }
        else {
          const { commit } = action()
          if (commit) {
            const result = onApply(commit)
            outcome = result.ok ? 'Built.' : result.reason
          }
          anchor = null
        }
      }
      feedback()
    }
    const setHint = (hint: string | null) => {
      if (hint !== lastHint) {
        lastHint = hint
        propsRef.current.onHint(hint)
      }
    }

    const drawsWith = (event: PointerEvent) => event.pointerType !== 'touch' || propsRef.current.touchMode === 'draw'

    const onPointerDown = (event: PointerEvent) => {
      if (propsRef.current.blocked) return
      syncContext()
      onBlur()
      markInput()
      canvas.setPointerCapture(event.pointerId)
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, local(event))
        if (touches.size === 2) {
          // A second finger turns any draw into a pinch.
          drag = null
          pan = null
          const [a, b] = [...touches.values()]
          pinch = pinchSnapshot(a!, b!)
          return
        }
      }
      const panning = event.button === 1 || event.button === 2 || !drawsWith(event) || (event.button === 0 && event.shiftKey && !isRectTool(propsRef.current.tool))
      if (panning) {
        pan = { pointerId: event.pointerId, ...local(event) }
        return
      }
      if (event.button !== 0) return
      hover = tileAt(event)
      if (hover) drag = { pointerId: event.pointerId, anchor: hover }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (propsRef.current.blocked || keyboard) return
      markInput()
      if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
        touches.set(event.pointerId, local(event))
        if (pinch && touches.size === 2 && viewRef.current) {
          const [a, b] = [...touches.values()]
          const next = pinchSnapshot(a!, b!)
          const update = pinchUpdate(pinch, next)
          viewRef.current = zoomViewAt(panView(viewRef.current, -update.panDxPx, update.panDyPx), 1 / update.zoomFactor, { x: update.focusX, y: update.focusY }, propsRef.current.activeFloor)
          pinch = next
          return
        }
      }
      if (pan && pan.pointerId === event.pointerId && viewRef.current) {
        const point = local(event)
        viewRef.current = panView(viewRef.current, point.x - pan.x, point.y - pan.y)
        pan = { pointerId: event.pointerId, ...point }
        return
      }
      hover = tileAt(event)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      touches.delete(event.pointerId)
      if (touches.size < 2) pinch = null
      if (propsRef.current.blocked) {
        drag = null
        pan = null
        return
      }
      if (pan?.pointerId === event.pointerId) {
        pan = null
        return
      }
      if (!drag || drag.pointerId !== event.pointerId) return
      hover = tileAt(event)
      const { tool, world, activeFloor, onApply, onSelect } = propsRef.current
      if (tool === 'select') {
        const building = world.building
        const moved = building.roomAt(activeFloor, drag.anchor.x, drag.anchor.y)
        const { commit } = action()
        if (moved && commit) {
          // A drag that ends somewhere else moves the room; it stays selected either way.
          onApply(commit)
          onSelect({ kind: 'room', id: moved.id })
        } else {
          const tile = hover ?? drag.anchor
          const room = building.roomAt(activeFloor, tile.x, tile.y)
          const core = building.coreAt(activeFloor, tile.x, tile.y)
          onSelect(room ? { kind: 'room', id: room.id } : core ? { kind: 'core', id: core.id } : null)
        }
      } else {
        const { commit } = action()
        if (commit) onApply(commit)
      }
      drag = null
      if (event.pointerType === 'touch') hover = null
    }

    const onPointerCancel = (event: PointerEvent) => {
      touches.delete(event.pointerId)
      pinch = null
      if (drag?.pointerId === event.pointerId) drag = null
      if (pan?.pointerId === event.pointerId) pan = null
    }

    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && !drag) hover = null
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      markInput()
      if (!viewRef.current) return
      const deltaX = normalizeWheelPx(event.deltaX, event.deltaMode, viewportRef.current.width)
      const deltaY = normalizeWheelPx(event.deltaY, event.deltaMode, viewportRef.current.height)
      if (event.ctrlKey || event.metaKey) {
        viewRef.current = zoomViewAt(viewRef.current, 1 / wheelZoomFactor(deltaY), local(event), propsRef.current.activeFloor)
        return
      }
      const { panDxPx, panDyPx } = wheelPanDelta(deltaX, deltaY)
      viewRef.current = panView(viewRef.current, -panDxPx, panDyPx)
    }

    const onContextMenu = (event: Event) => event.preventDefault()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('focus', onFocus)
    canvas.addEventListener('blur', onBlur)
    canvas.addEventListener('keydown', onKeyDown)
    const detachContextLoss = attachContextLossHandlers(canvas, {
      onLost: () => { running = false },
      onRestored: () => {
        running = true
        lastTime = performance.now()
        rafId = requestAnimationFrame(frame)
      },
    })

    window.__tower2 = {
      tileToClient(floor, x, y) {
        const rect = canvas.getBoundingClientRect()
        const point = projectionFor(viewRef.current!).tileToScreen({ x: x + 0.5, y: y + 0.5, floor })
        return { x: rect.left + point.x, y: rect.top + point.y }
      },
      drawCalls: () => renderer.drawCalls,
      visitors: () => crowd.visitors.length,
      frames: () => renderer.renderer.info.render.frame,
    }

    const frame = (now: number) => {
      if (!running) return
      if (!shouldRender(clockRef.current, now, drag !== null || pan !== null || pinch !== null)) {
        rafId = requestAnimationFrame(frame)
        return
      }
      clockRef.current.lastRenderAt = now
      const seconds = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now
      const current = propsRef.current
      syncContext()
      const { building, analysis, stamp } = current.world
      // Undo or reset swaps the building; visitors from the old one would walk through walls.
      if (building !== crowdBuilding) {
        crowd.clear()
        crowdBuilding = building
      }
      crowd.step(analysis, seconds)
      if (crowd.visitors.length !== lastVisitors) {
        lastVisitors = crowd.visitors.length
        current.onVisitors?.(lastVisitors)
      }
      if (current.onCoreStats && now - lastStatsAt > 500) {
        lastStatsAt = now
        current.onCoreStats(new Map(building.cores().map((core) => [core.id, { wait: crowd.averageWait(core.id), waiting: crowd.waiting(core.id) }])))
      }
      const act = pan || pinch || current.blocked || current.exterior ? null : action()
      setHint(act?.hint ?? null)
      feedback()
      if (targetRef.current) {
        targetRef.current.hidden = !keyboard || !!current.blocked || current.exterior
        if (keyboard && viewRef.current) {
          const point = projectionFor(viewRef.current).tileToScreen({ x: cursor.x + 0.5, y: cursor.y + 0.5, floor: current.activeFloor })
          targetRef.current.style.left = `${point.x}px`
          targetRef.current.style.top = `${point.y}px`
        }
      }
      const preview: Preview | null = act?.preview ?? null
      if (viewRef.current) renderer.setView(viewRef.current, viewportRef.current)
      renderer.sync({
        building,
        analysis,
        stamp,
        activeFloor: current.activeFloor,
        exterior: current.exterior,
        overlay: current.overlay,
        selectedRoomId: current.selection?.kind === 'room' ? current.selection.id : null,
        selectedCoreId: current.selection?.kind === 'core' ? current.selection.id : null,
        preview,
        guide: current.guide && current.guide.floor === current.activeFloor && !current.exterior ? current.guide : null,
        visitors: crowd.visitors,
        cars: crowd.cars(),
      })
      renderer.render()
      rafId = requestAnimationFrame(frame)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        cancelAnimationFrame(rafId)
      } else if (running) {
        lastTime = performance.now()
        rafId = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
      detachContextLoss()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('focus', onFocus)
      canvas.removeEventListener('blur', onBlur)
      canvas.removeEventListener('keydown', onKeyDown)
      delete window.__tower2
      renderer.dispose()
    }
  }, [])

  return (
    <div ref={hostRef} className="absolute inset-0">
      <canvas ref={canvasRef} role="application" tabIndex={props.blocked ? -1 : 0} className="block h-full w-full touch-none select-none focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-cyan-300" aria-label="Building plan" aria-describedby="tower2-keyboard-help" aria-disabled={props.blocked} />
      <div ref={targetRef} hidden aria-hidden="true" data-testid="tower2-keyboard-target" className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-cyan-200 bg-cyan-400/25 shadow-[0_0_0_2px_#0f172a]" />
      <div className={`pointer-events-none absolute bottom-24 left-3 max-w-xs rounded-xl bg-slate-950/90 p-3 text-xs text-white md:bottom-20 ${keyboardFeedback ? '' : 'sr-only'}`}>
        <p id="tower2-keyboard-help" className="text-white/85">Keyboard: arrows move columns and rows. Enter or Space anchors and completes a rectangle, places a room or core, or selects. Escape cancels. Page Up/Down changes floor. Tab reaches the tools.</p>
        <p role="status" aria-live="polite" aria-atomic="true" data-testid="tower2-keyboard-status" className="mt-2 font-semibold text-cyan-200">{keyboardFeedback}</p>
      </div>
    </div>
  )
}
