import { applyMove } from '../engine/applyMove'
import type { EngineEvent, GameState, MoveResult } from '../engine/types'
import { starsForMoves } from '../gameTypes'
import type { ChicksLevelDef } from '../levels/levelTypes'
import { SOLUTION_CHAR_TO_INTENT } from '../levels/levelTypes'
import { parseLevel } from '../levels/parseLevel'
import { replaySolution } from '../levels/replay'

function level(grid: readonly string[], extra: Partial<ChicksLevelDef> = {}): GameState {
  return parseLevel({ id: 99, title: 'fixture', par: 1, solution: 'U', grid, ...extra })
}

interface RunOutcome {
  state: GameState
  events: EngineEvent[]
  last: MoveResult
}

function run(initial: GameState, inputs: string): RunOutcome {
  let state = initial
  const events: EngineEvent[] = []
  let last: MoveResult = { state, events: [], accepted: true }

  for (const char of inputs) {
    const intent = SOLUTION_CHAR_TO_INTENT[char as keyof typeof SOLUTION_CHAR_TO_INTENT]
    if (!intent) {
      throw new Error(`bad test input '${char}'`)
    }
    last = applyMove(state, intent)
    state = last.state
    events.push(...last.events)
  }

  return { state, events, last }
}

function eventTypes(outcome: RunOutcome): string[] {
  return outcome.events.map((event) => event.type)
}

describe('basic movement & move counting', () => {
  test('accepted step moves the player and counts one move', () => {
    const outcome = run(level(['#####', '#@..#', '#####']), 'R')
    expect(outcome.state.player.pos).toEqual({ x: 2, y: 1 })
    expect(outcome.state.moves).toBe(1)
  })

  test('bumping a wall is rejected: no move counted, monsters frozen', () => {
    const state = level(['#####', '#@..#', '#O..#', '#####'], { facingOverrides: { '1,2': 'right' } })
    const outcome = run(state, 'L')
    expect(outcome.last.accepted).toBe(false)
    expect(outcome.state.moves).toBe(0)
    expect(outcome.state.monsters[0]?.pos).toEqual({ x: 1, y: 2 })
    expect(eventTypes(outcome)).toEqual(['bumped'])
  })

  test('wait costs a move and advances monsters', () => {
    const state = level(['#####', '#@..#', '#O..#', '#####'], { facingOverrides: { '1,2': 'right' } })
    const outcome = run(state, 'W')
    expect(outcome.state.moves).toBe(1)
    expect(outcome.state.monsters[0]?.pos).toEqual({ x: 2, y: 2 })
  })

  test('no input is accepted after winning', () => {
    const won = run(level(['####', '#@E#', '####']), 'R')
    expect(won.state.won).toBe(true)
    expect(applyMove(won.state, 'left').accepted).toBe(false)
  })
})

describe('chips, socket, exit', () => {
  test('socket blocks while chips remain and opens at zero', () => {
    const blocked = run(level(['#######', '#@S.c.#', '#######']), 'R')
    expect(blocked.last.accepted).toBe(false)

    const cleared = run(level(['#######', '#@cS.E#', '#######']), 'RRRR')
    expect(cleared.state.won).toBe(true)
    expect(eventTypes(cleared)).toContain('socketOpened')
    expect(cleared.events.at(-1)).toEqual({ type: 'won', moves: 4 })
  })
})

describe('keys & doors', () => {
  test('red key is consumed; second red door blocks', () => {
    const outcome = run(level(['######', '#@rRR#', '######']), 'RRR')
    expect(outcome.state.keys.red).toBe(0)
    expect(outcome.last.accepted).toBe(false)
    expect(outcome.state.player.pos).toEqual({ x: 3, y: 1 })
  })

  test('green key opens unlimited green doors', () => {
    const outcome = run(level(['#######', '#@gGG.#', '#######']), 'RRRR')
    expect(outcome.state.keys.green).toBe(1)
    expect(outcome.state.player.pos).toEqual({ x: 5, y: 1 })
  })
})

describe('elements, boots, thief', () => {
  test('water drowns without flippers', () => {
    const outcome = run(level(['####', '#@~#', '####']), 'R')
    expect(outcome.state.alive).toBe(false)
    expect(outcome.state.deathCause).toBe('drowned')
  })

  test('flippers cross water; fire burns without fire boots', () => {
    const swim = run(level(['######', '#@f~.#', '######']), 'RRR')
    expect(swim.state.alive).toBe(true)
    expect(swim.state.player.pos).toEqual({ x: 4, y: 1 })

    const burn = run(level(['####', '#@*#', '####']), 'R')
    expect(burn.state.deathCause).toBe('burned')
  })

  test('thief strips all boots', () => {
    const outcome = run(level(['######', '#@fZ.#', '######']), 'RR')
    expect(outcome.state.boots.flippers).toBe(false)
    expect(eventTypes(outcome)).toContain('bootsStolen')
  })

  test('dirt clears to floor for the player', () => {
    const outcome = run(level(['#####', '#@%.#', '#####']), 'R')
    expect(outcome.state.tiles[1 * 5 + 2]).toBe('floor')
    expect(eventTypes(outcome)).toContain('dirtCleared')
  })
})

describe('blocks', () => {
  test('single push works; double push is rejected', () => {
    const single = run(level(['######', '#@X..#', '######']), 'R')
    expect(single.state.blocks[0]?.pos).toEqual({ x: 3, y: 1 })
    expect(single.state.player.pos).toEqual({ x: 2, y: 1 })

    const double = run(level(['#######', '#@XX..#', '#######']), 'R')
    expect(double.last.accepted).toBe(false)
  })

  test('block into water splashes into a walkable floor', () => {
    const outcome = run(level(['######', '#@X~.#', '######']), 'RRR')
    expect(outcome.state.blocks).toHaveLength(0)
    expect(eventTypes(outcome)).toContain('splash')
    expect(outcome.state.player.pos).toEqual({ x: 4, y: 1 })
  })

  test('block pushed onto ice slides to rest', () => {
    const outcome = run(level(['########', '#@X55..#', '########']), 'R')
    expect(outcome.state.blocks[0]?.pos).toEqual({ x: 5, y: 1 })
  })

  test('block pushed onto an opposing force floor cannot re-enter the player tile', () => {
    const outcome = run(level(['#####', '#@X4#', '#####']), 'R')
    expect(outcome.state.player.pos).toEqual({ x: 2, y: 1 })
    expect(outcome.state.blocks[0]?.pos).toEqual({ x: 3, y: 1 })
  })
})

describe('ice & force floors', () => {
  test('ice slides to the far side in one move', () => {
    const outcome = run(level(['#######', '#@555.#', '#######']), 'R')
    expect(outcome.state.player.pos).toEqual({ x: 5, y: 1 })
    expect(outcome.state.moves).toBe(1)
  })

  test('blocked slide stops on the ice; player can walk back', () => {
    const outcome = run(level(['#####', '#@5##', '#####']), 'R')
    expect(outcome.state.player.pos).toEqual({ x: 2, y: 1 })
    const back = run(outcome.state, 'L')
    expect(back.state.player.pos).toEqual({ x: 1, y: 1 })
  })

  test('ice corner bends the slide; wall edges block entry', () => {
    const bend = run(level(['#####', '#7..#', '#@..#', '#####']), 'U')
    expect(bend.state.player.pos).toEqual({ x: 2, y: 1 })

    const blocked = run(level(['#####', '#@7.#', '#####']), 'R')
    expect(blocked.last.accepted).toBe(false)
  })

  test('skates neutralize ice', () => {
    const outcome = run(level(['#######', '#@k55.#', '#######']), 'RR')
    expect(outcome.state.player.pos).toEqual({ x: 3, y: 1 })
  })

  test('force floors carry; suction boots neutralize them', () => {
    const carried = run(level(['######', '#@66.#', '######']), 'R')
    expect(carried.state.player.pos).toEqual({ x: 4, y: 1 })

    const suction = run(level(['#######', '#@u66.#', '#######']), 'RR')
    expect(suction.state.player.pos).toEqual({ x: 3, y: 1 })
  })

  test('a closed force-floor loop terminates at the chain cap', () => {
    const outcome = run(level(['######', '#@62.#', '#.84.#', '######']), 'R')
    expect(outcome.last.accepted).toBe(true)
    expect(outcome.state.moves).toBe(1)
  })
})

describe('monsters', () => {
  test('ball ping-pongs off walls', () => {
    const state = level(['######', '#@...#', '#..O.#', '######'], { facingOverrides: { '3,2': 'right' } })
    const there = run(state, 'W')
    expect(there.state.monsters[0]?.pos).toEqual({ x: 4, y: 2 })
    const bounce = run(there.state, 'W')
    expect(bounce.state.monsters[0]).toMatchObject({ pos: { x: 3, y: 2 }, facing: 'left' })
  })

  test('bug follows the left-hand wall', () => {
    const state = level(['#####', '#...#', '#A.@#', '#####'])
    const first = run(state, 'W')
    expect(first.state.monsters[0]?.pos).toEqual({ x: 1, y: 1 })
    const second = run(first.state, 'W')
    expect(second.state.monsters[0]).toMatchObject({ pos: { x: 2, y: 1 }, facing: 'right' })
  })

  test('fireball turns right when blocked and dies in water', () => {
    const turning = run(level(['#####', '#F..#', '#..@#', '#####']), 'W')
    expect(turning.state.monsters[0]).toMatchObject({ pos: { x: 2, y: 1 }, facing: 'right' })

    const drowning = run(level(['#####', '#~..#', '#F.@#', '#####']), 'W')
    expect(drowning.state.monsters).toHaveLength(0)
    expect(eventTypes(drowning)).toContain('monsterDrowned')
  })

  test('tank drives forward only; blue button reverses it', () => {
    const state = level(['######', '#@=..#', '#..T.#', '######'], { facingOverrides: { '3,2': 'right' } })
    const forward = run(state, 'W')
    expect(forward.state.monsters[0]?.pos).toEqual({ x: 4, y: 2 })
    const parked = run(forward.state, 'W')
    expect(parked.state.monsters[0]?.pos).toEqual({ x: 4, y: 2 })
    const reversed = run(parked.state, 'R')
    expect(reversed.state.monsters[0]).toMatchObject({ pos: { x: 3, y: 2 }, facing: 'left' })
  })

  test('monster stepping into the player kills; player stepping into a monster kills', () => {
    const ambush = level(['#####', '#O@.#', '#####'], { facingOverrides: { '1,1': 'right' } })
    const ambushed = run(ambush, 'W')
    expect(ambushed.state.alive).toBe(false)
    expect(ambushed.state.deathCause).toBe('monster')

    const walkIn = run(level(['#####', '#@O.#', '#####']), 'R')
    expect(walkIn.state.alive).toBe(false)
    expect(walkIn.state.deathCause).toBe('monster')
  })
})

describe('machinery', () => {
  test('green button flips toggle walls (pressed by player)', () => {
    const state = level(['######', '#@(].#', '######'])
    const pressed = run(state, 'R')
    expect(pressed.state.tiles[1 * 6 + 3]).toBe('toggleClosed')
    expect(run(pressed.state, 'R').last.accepted).toBe(false)
  })

  test('a pushed block presses buttons', () => {
    const state = level(['#######', '#@X(].#', '#######'])
    const outcome = run(state, 'R')
    expect(eventTypes(outcome)).toContain('toggleFlipped')
    expect(outcome.state.tiles[1 * 7 + 4]).toBe('toggleClosed')
  })

  test('red button clones from the machine; blocked launch tile no-ops', () => {
    const def: Partial<ChicksLevelDef> = { cloneTemplates: { '2,2': { monster: 'ball', facing: 'right' } } }
    const state = level(['#######', '#@)...#', '#.M...#', '#######'], def)
    const spawned = run(state, 'R')
    expect(spawned.state.monsters).toHaveLength(1)
    expect(spawned.state.monsters[0]).toMatchObject({ kind: 'ball', pos: { x: 4, y: 2 }, facing: 'right' })

    const blockedDef: Partial<ChicksLevelDef> = { cloneTemplates: { '2,2': { monster: 'ball', facing: 'right' } } }
    const blocked = level(['#######', '#@)...#', '#.MX..#', '#######'], blockedDef)
    expect(run(blocked, 'R').state.monsters).toHaveLength(0)
  })

  test('popup wall rises after the player leaves it', () => {
    const state = level(['#####', '#@,.#', '#####'])
    const crossed = run(state, 'RR')
    expect(crossed.state.tiles[1 * 5 + 2]).toBe('wall')
    expect(eventTypes(crossed)).toContain('popupRaised')
    expect(run(crossed.state, 'L').last.accepted).toBe(false)
  })
})

describe('teleports', () => {
  test('exits from the next teleport in reading order, same direction', () => {
    const outcome = run(level(['#######', '#@+.+.#', '#######']), 'R')
    expect(outcome.state.player.pos).toEqual({ x: 5, y: 1 })
    expect(eventTypes(outcome)).toContain('teleported')
  })

  test('blocked exit falls through to the next teleport (wrapping to self)', () => {
    const outcome = run(level(['######', '#@+.+#', '######']), 'R')
    expect(outcome.state.player.pos).toEqual({ x: 3, y: 1 })
  })

  test('all exits blocked rejects the entering move', () => {
    const outcome = run(level(['#####', '#@+##', '#.+##', '#####']), 'R')
    expect(outcome.last.accepted).toBe(false)
    expect(outcome.state.player.pos).toEqual({ x: 1, y: 1 })
  })
})

describe('stars & replay harness', () => {
  test('starsForMoves thresholds honor the ceil boundaries', () => {
    expect(starsForMoves(10, 10)).toBe(3)
    expect(starsForMoves(11, 10)).toBe(3)
    expect(starsForMoves(12, 10)).toBe(2)
    expect(starsForMoves(15, 10)).toBe(2)
    expect(starsForMoves(16, 10)).toBe(1)
  })

  test('replaySolution proves a clean solution and derives par', () => {
    const def: ChicksLevelDef = {
      id: 99,
      title: 'fixture',
      grid: ['#####', '#@.E#', '#####'],
      par: 2,
      solution: 'RR',
    }
    const result = replaySolution(def)
    expect(result.failure).toBeNull()
    expect(result.won).toBe(true)
    expect(result.moves).toBe(2)
  })

  test('replaySolution reports diagnostics with an ASCII render on failure', () => {
    const def: ChicksLevelDef = {
      id: 99,
      title: 'fixture',
      grid: ['#####', '#@.E#', '#####'],
      par: 2,
      solution: 'RL',
    }
    const result = replaySolution(def)
    expect(result.won).toBe(false)
    expect(result.failure).toContain('without winning')
    expect(result.failure).toContain('#@.E#')
  })
})
