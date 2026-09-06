/**
 * Root component: bootstraps through the injected gateway, owns preview
 * progress/settings/outbox, routes between screens, and derives the diorama
 * setting + beat. Persists only to the `mandarin.preview.*` partition.
 */
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Bootstrap, PracticeEvent, ProgressProjection, SaveState } from './contracts/mandarin'
import type { Course } from './domain/courseSchema'
import type { EventContext } from './domain/events'
import { createInitialProgress, parseStoredProgress, type PreviewProgress } from './domain/progress'
import { DEFAULT_SETTINGS, type MandarinSettings, parseSettings } from './domain/settings'
import type { MandarinRuntime } from './runtime/MandarinRuntime'
import type { DioramaBeat } from './scene/sceneConfigs'
import { type GameApi, GameContext, type Overlay, type Route } from './ui/GameContext'
import { GameShell } from './ui/GameShell'
import { GlossaryOverlay, MapOverlay } from './ui/Overlays'
import { GameButton, MUTED, Panel, SectionTitle } from './ui/primitives'
import { RuntimeProvider } from './ui/RuntimeContext'
import { HomeScreen } from './ui/screens/HomeScreen'
import { LessonScreen } from './ui/screens/LessonScreen'
import { ListeningCheckScreen } from './ui/screens/ListeningCheckScreen'
import { OnboardingScreen } from './ui/screens/OnboardingScreen'
import { ReviewScreen } from './ui/screens/ReviewScreen'
import { SceneCompleteScreen } from './ui/screens/SceneCompleteScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { TeachingScreen } from './ui/screens/TeachingScreen'

interface Loaded {
  bootstrap: Bootstrap<Course>
  projection: ProgressProjection | null
  progress: PreviewProgress
}

function useReducedMotionPreference(): boolean {
  const [prefers, setPrefers] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setPrefers(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return prefers
}

function seedFromProjection(progress: PreviewProgress, projection: ProgressProjection | null): PreviewProgress {
  if (!projection || projection.completedNodeIds.length === 0) return progress
  if (progress.completedNodeIds.length > 0) return progress
  return {
    ...progress,
    onboardingComplete: true,
    completedNodeIds: [...projection.completedNodeIds],
    completedSceneIds: [...projection.completedSceneIds],
    introducedNodeIds: [...projection.completedNodeIds],
    currentNodeId: projection.currentNodeId,
    checkpoint: { ...progress.checkpoint, exposedExerciseIds: [...projection.checkpointExposedIds] },
  }
}

export function MandarinGame({ runtime }: { runtime: MandarinRuntime }): ReactElement {
  return (
    <RuntimeProvider runtime={runtime}>
      <GameProvider runtime={runtime} />
    </RuntimeProvider>
  )
}

function GameProvider({ runtime }: { runtime: MandarinRuntime }): ReactElement {
  const { course, gateway, store, audio } = runtime
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<MandarinSettings>(() => parseSettings(store.loadSettings()))
  const [saveState, setSaveState] = useState<SaveState>(runtime.scenario?.saveState ?? 'local_preview')
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [beat, setBeat] = useState<DioramaBeat>('idle')
  const [reloadKey, setReloadKey] = useState(0)
  const prefersReduced = useReducedMotionPreference()
  const outboxRef = useRef<PracticeEvent[]>(store.loadOutbox())

  // Bootstrap through the gateway (mock or live) — never touches WebGL.
  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    setLoadError(null)
    void (async () => {
      try {
        const bootstrap = await gateway.bootstrap()
        let projection: ProgressProjection | null = null
        try {
          projection = await gateway.getProgress()
        } catch {
          projection = null
          setSaveState('offline')
        }
        if (cancelled) return
        const stored = parseStoredProgress(store.loadProgress(), course)
        const progress = seedFromProjection(stored ?? createInitialProgress(course), projection)
        setLoaded({ bootstrap, projection, progress })
        setRoute(progress.onboardingComplete ? { name: 'home' } : { name: 'onboarding' })
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the course.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [course, gateway, store, reloadKey])

  // Persist settings + push volumes to the audio manager.
  useEffect(() => {
    store.saveSettings(settings)
    audio.updateSettings({ speechVolume: settings.speechVolume, sfxVolume: settings.sfxVolume, deviceVoicePreview: settings.deviceVoicePreview })
  }, [audio, settings, store])

  // Persist progress on change.
  useEffect(() => {
    if (loaded) store.saveProgress(loaded.progress)
  }, [loaded, store])

  // Any navigation cancels speech and closes overlays.
  useEffect(() => {
    audio.stop()
    setOverlay(null)
  }, [audio, route])

  const updateProgress = useCallback((update: (progress: PreviewProgress) => PreviewProgress) => {
    setLoaded((current) => current ? { ...current, progress: update(current.progress) } : current)
  }, [])

  const updateSettings = useCallback((patch: Partial<MandarinSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  const appendEvents = useCallback((events: PracticeEvent[]) => {
    if (events.length === 0) return
    outboxRef.current = [...outboxRef.current, ...events]
    store.saveOutbox(outboxRef.current)
    const canSave = loaded?.bootstrap.capabilities.canSaveToAccount === true
    if (canSave) setSaveState('saving')
    void gateway.appendEvents(events).then((result) => {
      const acknowledged = new Set(result.acknowledgments.filter((ack) => ack.status !== 'rejected').map((ack) => ack.clientEventId))
      outboxRef.current = outboxRef.current.filter((event) => !acknowledged.has(event.clientEventId))
      store.saveOutbox(outboxRef.current)
      const rejected = result.acknowledgments.find((ack) => ack.status === 'rejected')
      if (rejected?.reasonCode === 'sign_in_required') setSaveState('sign_in_required')
      else if (canSave) setSaveState('saved')
      else setSaveState(runtime.scenario?.saveState ?? 'local_preview')
    }).catch(() => {
      // Events stay in the outbox; the preview never retries automatically.
      setSaveState('offline')
    })
  }, [gateway, loaded?.bootstrap.capabilities.canSaveToAccount, runtime.scenario?.saveState, store])

  const refreshProjection = useCallback(async () => {
    try {
      const projection = await gateway.getProgress()
      setLoaded((current) => current ? { ...current, projection } : current)
    } catch {
      setSaveState('offline')
    }
  }, [gateway])

  const resetPreview = useCallback(() => {
    audio.stop()
    store.clearAll()
    outboxRef.current = []
    setSettings({ ...DEFAULT_SETTINGS })
    setRoute({ name: 'onboarding' })
    setReloadKey((key) => key + 1)
  }, [audio, store])

  const navigate = useCallback((next: Route) => {
    setRoute(next)
    if (next.name === 'home' || next.name === 'settings') setBeat('idle')
  }, [])

  const eventContext = useMemo<EventContext>(() => ({
    identity: course.identity,
    clientInstanceId: runtime.clientInstanceId,
    sessionId: runtime.sessionId,
    now: () => runtime.now().toISOString(),
  }), [course.identity, runtime])

  const progress = loaded?.progress ?? null
  const sceneForRoute = useMemo(() => {
    if (!progress) return course.scenes[0]!
    switch (route.name) {
      case 'teaching':
      case 'lesson':
        return course.sceneForNode(route.nodeId)
      case 'sceneComplete':
        return course.sceneById.get(route.sceneId) ?? course.scenes[0]!
      default:
        return course.sceneForNode(progress.currentNodeId)
    }
  }, [course, progress, route])

  if (loadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5efe3] p-4">
        <Panel className="max-w-md">
          <SectionTitle>Could not start the preview</SectionTitle>
          <p className={`mt-2 text-sm ${MUTED}`}>{loadError}</p>
          <GameButton variant="primary" className="mt-3" onClick={() => setReloadKey((key) => key + 1)}>Try again</GameButton>
        </Panel>
      </div>
    )
  }
  if (!loaded || !progress) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5efe3] p-4" role="status" data-testid="loading-screen">
        <p className="text-sm font-semibold text-[#5b6470]">Loading the course…</p>
      </div>
    )
  }

  const api: GameApi = {
    course,
    bootstrap: loaded.bootstrap,
    projection: loaded.projection,
    progress,
    settings,
    saveState,
    route,
    overlay,
    beat,
    setting: sceneForRoute.setting,
    posterSlotId: sceneForRoute.artSlotId,
    reducedMotion: settings.lowMotion || prefersReduced,
    eventContext,
    navigate,
    setOverlay,
    setBeat,
    updateProgress,
    updateSettings,
    resetPreview,
    appendEvents,
    refreshProjection,
  }

  return (
    <GameContext.Provider value={api}>
      <GameShell scenery={route.name !== 'settings'} title={shellTitle(route, api)}>
        <Screen route={route} key={reloadKey} />
      </GameShell>
      {overlay === 'map' && <MapOverlay />}
      {overlay === 'glossary' && <GlossaryOverlay />}
    </GameContext.Provider>
  )
}

function shellTitle(route: Route, api: GameApi): string {
  switch (route.name) {
    case 'teaching':
    case 'lesson': {
      const scene = api.course.sceneForNode(route.nodeId)
      return `Scene ${scene.order} · ${scene.title}`
    }
    case 'review': return route.kind === 'scheduled' ? 'Review' : 'Extra practice'
    case 'checkpoint': return 'Listening check'
    case 'settings': return 'Settings'
    case 'sceneComplete': return 'Scene complete'
    case 'onboarding': return 'Welcome'
    default: return 'Mandarin Quest'
  }
}

function Screen({ route }: { route: Route }): ReactElement {
  switch (route.name) {
    case 'onboarding': return <OnboardingScreen />
    case 'teaching': return <TeachingScreen nodeId={route.nodeId} />
    case 'lesson': return <LessonScreen nodeId={route.nodeId} />
    case 'sceneComplete': return <SceneCompleteScreen sceneId={route.sceneId} />
    case 'review': return <ReviewScreen kind={route.kind} />
    case 'checkpoint': return <ListeningCheckScreen />
    case 'settings': return <SettingsScreen />
    default: return <HomeScreen />
  }
}
