import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AdminPage, PENDING_POLL_MS } from '../AdminPage'
import { type AudioApi, audioIndexUrl } from '../audioApi'
import type { AudioEntry, AudioFilters, AudioPage, OperationResult, PanelData } from '../types'

const PANEL: PanelData = {
  usersUrl: 'https://identity.example.test/applications/games/access',
  qaUrl: '/mandarin/qa',
  qaAvailable: true,
  audio: { index: '/api/admin/mandarin/audio', request: '/r', regenerate: '/g', requestMissing: '/m', retryFailed: '/f' },
}

function entry(overrides: Partial<AudioEntry>): AudioEntry {
  return {
    key: 'utterance:01a:normal',
    source: { sourceKind: 'utterance', sourceId: '01a', variant: 'normal' },
    text: '你好。',
    pinyin: 'Nǐ hǎo.',
    en: 'Hello.',
    role: 'Guide',
    state: 'missing',
    code: null,
    assetId: null,
    provider: null,
    voice: null,
    attempts: null,
    error: null,
    updatedAt: null,
    url: null,
    contentType: null,
    ...overrides,
  }
}

function page(overrides: Partial<AudioPage> = {}): AudioPage {
  return {
    course: { courseId: 'mandarin-foundations', contentVersion: '1.1.1' },
    generationEnabled: true,
    summary: { ready: 1, queued: 0, generating: 0, failed: 1, missing: 7, unavailable: 0 },
    pending: false,
    entries: [
      entry({}),
      entry({ key: 'utterance:01b:normal', source: { sourceKind: 'utterance', sourceId: '01b', variant: 'normal' }, text: '谢谢。', state: 'ready', assetId: 4, url: '/media/games/mandarin/4/abc.mp3', voice: 'Zhiyu' }),
      entry({ key: 'target:hello:slow', source: { sourceKind: 'target', sourceId: 'hello', variant: 'slow' }, state: 'failed', assetId: 5, code: 'provider_unavailable', error: 'boom' }),
    ],
    page: 1,
    perPage: 25,
    lastPage: 2,
    total: 9,
    ...overrides,
  }
}

const OK: OperationResult = { action: 'request', queued: 1, skipped: [] }

function fakeApi(pages: AudioPage[] = [page()]): jest.Mocked<AudioApi> {
  let call = 0

  return {
    list: jest.fn(async (_filters: AudioFilters): Promise<AudioPage> => pages[Math.min(call++, pages.length - 1)]!),
    request: jest.fn(async (_key: string): Promise<OperationResult> => OK),
    regenerate: jest.fn(async (_key: string): Promise<OperationResult> => ({ ...OK, action: 'regenerate' })),
    requestMissing: jest.fn(async (): Promise<OperationResult> => ({ ...OK, action: 'request_missing', queued: 7 })),
    retryFailed: jest.fn(async (): Promise<OperationResult> => ({ ...OK, action: 'retry_failed' })),
  }
}

describe('AdminPage', () => {
  it('links to user management, or says it is not configured', async () => {
    const { unmount } = render(<AdminPage api={fakeApi()} panel={PANEL} />)
    expect(screen.getByTestId('users-link')).toHaveAttribute('href', PANEL.usersUrl)
    expect(screen.getByText(/users:admin grant\|revoke\|list/)).toBeInTheDocument()
    expect(await screen.findByTestId('qa-link')).toHaveAttribute('href', '/mandarin/qa')
    unmount()

    render(<AdminPage api={fakeApi()} panel={{ ...PANEL, usersUrl: null }} />)
    expect(screen.queryByTestId('users-link')).not.toBeInTheDocument()
    expect(screen.getByTestId('users-unconfigured')).toHaveTextContent('User management is not configured')
    await screen.findByTestId('audio-summary')
  })

  it('shows the summary and rows with the actions each state allows', async () => {
    render(<AdminPage api={fakeApi()} panel={PANEL} />)

    expect(await screen.findByTestId('summary-missing')).toHaveTextContent('7')
    const missing = screen.getByTestId('audio-row-utterance:01a:normal')
    expect(within(missing).getByRole('button', { name: /Request utterance 01a normal/ })).toBeInTheDocument()
    const ready = screen.getByTestId('audio-row-utterance:01b:normal')
    expect(within(ready).getByRole('button', { name: /Play utterance 01b normal/ })).toBeInTheDocument()
    expect(within(ready).getByRole('button', { name: /Regenerate/ })).toBeInTheDocument()
    expect(within(ready).queryByRole('button', { name: /^Request/ })).not.toBeInTheDocument()
    const failed = screen.getByTestId('audio-row-target:hello:slow')
    expect(within(failed).getByText('boom')).toBeInTheDocument()
    expect(within(failed).getByRole('button', { name: /Retry target hello slow/ })).toBeInTheDocument()
  })

  it('requests one source and reports the result', async () => {
    const api = fakeApi()
    render(<AdminPage api={api} panel={PANEL} />)

    fireEvent.click(await screen.findByRole('button', { name: /Request utterance 01a normal/ }))

    await waitFor(() => expect(api.request).toHaveBeenCalledWith('utterance:01a:normal'))
    expect(await screen.findByTestId('audio-notice')).toHaveTextContent('1 queued.')
  })

  it('regenerates only after an explicit confirmation', async () => {
    const api = fakeApi()
    render(<AdminPage api={api} panel={PANEL} />)

    fireEvent.click(await screen.findByRole('button', { name: /Regenerate utterance 01b normal/ }))
    expect(await screen.findByText('Regenerate this clip?')).toBeInTheDocument()
    expect(api.regenerate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Regenerate this clip?')).not.toBeInTheDocument())
    expect(api.regenerate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Regenerate utterance 01b normal/ }))
    fireEvent.click(await screen.findByTestId('confirm-action'))
    await waitFor(() => expect(api.regenerate).toHaveBeenCalledWith('utterance:01b:normal'))
  })

  it('confirms the bulk request with the missing count first', async () => {
    const api = fakeApi()
    render(<AdminPage api={api} panel={PANEL} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Request all missing (7)' }))
    expect(await screen.findByText('Request 7 missing clips?')).toBeInTheDocument()
    expect(api.requestMissing).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-action'))

    await waitFor(() => expect(api.requestMissing).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('audio-notice')).toHaveTextContent('7 queued.')
  })

  it('filters by state and text and pages', async () => {
    const api = fakeApi()
    render(<AdminPage api={api} panel={PANEL} />)
    await screen.findByTestId('audio-summary')

    fireEvent.change(screen.getByLabelText('Filter by state'), { target: { value: 'failed' } })
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ state: 'failed', q: '', page: 1 }))

    fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ state: 'failed', q: 'hello', page: 1 }))

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ state: 'failed', q: 'hello', page: 2 }))
  })

  it('refreshes on a timer only while something is queued or generating', async () => {
    jest.useFakeTimers()
    try {
      const api = fakeApi([page({ pending: true }), page({ pending: false })])
      render(<AdminPage api={api} panel={PANEL} />)
      await act(async () => { await Promise.resolve() })
      expect(api.list).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Generating; refreshing/)).toBeInTheDocument()

      await act(async () => { jest.advanceTimersByTime(PENDING_POLL_MS) })
      expect(api.list).toHaveBeenCalledTimes(2)

      await act(async () => { jest.advanceTimersByTime(PENDING_POLL_MS * 3) })
      expect(api.list).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('audioIndexUrl', () => {
  it('sends only the filters that are set', () => {
    expect(audioIndexUrl('/api/admin/mandarin/audio', { state: '', q: ' ', page: 1 })).toBe('/api/admin/mandarin/audio')
    expect(audioIndexUrl('/api/admin/mandarin/audio', { state: 'failed', q: '你好', page: 3 })).toBe('/api/admin/mandarin/audio?state=failed&q=%E4%BD%A0%E5%A5%BD&page=3')
  })
})
