import { fetchWrapper } from '@/fetchWrapper'

import type { AudioFilters, AudioPage, OperationResult, PanelData } from './types'

export function audioIndexUrl(base: string, filters: AudioFilters): string {
  const params = new URLSearchParams()
  if (filters.state !== '') params.set('state', filters.state)
  if (filters.q.trim() !== '') params.set('q', filters.q.trim())
  if (filters.page > 1) params.set('page', String(filters.page))
  const query = params.toString()

  return query === '' ? base : `${base}?${query}`
}

export interface AudioApi {
  list(filters: AudioFilters): Promise<AudioPage>
  request(key: string): Promise<OperationResult>
  /** Paid: only after the operator confirmed it. */
  regenerate(key: string): Promise<OperationResult>
  /** Paid: only after the operator confirmed the count. */
  requestMissing(): Promise<OperationResult>
  retryFailed(): Promise<OperationResult>
}

/** JSON over the session, with the CSRF token from the page's meta tag on every POST. */
export function httpAudioApi(endpoints: PanelData['audio']): AudioApi {
  return {
    list: (filters) => fetchWrapper.get(audioIndexUrl(endpoints.index, filters)) as Promise<AudioPage>,
    request: (key) => fetchWrapper.post(endpoints.request, { source: key }) as Promise<OperationResult>,
    regenerate: (key) => fetchWrapper.post(endpoints.regenerate, { source: key, confirm: 1 }) as Promise<OperationResult>,
    requestMissing: () => fetchWrapper.post(endpoints.requestMissing, { confirm: 1 }) as Promise<OperationResult>,
    retryFailed: () => fetchWrapper.post(endpoints.retryFailed, {}) as Promise<OperationResult>,
  }
}
