#!/usr/bin/env node
/**
 * Shortcut finder for Marble Works levels: searches for the smallest builds that win,
 * so a level that can be beaten with fewer pieces than its reference solution shows up.
 *
 *   pnpm run marble-works:search [--pieces N] [--runs N] [--gems] [--best] [levelId ...]
 *
 * --pieces  largest build to try (default: each level's reference size - 1, at most 3)
 * --runs    simulation budget per level (default 60000)
 * --gems    only count wins that also collect every gem
 * --best    best-first instead of breadth-first: finds big shortcuts fast, proves no minimum
 *
 * Exit code 1 when any level is beaten below its reference solution's size.
 */
import { register } from 'node:module'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

register('./ts-hooks.mjs', import.meta.url)

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  if (index < 0) {
    return fallback
  }
  const value = Number(args[index + 1])
  args.splice(index, 2)

  return value
}
const maxPiecesOption = option('--pieces', null)
const maxRuns = option('--runs', 60000)
const flag = (name) => {
  const index = args.indexOf(name)
  if (index >= 0) {
    args.splice(index, 1)
  }

  return index >= 0
}
const requireGems = flag('--gems')
const bestFirst = flag('--best')

const { LEVELS } = await import('../../resources/js/games/marble-works/levels/levels.ts')
const wanted = args.length > 0 ? args.map(Number) : LEVELS.map((level) => level.id)
const jobs = LEVELS.filter((level) => wanted.includes(level.id)).map((level) => ({
  levelId: level.id,
  reference: level.solution.length,
  maxPieces: maxPiecesOption ?? Math.max(1, Math.min(3, level.solution.length - 1)),
  maxRuns,
  requireGems,
  bestFirst,
}))

const describe = (placement) => `${placement.pieceId}(${placement.col},${placement.row}${placement.variant ? ` v${placement.variant}` : ''}${placement.flipped ? ' f' : ''})`
let cheap = 0
const results = []
const queue = [...jobs]
const runWorker = async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./search-worker.ts', import.meta.url), {
        workerData: job,
        execArgv: ['--import', new URL('./register-hooks.mjs', import.meta.url).href],
      })
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    const below = result.minPieces !== null && result.minPieces < job.reference
    if (below) {
      cheap += 1
    }
    results.push({ job, result })
    const verdict = result.minPieces === null
      ? `no win ≤ ${bestFirst ? job.maxPieces : result.depthExplored} pieces${bestFirst ? ' (best-first: not a proof)' : result.exhausted ? '' : ' (budget hit)'}`
      : `${below ? 'SHORTCUT' : 'ok'}: wins with ${result.minPieces} (reference ${job.reference})`
    console.log(`level ${String(job.levelId).padStart(2)}  ${verdict}  [${result.runs} runs, ${result.seconds.toFixed(1)}s]`)
    for (const solution of below ? result.solutions.slice(0, 3) : []) {
      console.log(`           ${solution.map(describe).join(' ')}`)
    }
  }
}
await Promise.all(Array.from({ length: Math.min(availableParallelism(), jobs.length) }, runWorker))
process.exitCode = cheap > 0 ? 1 : 0
