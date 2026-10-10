import { ExternalLink, Pause, Play, RefreshCw, Search } from 'lucide-react'
import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { AudioApi } from './audioApi'
import { AUDIO_STATES, type AudioEntry, type AudioFilters, type AudioPage, type AudioState, type OperationResult, type PanelData } from './types'

/** How often the dashboard refreshes itself while anything is queued or generating. */
export const PENDING_POLL_MS = 4000

const STATE_TONE: Record<AudioState, string> = {
  ready: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  queued: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  generating: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  failed: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  missing: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  unavailable: 'bg-muted text-muted-foreground',
}

type Confirmation =
  | { kind: 'regenerate'; entry: AudioEntry }
  | { kind: 'requestMissing'; count: number }
  | { kind: 'retryFailed'; count: number }

export interface AdminPageProps {
  panel: PanelData
  api: AudioApi
}

export function AdminPage({ panel, api }: AdminPageProps): ReactElement {
  return (
    <Container>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 py-6">
        <header>
          <MainTitle>Admin</MainTitle>
          <p className="text-muted-foreground">Operator tools for this application. Everything here is limited to application administrators.</p>
        </header>
        <UsersCard usersUrl={panel.usersUrl} />
        <AudioDashboard api={api} qaAvailable={panel.qaAvailable} qaUrl={panel.qaUrl} />
      </div>
    </Container>
  )
}

function UsersCard({ usersUrl }: { usersUrl: string | null }): ReactElement {
  return (
    <section aria-labelledby="users-heading" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-bold" id="users-heading">Users</h2>
      {usersUrl === null
        ? (
            <p className="text-sm text-muted-foreground" data-testid="users-unconfigured">
              User management is not configured: set the identity provider&apos;s address and this application&apos;s delegated access key.
            </p>
          )
        : (
            <a className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline" data-testid="users-link" href={usersUrl} rel="noopener noreferrer" target="_blank">
              Manage users
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
      <p className="mt-2 text-sm text-muted-foreground">
        On the server, <code className="rounded bg-muted px-1">php artisan users:admin grant|revoke|list</code> manages administrators as well.
      </p>
    </section>
  )
}

interface AudioDashboardProps {
  api: AudioApi
  qaUrl: string
  qaAvailable: boolean
}

function AudioDashboard({ api, qaUrl, qaAvailable }: AudioDashboardProps): ReactElement {
  const [filters, setFilters] = useState<AudioFilters>({ state: '', q: '', page: 1 })
  const [search, setSearch] = useState('')
  const [data, setData] = useState<AudioPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const generationRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const ticket = ++generationRef.current
    try {
      const page = await api.list(filters)
      if (ticket !== generationRef.current) return
      setData(page)
      setError(null)
    } catch (reason) {
      if (ticket !== generationRef.current) return
      setError(typeof reason === 'string' ? reason : 'Could not load the audio dashboard.')
    }
  }, [api, filters])

  useEffect(() => {
    void load()
  }, [load])

  // While anything is queued or generating, refresh on a timer so states move without a click.
  const pending = data?.pending ?? false
  useEffect(() => {
    if (!pending) return undefined
    const timer = window.setInterval(() => { void load() }, PENDING_POLL_MS)

    return () => window.clearInterval(timer)
  }, [pending, load])

  const act = async (run: () => Promise<OperationResult>): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice(describe(await run()))
    } catch (reason) {
      setNotice(typeof reason === 'string' ? reason : 'The request failed.')
    } finally {
      setBusy(false)
      await load()
    }
  }

  const confirm = (): void => {
    const pendingConfirmation = confirmation
    setConfirmation(null)
    if (pendingConfirmation === null) return
    if (pendingConfirmation.kind === 'regenerate') void act(() => api.regenerate(pendingConfirmation.entry.key))
    else if (pendingConfirmation.kind === 'requestMissing') void act(() => api.requestMissing())
    else void act(() => api.retryFailed())
  }

  const onSearch = (event: FormEvent): void => {
    event.preventDefault()
    setFilters((current) => ({ ...current, q: search, page: 1 }))
  }

  const summary = data?.summary

  return (
    <section aria-labelledby="audio-heading" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold" id="audio-heading">Mandarin audio</h2>
        {data && <span className="text-sm text-muted-foreground">{data.course.courseId} @ {data.course.contentVersion}</span>}
      </div>
      <p className="text-sm text-muted-foreground">
        Every audio source in the published course revision. Generating speech costs money; nothing on this page generates until you ask.
        {qaAvailable
          ? <> Listen through the whole course on the <a className="font-semibold text-primary hover:underline" data-testid="qa-link" href={qaUrl}>audio QA sheet</a>.</>
          : <> The audio QA sheet is switched off in this deployment.</>}
      </p>
      {data && !data.generationEnabled && (
        <p className="rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-200" role="status">
          Speech generation is disabled in this environment: requests for speech are refused; UI cues still render.
        </p>
      )}

      {summary && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="audio-summary">
          {AUDIO_STATES.map((state) => (
            <button
              key={state}
              aria-pressed={filters.state === state}
              className={cn('rounded-lg border border-border p-3 text-left transition hover:border-ring/50', filters.state === state && 'ring-2 ring-ring')}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, state: current.state === state ? '' : state, page: 1 }))}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{state}</dt>
              <dd className="text-2xl font-bold" data-testid={`summary-${state}`}>{summary[state]}</dd>
            </button>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || !summary || summary.missing === 0} onClick={() => summary && setConfirmation({ kind: 'requestMissing', count: summary.missing })}>
          Request all missing{summary ? ` (${summary.missing})` : ''}
        </Button>
        <Button disabled={busy || !summary || summary.failed === 0} variant="secondary" onClick={() => summary && setConfirmation({ kind: 'retryFailed', count: summary.failed })}>
          Retry all failed{summary ? ` (${summary.failed})` : ''}
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => { void load() }}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
        {pending && <span className="text-sm text-muted-foreground" role="status">Generating; refreshing every {PENDING_POLL_MS / 1000} s.</span>}
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search" onSubmit={onSearch}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">State</span>
          <select
            aria-label="Filter by state"
            className="h-9 rounded-md border border-input bg-background px-2"
            value={filters.state}
            onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value as AudioState | '', page: 1 }))}
          >
            <option value="">All states</option>
            {AUDIO_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Search</span>
          <input
            aria-label="Search text"
            className="h-9 rounded-md border border-input bg-background px-2"
            placeholder="Chinese, pinyin, English or source id"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button type="submit" variant="outline">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>

      {notice && <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="audio-notice" role="status">{notice}</p>}
      {error && <p className="rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-800 dark:text-rose-200" role="alert">{error}</p>}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2" scope="col">Text</th>
                  <th className="px-2 py-2" scope="col">Source</th>
                  <th className="px-2 py-2" scope="col">Voice</th>
                  <th className="px-2 py-2" scope="col">State</th>
                  <th className="px-2 py-2" scope="col">Updated</th>
                  <th className="px-2 py-2" scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <AudioRow
                    key={entry.key}
                    busy={busy}
                    entry={entry}
                    onRegenerate={() => setConfirmation({ kind: 'regenerate', entry })}
                    onRequest={() => { void act(() => api.request(entry.key)) }}
                  />
                ))}
                {data.entries.length === 0 && (
                  <tr><td className="px-2 py-6 text-center text-muted-foreground" colSpan={6}>No audio sources match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{data.total} source{data.total === 1 ? '' : 's'} · page {data.page} of {data.lastPage}</span>
            <span className="flex gap-2">
              <Button disabled={data.page <= 1} size="sm" variant="outline" onClick={() => setFilters((current) => ({ ...current, page: data.page - 1 }))}>Previous</Button>
              <Button disabled={data.page >= data.lastPage} size="sm" variant="outline" onClick={() => setFilters((current) => ({ ...current, page: data.page + 1 }))}>Next</Button>
            </span>
          </nav>
        </>
      )}

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationTitle(confirmation)}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationBody(confirmation)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-action" onClick={confirm}>Queue generation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

interface AudioRowProps {
  entry: AudioEntry
  busy: boolean
  onRequest: () => void
  onRegenerate: () => void
}

function AudioRow({ entry, busy, onRequest, onRegenerate }: AudioRowProps): ReactElement {
  const label = `${entry.source.sourceKind} ${entry.source.sourceId} ${entry.source.variant}`

  return (
    <tr className="border-b border-border/60 align-top" data-testid={`audio-row-${entry.key}`}>
      <td className="px-2 py-2">
        <div className="font-medium" lang={entry.source.sourceKind === 'sfx' ? undefined : 'zh-Hans'}>{entry.text}</div>
        {entry.pinyin !== '' && <div className="text-xs text-muted-foreground">{entry.pinyin}</div>}
        {entry.en !== '' && <div className="text-xs text-muted-foreground">{entry.en}</div>}
      </td>
      <td className="px-2 py-2 font-mono text-xs">{entry.key}<div className="font-sans text-muted-foreground">{entry.role}</div></td>
      <td className="px-2 py-2 text-xs">{entry.voice ?? '—'}{entry.provider && <div className="text-muted-foreground">{entry.provider}</div>}</td>
      <td className="px-2 py-2">
        <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-semibold', STATE_TONE[entry.state])}>{entry.state}</span>
        {entry.code && <div className="mt-1 text-xs text-muted-foreground">{entry.code}</div>}
        {entry.error && <div className="mt-1 max-w-64 text-xs text-rose-700 dark:text-rose-300">{entry.error}</div>}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '—'}</td>
      <td className="px-2 py-2">
        <div className="flex justify-end gap-2">
          {entry.state === 'ready' && entry.url && <PlayButton label={label} url={entry.url} />}
          {(entry.state === 'missing' || entry.state === 'failed') && (
            <Button aria-label={`${entry.state === 'failed' ? 'Retry' : 'Request'} ${label}`} disabled={busy} size="sm" onClick={onRequest}>
              {entry.state === 'failed' ? 'Retry' : 'Request'}
            </Button>
          )}
          {entry.state === 'ready' && (
            <Button aria-label={`Regenerate ${label}`} disabled={busy} size="sm" variant="outline" onClick={onRegenerate}>Regenerate</Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function PlayButton({ url, label }: { url: string; label: string }): ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const toggle = (): void => {
    if (audioRef.current === null) {
      audioRef.current = new Audio(url)
      audioRef.current.addEventListener('ended', () => setPlaying(false))
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      void audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  return (
    <Button aria-label={`${playing ? 'Pause' : 'Play'} ${label}`} size="icon-sm" variant="outline" onClick={toggle}>
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
    </Button>
  )
}

function describe(result: OperationResult): string {
  const queued = `${result.queued} queued`
  if (result.skipped.length === 0) return `${queued}.`
  const reasons = new Map<string, number>()
  for (const skip of result.skipped) reasons.set(skip.reason, (reasons.get(skip.reason) ?? 0) + 1)

  return `${queued}; ${result.skipped.length} skipped (${[...reasons].map(([reason, count]) => `${reason}: ${count}`).join(', ')}).`
}

function confirmationTitle(confirmation: Confirmation | null): string {
  switch (confirmation?.kind) {
    case 'regenerate': return 'Regenerate this clip?'
    case 'requestMissing': return `Request ${confirmation.count} missing clip${confirmation.count === 1 ? '' : 's'}?`
    case 'retryFailed': return `Retry ${confirmation.count} failed clip${confirmation.count === 1 ? '' : 's'}?`
    default: return ''
  }
}

function confirmationBody(confirmation: Confirmation | null): string {
  switch (confirmation?.kind) {
    case 'regenerate': return `“${confirmation.entry.text}” (${confirmation.entry.key}) is generated again, which costs money. Players cannot hear it until the new clip is ready.`
    case 'requestMissing': return `This queues paid generation for ${confirmation.count} source${confirmation.count === 1 ? '' : 's'} with no audio yet. Lines already queued or generating are left alone.`
    case 'retryFailed': return `This queues paid generation again for ${confirmation.count} failed source${confirmation.count === 1 ? '' : 's'}, with their attempts starting over.`
    default: return ''
  }
}
