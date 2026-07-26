import { Play, Star } from 'lucide-react'
import { type ReactElement, useState } from 'react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'

import {
  GAME_CATALOG,
  type GameCardSummary,
  type GameCatalogEntry,
  type GameProgressSummary,
  type GameScoreSummary,
  summarizeEntry,
} from './gameCatalog'
import { GameInstallCard } from './GameInstallCard'

export function GameSelectPage(): ReactElement {
  // The entrypoint hydrates account-backed progress before mounting. Anonymous
  // games and Tower Throwback continue to resolve from localStorage.
  const [summaries] = useState<ReadonlyMap<string, GameCardSummary>>(() => new Map(
    GAME_CATALOG.map((game) => [game.slug, summarizeEntry(game)]),
  ))

  return (
    <Container>
      <div className="mx-auto max-w-5xl py-10">
        <header className="mb-8 flex flex-col gap-2">
          <MainTitle>Game Select</MainTitle>
          <p className="text-gray-600 dark:text-gray-400">
            Pick a game to play. Progress saves automatically, so you can switch games any time and pick up where you left off.
          </p>
        </header>
        <GameInstallCard />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_CATALOG.map((game) => (
            <GameCard key={game.slug} game={game} summary={summaries.get(game.slug)} />
          ))}
        </div>
      </div>
    </Container>
  )
}

interface GameCardProps {
  game: GameCatalogEntry
  summary: GameCardSummary | undefined
}

function GameCard({ game, summary }: GameCardProps): ReactElement {
  const started = summary?.started ?? false

  return (
    <a
      className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 no-underline shadow-sm transition hover:-translate-y-1 hover:no-underline hover:shadow-lg dark:border-gray-700 dark:bg-gray-900"
      data-testid={`game-card-${game.slug}`}
      href={game.href}
    >
      <span aria-hidden="true" className="text-5xl">{game.emoji}</span>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{game.title}</h2>
      <p className="flex-1 text-sm text-gray-600 dark:text-gray-400">{game.description}</p>
      {summary && <ProgressSummaryRow summary={summary} />}
      <span className="flex items-center gap-2 text-sm font-semibold text-blue-600 group-hover:underline dark:text-blue-400">
        <Play aria-hidden="true" className="size-4" />
        {started ? 'Continue playing' : 'Play now'}
      </span>
    </a>
  )
}

interface ProgressSummaryRowProps {
  summary: GameCardSummary
}

function ProgressSummaryRow({ summary }: ProgressSummaryRowProps): ReactElement {
  return summary.kind === 'score'
    ? <ScoreSummaryRow summary={summary} />
    : <LevelSummaryRow summary={summary} />
}

function LevelSummaryRow({ summary }: { summary: GameProgressSummary }): ReactElement {
  if (!summary.started) {
    return (
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {summary.totalLevels} levels · not played yet
      </span>
    )
  }

  return (
    <span className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400">
      <span>{summary.levelsCleared} / {summary.totalLevels} levels</span>
      <span className="flex items-center gap-1">
        <Star aria-hidden="true" className="size-3.5 fill-amber-400 text-amber-500" />
        {summary.starsEarned} / {summary.totalStars}
      </span>
    </span>
  )
}

function ScoreSummaryRow({ summary }: { summary: GameScoreSummary }): ReactElement {
  if (!summary.started) {
    return (
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{summary.emptyLabel}</span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
      {summary.stats.map((stat, index) => (
        <span key={stat.label}>
          {index > 0 && <span aria-hidden="true" className="mr-2">·</span>}
          {stat.label}: <span className="font-bold text-gray-700 tabular-nums dark:text-gray-200">{stat.value}</span>
        </span>
      ))}
    </span>
  )
}
