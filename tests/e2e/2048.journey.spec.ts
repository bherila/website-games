import { expect, type Page, test } from '@playwright/test'

import type { GameRun } from '../../resources/js/games/2048/gameTypes'

const SAVE_KEY = 'bwh.2048.save.v1'
// A valid anonymous autosave, with a known merge available. Inputs, rendering,
// subsequent autosaves and reloads all use the real app; no engine calls are mocked.
const INITIAL_RUN: GameRun = {
  version: 1,
  board: {
    size: 4,
    nextTileId: 3,
    tiles: [
      { id: 1, value: 2, row: 0, column: 1 },
      { id: 2, value: 2, row: 0, column: 2 },
    ],
  },
  score: 0,
  bestScore: 0,
  bestTile: 2,
  recorded: false,
  status: 'playing',
  randomSeed: 5,
  undosRemaining: 3,
  history: [],
  reachedWinningTile: false,
  moves: 0,
}

async function savedRun(page: Page): Promise<GameRun> {
  const run = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as GameRun | null, SAVE_KEY)
  if (!run) {
    throw new Error('Expected the live 2048 run to be autosaved')
  }
  return run
}

async function expectRenderedBoard(page: Page, run: GameRun): Promise<void> {
  await expect(page.getByTestId('board')).toHaveAttribute('aria-label', `${run.board.size} by ${run.board.size} board`)
  await expect.poll(() => page.getByTestId('board').locator('[data-testid^="tile-"]').evaluateAll((tiles) => (
    tiles.map((tile) => ({
      id: Number(tile.getAttribute('data-testid')?.replace('tile-', '')),
      value: Number(tile.getAttribute('data-value')),
      row: Number(tile.getAttribute('data-row')),
      column: Number(tile.getAttribute('data-column')),
    })).sort((a, b) => a.id - b.id)
  ))).toEqual([...run.board.tiles].sort((a, b) => a.id - b.id))
}

async function moveLeft(page: Page, mobile: boolean): Promise<void> {
  if (!mobile) {
    await page.keyboard.press('ArrowLeft')
    return
  }

  const box = await page.getByTestId('board').boundingBox()
  if (!box) {
    throw new Error('2048 board is not mounted')
  }
  // Chromium's native touch events exercise the mobile gesture path, including
  // the Pointer Event suppression that prevents a swipe from moving twice.
  const session = await page.context().newCDPSession(page)
  const y = box.y + box.height / 2
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width * 0.8, y }],
    })
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, x: box.x + box.width * 0.3, y }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await session.detach()
  }
}

test.describe('2048 gameplay and resume', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ key, run }) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(run))
      }
    }, { key: SAVE_KEY, run: INITIAL_RUN })
    await page.goto('/2048')
    await expectRenderedBoard(page, INITIAL_RUN)
    await expect(page.getByTestId('score-readout')).toHaveText('Score 0, best 0, 3 undos left')
  })

  test('merges, resumes the exact run, and keeps undo and deterministic spawning after reload', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'chromium-mobile-375'
    await moveLeft(page, mobile)
    await expect(page.getByTestId('score-readout')).toHaveText('Score 4, best 4, 3 undos left')
    await expect.poll(() => savedRun(page)).toMatchObject({ score: 4, moves: 1, history: [{
      board: INITIAL_RUN.board, score: 0, randomSeed: INITIAL_RUN.randomSeed,
    }] })
    const moved = await savedRun(page)
    expect(moved.board.tiles).toHaveLength(2)
    expect(moved.board.tiles).toContainEqual({ id: 1, value: 4, row: 0, column: 0 })
    expect(moved.randomSeed).not.toBe(INITIAL_RUN.randomSeed)
    await expectRenderedBoard(page, moved)

    await page.reload()
    await expectRenderedBoard(page, moved)
    await expect(page.getByTestId('score-readout')).toHaveText('Score 4, best 4, 3 undos left')
    await expect.poll(() => savedRun(page)).toEqual(moved)

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByTestId('score-readout')).toHaveText('Score 0, best 4, 2 undos left')
    await expectRenderedBoard(page, INITIAL_RUN)
    await expect.poll(() => savedRun(page)).toMatchObject({ moves: 0, undosRemaining: 2, history: [] })
    const undone = await savedRun(page)

    await page.reload()
    await expectRenderedBoard(page, undone)
    await expect(page.getByTestId('score-readout')).toHaveText('Score 0, best 4, 2 undos left')
    await expect.poll(() => savedRun(page)).toEqual(undone)
    await moveLeft(page, mobile)
    await expect.poll(() => savedRun(page)).toMatchObject({
      board: moved.board, randomSeed: moved.randomSeed, score: 4, moves: 1, undosRemaining: 2,
    })
    await expectRenderedBoard(page, moved)
  })

  test('cancels a reset, confirms a new size, and preserves board-specific bests and the selected size', async ({ page }, testInfo) => {
    await moveLeft(page, testInfo.project.name === 'chromium-mobile-375')
    await expect(page.getByTestId('score-readout')).toHaveText('Score 4, best 4, 3 undos left')
    await expect.poll(() => savedRun(page)).toMatchObject({ score: 4, moves: 1 })
    const moved = await savedRun(page)
    await page.getByRole('button', { name: 'New game', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Start a new game' })).toBeVisible()
    await page.getByTestId('cancel-new-game-button').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expectRenderedBoard(page, moved)
    await expect.poll(() => savedRun(page)).toEqual(moved)

    await page.getByTestId('board-size-5').click()
    await expect(page.getByRole('dialog', { name: 'Start a new game' })).toContainText('Start a new 5×5 game?')
    await page.getByTestId('confirm-new-game-button').click()
    await expect(page.getByTestId('score-readout')).toHaveText('Score 0, best 0, 3 undos left')
    await expect.poll(() => savedRun(page)).toMatchObject({ board: { size: 5 }, moves: 0, score: 0, history: [] })
    const fresh = await savedRun(page)
    expect(fresh.board.tiles).toHaveLength(2)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bwh.2048.progress.v1') ?? 'null')))
      .toMatchObject({ gamesPlayed: 1, boards: { 4: { bestScore: 4, highestTile: 4 } } })

    await page.reload()
    await expect(page.getByTestId('board-size-5')).toHaveAttribute('aria-pressed', 'true')
    await expectRenderedBoard(page, fresh)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect.poll(() => savedRun(page)).toEqual(fresh)
  })
})
