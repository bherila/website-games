/**
 * Mandarin Quest's game-select card. This is the only game-select module that reaches
 * into `games/mandarin`, so the boundary guard (`scripts/check-mandarin-boundary.mjs`)
 * allow-lists this file and nothing else here.
 */
import { summarizeMandarinLive, summarizeMandarinPreview } from '../mandarin/previewSummary'
import type { GameCatalogEntry, GameScoreSummary } from './gameCatalog'

/**
 * Which Mandarin runtime `/mandarin` mounts, as stamped by the game-select Blade
 * shell. Only an explicit `preview` selects the mock partition; anything else,
 * including a missing root, is live — matching the Mandarin entrypoint itself.
 */
export function readMandarinRuntime(): 'preview' | 'live' {
  if (typeof document === 'undefined') {
    return 'live'
  }
  return document.getElementById('game-select-root')?.dataset.mandarinRuntime === 'preview' ? 'preview' : 'live'
}

export function summarizeMandarin(
  storage?: Storage | null,
  accountPartitionId?: string | null,
  runtime: 'preview' | 'live' = readMandarinRuntime(),
): GameScoreSummary {
  const preview = runtime === 'preview'
  const summary = preview ? summarizeMandarinPreview(storage) : summarizeMandarinLive(storage, accountPartitionId)

  return {
    kind: 'score',
    started: summary.started,
    emptyLabel: preview
      ? 'Preview · progress stays in this browser'
      : `${summary.totalScenes} scenes · not played yet`,
    stats: [
      { label: 'Scenes', value: `${summary.scenesCompleted}/${summary.totalScenes}` },
      { label: 'Lessons', value: `${summary.nodesCompleted}/${summary.totalNodes}` },
    ],
  }
}

export const MANDARIN_CATALOG_ENTRY: GameCatalogEntry = {
  kind: 'score',
  slug: 'mandarin',
  title: 'Mandarin Quest',
  emoji: '🏮',
  description: 'Join Xiaolin and an aspiring cook across ten scenes of sword-school adventure. Listen to Mandarin first, then recognize written Chinese.',
  href: '/mandarin',
  loadSummary: () => summarizeMandarin(),
}
