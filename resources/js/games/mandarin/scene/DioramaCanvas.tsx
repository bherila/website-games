/**
 * React host for the diorama. Renders the poster fallback immediately (first
 * usable paint never waits on WebGL), then lazily imports Three.js and swaps
 * in the canvas. Any failure — no WebGL, renderer creation error, context
 * loss, or the learner choosing 2D — leaves the poster in place. The canvas is
 * decorative: every word and control lives in the DOM around it.
 */
import { type ReactElement, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { SlotImage } from '../assets/SlotImage'
import type { SceneSetting } from '../domain/courseSchema'
import type { DioramaController } from './dioramaRenderer'
import type { DioramaBeat } from './sceneConfigs'
import { probeWebGl } from './webglSupport'

export type DioramaStatus = 'poster' | 'loading' | 'ready' | 'fallback' | 'context-lost'

interface DioramaCanvasProps {
  setting: SceneSetting
  beat: DioramaBeat
  posterSlotId: string
  /** `2d` never touches WebGL. */
  mode: '3d' | '2d'
  reducedMotion: boolean
  className?: string
  onStatus?: (status: DioramaStatus) => void
  /** Test seam: replaces the lazy Three.js import. */
  loadRenderer?: () => Promise<typeof import('./dioramaRenderer')>
}

const defaultLoader = (): Promise<typeof import('./dioramaRenderer')> => import('./dioramaRenderer')

export function DioramaCanvas({ setting, beat, posterSlotId, mode, reducedMotion, className, onStatus, loadRenderer }: DioramaCanvasProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<DioramaController | null>(null)
  const [status, setStatus] = useState<DioramaStatus>(mode === '2d' ? 'poster' : 'loading')
  const onStatusRef = useRef(onStatus)
  const loaderRef = useRef(loadRenderer ?? defaultLoader)
  useEffect(() => {
    onStatusRef.current = onStatus
    loaderRef.current = loadRenderer ?? defaultLoader
  })

  useEffect(() => {
    onStatusRef.current?.(status)
  }, [status])

  // Create / destroy the renderer when the mode changes.
  useEffect(() => {
    if (mode === '2d') {
      setStatus('poster')
      return
    }
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!canvas || !frame) return
    if (!probeWebGl()) {
      setStatus('fallback')
      return
    }
    let cancelled = false
    let controller: DioramaController | null = null
    let observer: ResizeObserver | null = null
    setStatus('loading')
    loaderRef.current().then((module) => {
      if (cancelled) return
      try {
        controller = module.createDioramaRenderer(canvas, {
          reducedMotion,
          onContextLost: () => setStatus('context-lost'),
          onContextRestored: () => setStatus('ready'),
        })
      } catch (error) {
        console.warn('Mandarin diorama: renderer unavailable, using poster fallback.', error)
        setStatus('fallback')
        return
      }
      controllerRef.current = controller
      const size = (): void => {
        const rect = frame.getBoundingClientRect()
        controller?.resize(rect.width, rect.height)
      }
      size()
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(size)
        observer.observe(frame)
      }
      controller.setScene(setting)
      controller.setBeat(beat)
      setStatus('ready')
    }).catch((error: unknown) => {
      if (cancelled) return
      console.warn('Mandarin diorama: could not load renderer, using poster fallback.', error)
      setStatus('fallback')
    })
    return () => {
      cancelled = true
      observer?.disconnect()
      controllerRef.current = null
      controller?.dispose()
    }
    // Scene/beat/motion are pushed through the controller below; only mode recreates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    controllerRef.current?.setScene(setting)
    controllerRef.current?.setBeat(beat)
  }, [setting, status, beat])

  useEffect(() => {
    controllerRef.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion, status])

  const showCanvas = mode === '3d' && status === 'ready'

  return (
    <div
      ref={frameRef}
      className={cn('relative overflow-hidden bg-[#e9eef1]', className)}
      data-testid="diorama"
      data-diorama-status={status}
      data-diorama-setting={setting}
      data-diorama-beat={beat}
    >
      <div
        className={cn('absolute inset-0 transition-opacity duration-500', showCanvas ? 'opacity-0' : 'opacity-100')}
        data-testid="diorama-2d"
        aria-hidden="true"
      >
        <SlotImage slotId={posterSlotId} alt="" loading="eager" />
      </div>
      {mode === '3d' && (
        <canvas
          ref={canvasRef}
          className={cn('absolute inset-0 h-full w-full', showCanvas ? 'opacity-100' : 'opacity-0')}
          data-testid="diorama-canvas"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
