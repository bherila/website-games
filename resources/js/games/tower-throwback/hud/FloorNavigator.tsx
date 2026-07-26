import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement } from 'react'

import { floorLabel } from '../floorLabels'
import type { EngineState } from '../gameTypes'
import { FLOOR_MAX, FLOOR_MIN } from '../gameTypes'
import type { CameraViewport } from '../scene/camera'

export interface FloorRange {
  maxFloor: number
  minFloor: number
}

interface FloorNavigatorProps {
  incidents?: IncidentFloorMarker[]
  occupied: FloorRange
  viewport: CameraViewport
  onGoToFloor: (floor: number) => void
  /** The active map's playable range; defaults to the whole grid. */
  floorRange?: NavigatorRange
  className?: string
}

export interface IncidentFloorMarker {
  floor: number
  kind: 'bomb' | 'fire'
}

/**
 * The strip spans the MAP's playable range, not the grid's storage range. The
 * grid is allocated across every map's extremes at once, so using it would give
 * a city tower a navigator covering 20 basement floors it can never build.
 */
export interface NavigatorRange {
  min: number
  max: number
}

const DEFAULT_RANGE: NavigatorRange = { min: FLOOR_MIN, max: FLOOR_MAX }

function clampFloor(floor: number, range: NavigatorRange = DEFAULT_RANGE): number {
  return Math.min(range.max, Math.max(range.min, floor))
}

export function floorAtStripPosition(offsetY: number, height: number, range: NavigatorRange = DEFAULT_RANGE): number {
  const ratio = Math.min(1, Math.max(0, offsetY / Math.max(1, height)))
  return Math.round(range.max - ratio * (range.max - range.min))
}

export function floorStripPercent(floor: number, range: NavigatorRange = DEFAULT_RANGE): number {
  return ((range.max - clampFloor(floor, range)) / (range.max - range.min)) * 100
}

export function floorRangeForState(state: Pick<EngineState, 'shafts' | 'units'>): FloorRange {
  let minFloor = Infinity
  let maxFloor = -Infinity

  for (const unit of state.units) {
    minFloor = Math.min(minFloor, unit.floor)
    maxFloor = Math.max(maxFloor, unit.floor + unit.storeys - 1)
  }
  for (const shaft of state.shafts) {
    minFloor = Math.min(minFloor, shaft.bottomFloor)
    maxFloor = Math.max(maxFloor, shaft.topFloor)
  }

  return minFloor === Infinity ? { minFloor: 0, maxFloor: 0 } : { minFloor, maxFloor }
}

function rangeStyle(range: FloorRange, minimumHeightPercent: number, floorRange: NavigatorRange): CSSProperties {
  const top = floorStripPercent(range.maxFloor, floorRange)
  const bottom = floorStripPercent(range.minFloor, floorRange)
  return {
    top: `${top}%`,
    height: `${Math.max(minimumHeightPercent, bottom - top)}%`,
  }
}

export function FloorNavigator({ className = '', floorRange = DEFAULT_RANGE, incidents = [], occupied, onGoToFloor, viewport }: FloorNavigatorProps): ReactElement {
  const currentFloor = clampFloor(Math.round(viewport.centerFloor), floorRange)

  const handleStripClick = (event: MouseEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    onGoToFloor(floorAtStripPosition(event.clientY - rect.top, rect.height, floorRange))
  }

  const handleStripKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let nextFloor: number | null = null
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        nextFloor = currentFloor + 1
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        nextFloor = currentFloor - 1
        break
      case 'PageUp':
        nextFloor = currentFloor + 10
        break
      case 'PageDown':
        nextFloor = currentFloor - 10
        break
      case 'Home':
        nextFloor = floorRange.max
        break
      case 'End':
        nextFloor = floorRange.min
        break
    }
    if (nextFloor !== null) {
      event.preventDefault()
      onGoToFloor(clampFloor(nextFloor, floorRange))
    }
  }

  return (
    <div className={`flex w-12 flex-col items-center gap-1 rounded-lg border border-white/10 bg-slate-950/80 p-1.5 text-white shadow-lg backdrop-blur-sm ${className}`}>
      <output className="text-[11px] font-black tabular-nums" aria-label="Current camera floor">
        {floorLabel(currentFloor)}
      </output>
      <span className="text-[9px] font-bold text-white/45" aria-hidden="true">{floorRange.max}</span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Tower floor navigator"
        aria-valuemin={floorRange.min}
        aria-valuemax={floorRange.max}
        aria-valuenow={currentFloor}
        aria-valuetext={floorLabel(currentFloor)}
        className="relative h-56 w-7 overflow-hidden rounded bg-white/10 ring-1 ring-inset ring-white/15 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        title="Jump to floor"
        onClick={handleStripClick}
        onKeyDown={handleStripKeyDown}
      >
        <span
          className="absolute inset-x-1 rounded-sm bg-emerald-400/30"
          data-testid="occupied-floor-range"
          style={rangeStyle(occupied, 1.5, floorRange)}
        />
        <span
          className="absolute inset-x-0 rounded-sm border border-sky-200 bg-sky-300/20 shadow-[0_0_0_1px_rgba(15,23,42,0.75)]"
          data-testid="camera-floor-range"
          style={rangeStyle({ minFloor: viewport.minFloor, maxFloor: viewport.maxFloor }, 2, floorRange)}
        />
        {incidents.map((incident) => (
          <span
            key={`${incident.kind}-${incident.floor}`}
            data-testid={`incident-floor-marker-${incident.kind}-${incident.floor}`}
            className={`absolute inset-x-0 h-1.5 -translate-y-1/2 rounded-full ring-1 ring-slate-950 ${
              incident.kind === 'bomb' ? 'bg-red-400' : 'bg-orange-400'
            }`}
            style={{ top: `${floorStripPercent(incident.floor, floorRange)}%` }}
            title={`${incident.kind === 'bomb' ? 'Bomb threat' : 'Fire'} on ${floorLabel(incident.floor)}`}
          />
        ))}
        <span className="absolute inset-x-0 top-1/2 h-px bg-white/20" aria-hidden="true" />
      </div>
      <span className="text-[9px] font-bold text-white/45" aria-hidden="true">{floorLabel(floorRange.min)}</span>
    </div>
  )
}
