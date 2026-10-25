/**
 * Authored win and overflow traces, checked against the engine by
 * campaign.test.ts and replayed through real input by the browser journeys.
 * Generated with analyseLevel() from puzzleSolver.ts: roofs come off before
 * the gable walls that carry them.
 */
export const WORKSHOP_TRACE = {
  level: 2,
  win: ['front-brace-1', 'back-brace-1', 'left-1', 'front-brace-2', 'right-1', 'left-roof-1', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-2'],
  lose: ['right-roof-1', 'left-roof-2', 'right-roof-2'],
}

export const VILLAGE_TRACES = [
  {
    level: 3,
    win: ['sail-coral-1', 'left-1', 'left-roof-1', 'sail-mint-1', 'right-1', 'sail-blue-1', 'sail-amber-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-1'],
    lose: ['sail-blue-1', 'sail-amber-1', 'left-roof-2'],
  },
  {
    level: 4,
    win: ['front-brace-1', 'back-brace-1', 'left-1', 'front-brace-2', 'right-1', 'left-roof-1', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-2'],
    lose: ['front-brace-1', 'front-brace-2', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2'],
  },
  {
    level: 5,
    win: ['cafe-sign-1', 'cafe-sign-2', 'left-1', 'cafe-awning-1', 'right-1', 'left-roof-1', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-2'],
    lose: ['right-roof-1', 'left-roof-2', 'right-roof-2'],
  },
]
