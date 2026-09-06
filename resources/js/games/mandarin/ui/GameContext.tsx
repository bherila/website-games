import { createContext, useContext } from 'react'

import type { Bootstrap, PracticeEvent, ProgressProjection, SaveState } from '../contracts/mandarin'
import type { CourseIndex } from '../domain/course'
import type { Course, SceneSetting } from '../domain/courseSchema'
import type { EventContext } from '../domain/events'
import type { PreviewProgress } from '../domain/progress'
import type { MandarinSettings } from '../domain/settings'
import type { DioramaBeat } from '../scene/sceneConfigs'

export type Route =
  | { name: 'home' }
  | { name: 'onboarding' }
  | { name: 'teaching'; nodeId: string }
  | { name: 'lesson'; nodeId: string }
  | { name: 'sceneComplete'; sceneId: string }
  | { name: 'review'; kind: 'scheduled' | 'extra' }
  | { name: 'checkpoint' }
  | { name: 'settings' }

export type Overlay = 'map' | 'glossary' | null

export interface GameApi {
  course: CourseIndex
  bootstrap: Bootstrap<Course>
  projection: ProgressProjection | null
  progress: PreviewProgress
  settings: MandarinSettings
  saveState: SaveState
  route: Route
  overlay: Overlay
  beat: DioramaBeat
  /** Diorama setting for the current route. */
  setting: SceneSetting
  posterSlotId: string
  reducedMotion: boolean
  eventContext: EventContext
  navigate(route: Route): void
  setOverlay(overlay: Overlay): void
  setBeat(beat: DioramaBeat): void
  updateProgress(update: (progress: PreviewProgress) => PreviewProgress): void
  updateSettings(patch: Partial<MandarinSettings>): void
  resetPreview(): void
  appendEvents(events: PracticeEvent[]): void
  refreshProjection(): Promise<void>
}

export const GameContext = createContext<GameApi | null>(null)

export function useGame(): GameApi {
  const api = useContext(GameContext)
  if (!api) throw new Error('useGame must be used inside MandarinGame')
  return api
}
