import { parentPort, workerData } from 'node:worker_threads'

import { LEVELS } from '../../resources/js/games/marble-works/levels/levels.ts'
import { searchLevel } from '../../resources/js/games/marble-works/levels/levelSearch.ts'

interface Job {
  levelId: number
  maxPieces: number
  maxRuns: number
  requireGems: boolean
  bestFirst: boolean
}

const { levelId, maxPieces, maxRuns, requireGems, bestFirst } = workerData as Job
const level = LEVELS.find((candidate) => candidate.id === levelId)
if (!level) {
  throw new Error(`No level ${levelId}`)
}
const started = performance.now()
const result = searchLevel(level, { maxPieces, maxRuns, requireGems, bestFirst, maxSolutions: 5 })
parentPort?.postMessage({ levelId, ...result, seconds: (performance.now() - started) / 1000 })
