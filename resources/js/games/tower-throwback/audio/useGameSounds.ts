import { useCallback, useEffect, useRef, useState } from 'react'

import { type EngineEvent, type HudSnapshot } from '../gameTypes'
import { getAudioLevel, isAudioMuted, setAudioLevel, setAudioMuted } from './audioEngine'
import {
  cashTick,
  demolishCrunch,
  doorHiss,
  elevatorDing,
  explosionBoom,
  loanChime,
  placementRejectedBuzz,
  placeThunk,
  setCrowdMurmurIntensity,
  starFanfare,
  startCrowdMurmur,
  startNightCrickets,
  stopCrowdMurmur,
  stopNightCrickets,
  towerBell,
  vipFanfare,
  warningBlip,
} from './sfx'

/** Crowd murmur saturates (intensity 1.0) at this many active people. */
const CROWD_SATURATION_PEOPLE = 500

/** Per-recipe throttles, in ms between allowed plays. */
const DING_THROTTLE_MS = 250 // ≤ 4/s
const CASH_THROTTLE_MS = 1000 / 6 // ≤ 6/s
const WARNING_THROTTLE_MS = 1000 // ≤ 1/s

export const AUDIO_IGNORED_EVENT_TYPES = new Set<EngineEvent['type']>([
  'upgraded',
  'milestone',
  'vipResult',
  'vipMovedOut',
  'loanRepaid',
  'settlement',
  'unitLeased',
  'incidentResolved',
  'tenantRequest',
  'requestFulfilled',
  'requestExpired',
])

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export interface GameSounds {
  playEvents(events: EngineEvent[]): void
  muted: boolean
  toggleMute(): void
  /** Master volume in [0,1]; preserved across mute/unmute. */
  level: number
  setLevel(level: number): void
}

/**
 * Maps engine events to procedural one-shots and diffs the HUD snapshot to
 * drive the continuous beds (crowd murmur, night crickets). Every call no-ops
 * cleanly when muted or when WebAudio is unavailable (jsdom / SSR).
 */
export function useGameSounds(snapshot: HudSnapshot | null): GameSounds {
  const [muted, setMuted] = useState<boolean>(() => isAudioMuted())
  const [levelState, setLevelState] = useState<number>(() => getAudioLevel())

  const lastDingRef = useRef(Number.NEGATIVE_INFINITY)
  const lastCashRef = useRef(Number.NEGATIVE_INFINITY)
  const lastWarningRef = useRef(Number.NEGATIVE_INFINITY)

  const playEvents = useCallback((events: EngineEvent[]): void => {
    for (const event of events) {
      switch (event.type) {
        case 'placed':
          placeThunk()
          break
        case 'placementRejected':
          placementRejectedBuzz()
          break
        case 'demolished':
          demolishCrunch()
          break
        case 'upgraded':
          break
        case 'elevatorDing': {
          const at = now()
          if (at - lastDingRef.current >= DING_THROTTLE_MS) {
            lastDingRef.current = at
            elevatorDing()
            doorHiss()
          }
          break
        }
        case 'cash': {
          const at = now()
          if (at - lastCashRef.current >= CASH_THROTTLE_MS) {
            lastCashRef.current = at
            cashTick()
          }
          break
        }
        case 'starUp':
          starFanfare()
          break
        case 'explosion':
          explosionBoom()
          break
        case 'vipArrived':
        case 'vipMovedIn':
          vipFanfare()
          break
        case 'vipResult':
        case 'vipMovedOut':
          break
        case 'towerAchieved':
          towerBell()
          break
        case 'milestone':
          break
        case 'starLost':
        case 'incidentStarted':
        case 'unitVacated': {
          const at = now()
          if (at - lastWarningRef.current >= WARNING_THROTTLE_MS) {
            lastWarningRef.current = at
            warningBlip()
          }
          break
        }
        case 'loanTaken':
        case 'loanPrompt':
          loanChime()
          break
        case 'loanRepaid':
        case 'settlement':
        case 'unitLeased':
        case 'incidentResolved':
        case 'tenantRequest':
        case 'requestFulfilled':
        case 'requestExpired':
          break
        default: {
          const exhaustive: never = event
          return exhaustive
        }
      }
    }
  }, [])

  const toggleMute = useCallback((): void => {
    setMuted((previous) => {
      const next = !previous
      setAudioMuted(next)
      return next
    })
  }, [])

  const setLevel = useCallback((next: number): void => {
    setAudioLevel(next)
    setLevelState(getAudioLevel())
  }, [])

  // ── Snapshot-diff-driven beds ──────────────────────────────────────────────
  const previousPeopleRef = useRef<number | null>(null)
  const previousNightRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!snapshot) {
      return
    }

    const people = snapshot.activePeople
    const previousPeople = previousPeopleRef.current
    previousPeopleRef.current = people

    if (people > 0 && (previousPeople === null || previousPeople <= 0)) {
      startCrowdMurmur()
    } else if (people <= 0 && previousPeople !== null && previousPeople > 0) {
      stopCrowdMurmur()
    }
    setCrowdMurmurIntensity(Math.min(1, Math.max(0, people / CROWD_SATURATION_PEOPLE)))

    const isNight = snapshot.phase === 'night'
    const wasNight = previousNightRef.current
    previousNightRef.current = isNight
    if (isNight && wasNight !== true) {
      startNightCrickets()
    } else if (!isNight && wasNight === true) {
      stopNightCrickets()
    }
  }, [snapshot])

  useEffect(() => {
    return () => {
      stopCrowdMurmur()
      stopNightCrickets()
    }
  }, [])

  return { playEvents, muted, toggleMute, level: levelState, setLevel }
}
