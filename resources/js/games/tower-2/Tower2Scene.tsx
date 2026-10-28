/**
 * The canvas host: mount-once render loop, props mirrored to refs, pointer
 * input translated into tiles on the active floor. Edits go back to the game
 * through onApply, so history and saving live in one place.
 */
import { type ReactElement, type Ref, useEffect, useImperativeHandle, useRef } from 'react'

import { attachContextLossHandlers } from '../_shared/three/contextLoss'
import { normalizeWheelPx, type PinchSnapshot, pinchSnapshot, pinchUpdate, wheelPanDelta, wheelZoomFactor } from '../_shared/three/touchGestures'
import type { BuildingAnalysis } from './engine/analysis'
import type { Building, EditResult } from './engine/building'
import type { PlateTile } from './engine/floorPlate'
import { Crowd } from './engine/people'
import { isRectTool, toolAction,type ToolId } from './interaction'
import { type FrameClock, pixelRatioFor, shouldRender } from './scene/framePacing'
import { followFloor, frameRect, type IsoView, panView, projectionFor, rotateView, type Viewport, zoomViewAt } from './scene/isoCamera'
import { type OverlayKind, type Preview, Tower2Renderer } from './scene/Tower2Renderer'

export interface World {
  building: Building
  analysis: BuildingAnalysis
  /** Changes whenever the building or its identity changes (edits, undo, load). */
  stamp: number
}

export type Selection = { kind: 'room', id: number } | { kind: 'core', id: string } | null

export interface SceneControls {
  rotate(turns: number): void
  zoom(factor: number): void
  frame(): void
}

export interface Tower2SceneProps {
  world: World
  activeFloor: number
  tool: ToolId
  rotated: boolean
  overlay: OverlayKind
  exterior: boolean
  selection: Selection
  /** On a phone, one finger draws with the tool or pans the view. */
  touchMode: 'draw' | 'move'
  onApply: (commit: (building: Building) => EditResult) => void
  onSelect: (selection: Selection) => void
  onHint: (hint: string | null) => void
  onVisitors?: (count: number) => void
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
  for (let floor = 0; floor < building.floorCount; floor++) {
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
  if (!Number.isFinite(minX)) return { x: building.width / 2 - 8, y: building.depth / 2 - 8, width: 16, depth: 16 }
  return { x: minX - 3, y: minY - 3, width: maxX - minX + 7, depth: maxY - minY + 7 }
}

export function Tower2Scene(props: Tower2SceneProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
    let pan: { pointerId: number, x: number, y: number } | null = null
    const touches = new Map<number, { x: number, y: number }>()
    let pinch: PinchSnapshot | null = null
    let lastHint: string | null = null
    let lastVisitors = -1
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
      const { world, tool, activeFloor, rotated } = propsRef.current
      return toolAction(world.building, tool, activeFloor, hover, drag?.anchor ?? null, rotated)
    }
    const setHint = (hint: string | null) => {
      if (hint !== lastHint) {
        lastHint = hint
        propsRef.current.onHint(hint)
      }
    }

    const drawsWith = (event: PointerEvent) => event.pointerType !== 'touch' || propsRef.current.touchMode === 'draw'

    const onPointerDown = (event: PointerEvent) => {
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
      if (pan?.pointerId === event.pointerId) {
        pan = null
        return
      }
      if (!drag || drag.pointerId !== event.pointerId) return
      hover = tileAt(event)
      const { tool, world, activeFloor, onApply, onSelect } = propsRef.current
      if (tool === 'select') {
        const tile = hover ?? drag.anchor
        const building = world.building
        const room = building.roomAt(activeFloor, tile.x, tile.y)
        const core = building.coreAt(activeFloor, tile.x, tile.y)
        onSelect(room ? { kind: 'room', id: room.id } : core ? { kind: 'core', id: core.id } : null)
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
      const act = pan || pinch ? null : action()
      setHint(act?.hint ?? null)
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
        visitors: crowd.visitors,
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
      delete window.__tower2
      renderer.dispose()
    }
  }, [])

  return (
    <div ref={hostRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" aria-label="Building plan. Use the tools to draw floors, corridors, cores and rooms." />
    </div>
  )
}
