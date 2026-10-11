/**
 * Root component: bootstraps through the injected gateway, owns preview
 * progress/settings/outbox, routes between screens, and derives the diorama
 * setting + beat. Persists only to the `mandarin.preview.*` partition.
 */
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Bootstrap, PracticeEvent, ProgressProjection, SaveState } from './contracts/mandarin'
import type { Course } from './domain/courseSchema'
import type { EventContext } from './domain/events'
import { drainOutboxUntilCaughtUp } from './domain/outbox'
import { createInitialProgress, parseStoredProgress, type PreviewProgress } from './domain/progress'
import { newerProjection } from './domain/projection'
import { isSchedulerOutdated } from './domain/scheduler'
import { DEFAULT_SETTINGS, type MandarinSettings, parseSettings } from './domain/settings'
import type { MandarinRuntime } from './runtime/MandarinRuntime'
import type { DioramaBeat } from './scene/sceneConfigs'
import { type ActiveAssessment, type GameApi, GameContext, type Overlay, type Route } from './ui/GameContext'
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
  const [activeAssessment, setActiveAssessment] = useState<ActiveAssessment | null>(null)
  const [beat, setBeat] = useState<DioramaBeat>('idle')
  const [reloadKey, setReloadKey] = useState(0)
  const prefersReduced = useReducedMotionPreference()
  const outboxRef = useRef<PracticeEvent[]>(store.loadOutbox())
  const [deadLetterCount, setDeadLetterCount] = useState(() => store.loadDeadLetters().length)
  // Bumped on reset so acknowledgments from before the reset are ignored.
  const resetGenerationRef = useRef(0)
  const drainingRef = useRef(false)
  const drainPromiseRef = useRef<Promise<void> | null>(null)

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

  // Sends the whole outbox, not just the newest events, so a backlog left by an
  // offline session drains on the next successful upload. Replay is safe: the
  // server keys on (user, clientEventId) and answers an identical re-upload
  // `already_present`, which is not a rejection and so clears the entry here.
  // Returns the in-flight drain when one is running, so a caller can wait for
  // the server to hold every queued event before it reads progress back.
  const drainNow = useCallback((): Promise<void> => {
    if (drainPromiseRef.current) return drainPromiseRef.current
    if (outboxRef.current.length === 0) return Promise.resolve()
    drainingRef.current = true
    const canSave = loaded?.bootstrap.capabilities.canSaveToAccount === true
    if (canSave) setSaveState('saving')
    const generation = resetGenerationRef.current
    const idle = runtime.scenario?.saveState ?? 'local_preview'
    const run = drainOutboxUntilCaughtUp({
      read: () => outboxRef.current,
      write: (events) => {
        outboxRef.current = events
        store.saveOutbox(events)
      },
      deadLetter: (rejected) => {
        const rejectedAt = runtime.now().toISOString()
        const saved = store.addDeadLetters(rejected.map((entry) => ({ ...entry, rejectedAt })))
        if (saved) setDeadLetterCount(store.loadDeadLetters().length)
        return saved
      },
      send: (events) => gateway.appendEvents(events),
      isCurrent: () => generation === resetGenerationRef.current,
    }).then((outcome) => {
      if (generation !== resetGenerationRef.current) return
      if (outcome === 'sign_in_required') setSaveState('sign_in_required')
      else if (outcome === 'offline') setSaveState('offline')
      else setSaveState(canSave ? 'saved' : idle)
    }).finally(() => {
      drainingRef.current = false
      drainPromiseRef.current = null
    })
    drainPromiseRef.current = run
    return run
  }, [gateway, loaded?.bootstrap.capabilities.canSaveToAccount, runtime, store])

  const flushOutbox = useCallback((): void => {
    void drainNow()
  }, [drainNow])

  const appendEvents = useCallback((events: PracticeEvent[]) => {
    if (events.length === 0) return
    outboxRef.current = [...outboxRef.current, ...events]
    store.saveOutbox(outboxRef.current)
    flushOutbox()
  }, [flushOutbox, store])

  // Two things restart a stalled outbox: finishing a load (the events stranded
  // by a previous offline session are still there) and the connection coming
  // back mid-session. Without either, a session played offline was kept
  // perfectly and then never sent.
  useEffect(() => {
    if (loaded) flushOutbox()
  }, [loaded, flushOutbox])

  useEffect(() => {
    const onOnline = (): void => flushOutbox()
    window.addEventListener('online', onOnline)

    return () => window.removeEventListener('online', onOnline)
  }, [flushOutbox])

  // Uploads queued answers first, so the projection read back includes them
  // and the due list reflects the session that just ended.
  // Responses can arrive out of order, so an older read never replaces a newer
  // one, and a read started before a preview reset is dropped.
  const refreshProjection = useCallback(async () => {
    const generation = resetGenerationRef.current
    try {
      await drainNow()
      const projection = await gateway.getProgress()
      if (generation !== resetGenerationRef.current) return
      setLoaded((current) => current ? { ...current, projection: newerProjection(current.projection, projection) } : current)
    } catch {
      setSaveState('offline')
    }
  }, [drainNow, gateway])

  const resetPreview = useCallback(() => {
    audio.stop()
    resetGenerationRef.current += 1
    store.clearAll()
    runtime.resetState?.()
    outboxRef.current = []
    setDeadLetterCount(0)
    setSaveState(runtime.scenario?.saveState ?? 'local_preview')
    setSettings({ ...DEFAULT_SETTINGS })
    setRoute({ name: 'onboarding' })
    setReloadKey((key) => key + 1)
  }, [audio, runtime, store])

  const navigate = useCallback((next: Route) => {
    setRoute(next)
    if (next.name === 'home' || next.name === 'settings') setBeat('idle')
  }, [])

  // Clearing is identity-guarded so a question unmounting after its successor
  // mounted cannot wipe the successor's registration.
  const registerAssessment = useCallback((entry: ActiveAssessment) => {
    setActiveAssessment(entry)
    return () => setActiveAssessment((current) => (current === entry ? null : current))
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
    deadLetterCount,
    schedulerOutdated: isSchedulerOutdated(loaded.projection),
    route,
    overlay,
    activeAssessment,
    beat,
    setting: sceneForRoute.setting,
    sceneId: sceneForRoute.id,
    posterSlotId: sceneForRoute.artSlotId,
    reducedMotion: settings.lowMotion || prefersReduced,
    eventContext,
    navigate,
    setOverlay,
    registerAssessment,
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
