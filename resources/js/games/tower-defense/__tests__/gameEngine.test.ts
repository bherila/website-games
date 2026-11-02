import { ELEMENTS, ENEMIES, heroMagnet, heroSpeed, TOWERS, towerStats, upgradeCost } from '../catalog'
import {
  buildingAtCell,
  buyHeroUpgrade,
  callNextWave,
  cancelPlan,
  COIN_LIFETIME_SECONDS,
  computeStars,
  createGameState,
  drainEvents,
  moveHero,
  orderBuild,
  orderUpgrade,
  pickElement,
  placementProblem,
  previewPaths,
  sellBuilding,
  setHeroInput,
  tickGame,
} from '../gameEngine'
import { COLS, type Enemy, type EnemyKind, type GameEvent, type GameState, type LevelDef, ROWS } from '../gameTypes'

const STEP = 1 / 30
const OPEN = '.............'

function testLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 1,
    title: 'Test',
    theme: 'meadow',
    waves: 3,
    startGold: 500,
    hpScale: 1,
    countScale: 1,
    picksAfter: [],
    elementOrder: ['fire'],
    map: ['......S......', ...new Array<string>(ROWS - 2).fill(OPEN), '......E......'],
    ...overrides,
  }
}

function advance(state: GameState, seconds: number): GameEvent[] {
  const events: GameEvent[] = []
  for (let elapsed = 0; elapsed < seconds && state.status === 'playing'; elapsed += STEP) {
    tickGame(state, STEP)
    events.push(...drainEvents(state))
  }

  return events
}

function advanceUntil(state: GameState, done: () => boolean, limit = 60): void {
  for (let elapsed = 0; elapsed < limit; elapsed += STEP) {
    if (done()) {
      return
    }
    tickGame(state, STEP)
  }
  throw new Error('condition never became true')
}

/** Puts a finished building straight on the board, skipping the hero's walk. */
function place(state: GameState, tower: Parameters<typeof orderBuild>[1], col: number, row: number): void {
  state.gold += TOWERS[tower].costs[0]
  if (TOWERS[tower].element) {
    state.unlocked = [...state.unlocked, TOWERS[tower].element]
  }
  expect(orderBuild(state, tower, col, row)).toBe(true)
  state.hero.x = col + 0.5
  state.hero.y = row - 0.5
  advanceUntil(state, () => buildingAtCell(state, col, row)?.progress === 1)
}

function addEnemy(state: GameState, kind: EnemyKind, x: number, y: number): Enemy {
  const def = ENEMIES[kind]
  const enemy: Enemy = {
    id: state.nextId++, kind, element: null, x, y, offsetX: 0, offsetY: 0, hp: def.hp, maxHp: def.hp, armor: def.armor, speed: def.speed, attack: def.attack,
    coins: def.coins, lives: def.lives, flying: def.flying, breaker: def.breaker, slowTimer: 0, slowFactor: 1, burnTimer: 0, burnDps: 0, poisonTimer: 0, poisonStacks: 0,
    poisonDps: 0, nextCol: 0, nextRow: 0, routedVersion: -1, routedCell: -1, attackingId: null, distanceToExit: Infinity, heading: 0, walk: 0,
  }
  state.enemies.push(enemy)

  return enemy
}

/** A row of walls straight across the board, so the only way through is to break it. */
function sealRow(state: GameState, row: number): void {
  for (let col = 0; col < COLS; col += 1) {
    place(state, 'wall', col, row)
  }
}

/** Keeps the first wave from arriving during a test that does not want it. */
function holdWaves(state: GameState): void {
  state.nextWaveIn = 1_000
}

describe('the hero builds', () => {
  it('pays when the order is given, then runs over and raises the tower', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    const startX = state.hero.x
    const startY = state.hero.y
    expect(orderBuild(state, 'arrow', 3, 3)).toBe(true)
    expect(state.gold).toBe(500 - TOWERS.arrow.costs[0])
    expect(buildingAtCell(state, 3, 3)).toBeNull()

    advance(state, 0.5)
    expect(Math.hypot(state.hero.x - startX, state.hero.y - startY)).toBeGreaterThan(1)
    expect(buildingAtCell(state, 3, 3)).toBeNull()

    advanceUntil(state, () => buildingAtCell(state, 3, 3)?.progress === 1)
    expect(state.plans).toHaveLength(0)
    expect(Math.hypot(state.hero.x - 3.5, state.hero.y - 3.5)).toBeLessThan(1.6)
  })

  it('runs to a tapped spot first and picks the queue back up afterwards', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    orderBuild(state, 'wall', 2, 10)
    moveHero(state, 11.5, 15.5)
    advanceUntil(state, () => state.hero.moveTarget === null)
    expect(Math.hypot(state.hero.x - 11.5, state.hero.y - 15.5)).toBeLessThan(0.2)
    expect(buildingAtCell(state, 2, 10)).toBeNull()
    advanceUntil(state, () => buildingAtCell(state, 2, 10)?.progress === 1)
  })

  it('takes a queued job back for a full refund', () => {
    const state = createGameState(testLevel())
    orderBuild(state, 'arrow', 3, 3)
    const plan = state.plans[0]
    expect(plan && cancelPlan(state, plan.id)).toBe(true)
    expect(state.gold).toBe(500)
    expect(state.plans).toHaveLength(0)
  })

  it('refuses terrain, the keep\'s surroundings, taken cells, locked towers and empty pockets', () => {
    const state = createGameState(testLevel({ map: ['......S......', '#............', '~............', ...new Array<string>(ROWS - 4).fill(OPEN), '......E......'], startGold: 40 }))
    expect(placementProblem(state, 'wall', 0, 1)).toBe('terrain')
    expect(placementProblem(state, 'wall', 0, 2)).toBe('terrain')
    expect(placementProblem(state, 'wall', 6, 19)).toBe('terrain')
    expect(placementProblem(state, 'ember', 3, 3)).toBe('locked')
    expect(orderBuild(state, 'arrow', 3, 3)).toBe(true)
    expect(placementProblem(state, 'wall', 3, 3)).toBe('occupied')
    expect(placementProblem(state, 'arrow', 4, 3)).toBe('gold')
  })

  it('climbs out rather than being walled in', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    for (const [col, row] of [[4, 9], [5, 9], [6, 9], [4, 10], [6, 10], [4, 11], [5, 11], [6, 11]] as const) {
      place(state, 'wall', col, row)
    }
    state.hero.x = 5.5
    state.hero.y = 10.5
    moveHero(state, 11.5, 18.5)
    advanceUntil(state, () => state.hero.moveTarget === null)
    expect(Math.hypot(state.hero.x - 11.5, state.hero.y - 18.5)).toBeLessThan(0.2)
  })

  it('can be steered directly but not into rock', () => {
    const state = createGameState(testLevel({ map: ['......S......', ...new Array<string>(9).fill(OPEN), '#############', ...new Array<string>(9).fill(OPEN), '......E......'] }))
    holdWaves(state)
    state.hero.x = 5.5
    state.hero.y = 8.5
    setHeroInput(state, 0, 1)
    advance(state, 2)
    expect(state.hero.y).toBeLessThan(10)
    expect(state.hero.y).toBeGreaterThan(9.5)
    setHeroInput(state, 1, 0)
    advance(state, 0.5)
    expect(state.hero.x).toBeGreaterThan(6)
  })
})

describe('enemies and the maze', () => {
  it('walk around walls while a way through exists, and the path gets longer', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    const routeLength = (): number => state.openField[6] ?? Infinity
    const direct = routeLength()
    for (let col = 0; col < COLS - 1; col += 1) {
      place(state, 'wall', col, 10)
    }
    expect(state.pathBlocked).toBe(false)
    expect(routeLength()).toBeGreaterThan(direct + 2)

    const enemy = addEnemy(state, 'grunt', 6.5, 0.5)
    const healthyWalls = state.buildings.map((building) => building.hp)
    advanceUntil(state, () => enemy.y > 11 || state.enemies.length === 0, 90)
    expect(enemy.attackingId).toBeNull()
    expect(state.buildings.map((building) => building.hp)).toEqual(healthyWalls)
    // It came through the one gap.
    expect(enemy.x).toBeGreaterThan(COLS - 3)
  })

  it('attack what blocks them, break through, then carry on to the keep', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    sealRow(state, 10)
    expect(state.pathBlocked).toBe(true)
    expect(previewPaths(state)[0]?.blocked).toBe(true)

    const enemy = addEnemy(state, 'grunt', 6.5, 8.5)
    const events: GameEvent[] = []
    for (let elapsed = 0; elapsed < 40 && enemy.attackingId === null; elapsed += STEP) {
      tickGame(state, STEP)
      events.push(...drainEvents(state))
    }
    const target = state.buildings.find((building) => building.id === enemy.attackingId)
    expect(target?.tower).toBe('wall')
    expect(enemy.y).toBeLessThan(10)

    for (let elapsed = 0; elapsed < 40 && state.buildings.includes(target as never); elapsed += STEP) {
      tickGame(state, STEP)
      events.push(...drainEvents(state))
    }
    expect(events.some((event) => event.type === 'destroyed')).toBe(true)
    expect(state.pathBlocked).toBe(false)

    const lives = state.lives
    advanceUntil(state, () => state.lives < lives, 60)
    expect(state.lives).toBe(lives - 1)
  })

  it('attack the weakest point of a sealed line', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    sealRow(state, 10)
    const strong = state.buildings.filter((building) => building.col !== 2)
    for (const building of strong) {
      building.hp = 5_000
      building.maxHp = 5_000
    }
    // Force the breach field to see the new health.
    state.gridDirty = true
    tickGame(state, STEP)
    const enemy = addEnemy(state, 'grunt', 6.5, 8.5)
    advanceUntil(state, () => enemy.attackingId !== null, 40)
    expect(state.buildings.find((building) => building.id === enemy.attackingId)?.col).toBe(2)
  })

  it('never step onto a building or stop short of attacking it', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    sealRow(state, 10)
    const enemies = [1.5, 3.2, 5.5, 8.3, 11.7].map((x) => addEnemy(state, 'grunt', x, 4.5))
    for (let elapsed = 0; elapsed < 15; elapsed += STEP) {
      tickGame(state, STEP)
      for (const enemy of enemies) {
        expect(buildingAtCell(state, Math.floor(enemy.x), Math.floor(enemy.y))).toBeNull()
      }
    }
    expect(enemies.filter((enemy) => enemy.attackingId !== null).length).toBeGreaterThan(0)
  })

  it('sappers smash through a maze that other walkers go around', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    for (let col = 0; col < COLS - 1; col += 1) {
      place(state, 'wall', col, 10)
    }
    const grunt = addEnemy(state, 'grunt', 3.5, 8.5)
    const sapper = addEnemy(state, 'sapper', 3.5, 8.5)
    advanceUntil(state, () => sapper.attackingId !== null, 10)
    expect(grunt.attackingId).toBeNull()
    expect(state.pathBlocked).toBe(false)
  })

  it('flyers ignore walls entirely', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    sealRow(state, 10)
    addEnemy(state, 'flyer', 6.5, 8.5)
    const hp = state.buildings.map((building) => building.hp)
    const lives = state.lives
    advanceUntil(state, () => state.lives < lives, 30)
    expect(state.buildings.map((building) => building.hp)).toEqual(hp)
  })

  it('wait for a walker to leave before the hero builds on its cell', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    state.hero.x = 3.5
    state.hero.y = 5.5
    const enemy = addEnemy(state, 'grunt', 3.5, 6.5)
    enemy.speed = 0
    orderBuild(state, 'wall', 3, 6)
    advance(state, 1.5)
    expect(buildingAtCell(state, 3, 6)).toBeNull()
    enemy.speed = ENEMIES.grunt.speed
    advanceUntil(state, () => buildingAtCell(state, 3, 6)?.progress === 1, 10)
  })
})

describe('coins', () => {
  function killOne(state: GameState, kind: EnemyKind = 'grunt'): void {
    const enemy = addEnemy(state, kind, 6.5, 5.5)
    enemy.hp = 1
    enemy.burnTimer = 1
    enemy.burnDps = 100
    advanceUntil(state, () => !state.enemies.includes(enemy), 2)
  }

  it('drop where the enemy died, worth its full bounty, and the hero must collect them', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    state.hero.x = 1.5
    state.hero.y = 18.5
    const before = state.gold
    killOne(state)
    expect(state.gold).toBe(before)
    expect(state.coins.length).toBeGreaterThan(0)
    expect(state.coins.reduce((sum, coin) => sum + coin.value, 0)).toBe(ENEMIES.grunt.coins)
    for (const coin of state.coins) {
      expect(Math.hypot(coin.x - 6.5, coin.y - 5.5)).toBeLessThan(1)
    }

    moveHero(state, 6.5, 5.5)
    advanceUntil(state, () => state.coins.length === 0, 15)
    expect(state.gold).toBe(before + ENEMIES.grunt.coins)
    expect(state.goldCollected).toBe(ENEMIES.grunt.coins)
  })

  it('sweep up automatically when the hero is idle and close', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    state.hero.x = 6.5
    state.hero.y = 8
    killOne(state, 'boss')
    advanceUntil(state, () => state.coins.length === 0, 8)
    expect(state.gold).toBe(500 + ENEMIES.boss.coins)
  })

  it('fade away if nobody comes', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    state.hero.x = 1.5
    state.hero.y = 18.5
    killOne(state)
    advance(state, COIN_LIFETIME_SECONDS + 1)
    expect(state.coins).toHaveLength(0)
    expect(state.goldExpired).toBe(ENEMIES.grunt.coins)
    expect(state.gold).toBe(500)
  })

  it('never lands on water, where the hero could not reach it', () => {
    const lake = ['......S......', ...new Array<string>(5).fill(OPEN), ...new Array<string>(9).fill('~~~~~~~~~~~~~').map((row, index) => (index === 4 ? '~~~~~~~~~~~~.' : row)), ...new Array<string>(5).fill(OPEN), '......E......']
    const state = createGameState(testLevel({ map: lake }))
    holdWaves(state)
    const enemy = addEnemy(state, 'flyer', 6.5, 10.5)
    enemy.hp = 1
    enemy.burnTimer = 1
    enemy.burnDps = 100
    advanceUntil(state, () => !state.enemies.includes(enemy), 2)
    for (const coin of state.coins) {
      expect(state.terrain[(Math.floor(coin.y) * COLS) + Math.floor(coin.x)]).not.toBe('water')
    }
  })

  it('magnet upgrades reach further and boots run faster', () => {
    const state = createGameState(testLevel())
    expect(heroMagnet(1)).toBeGreaterThan(heroMagnet(0))
    expect(heroSpeed(1)).toBeGreaterThan(heroSpeed(0))
    expect(buyHeroUpgrade(state, 'boots')).toBe(true)
    expect(buyHeroUpgrade(state, 'magnet')).toBe(true)
    expect(state.hero.speedLevel).toBe(1)
    expect(state.hero.magnetLevel).toBe(1)
    expect(state.gold).toBe(500 - 40 - 30)
    state.gold = 0
    expect(buyHeroUpgrade(state, 'boots')).toBe(false)
  })
})

describe('towers', () => {
  it('shoot what comes into range and upgrades make them stronger', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    place(state, 'arrow', 8, 6)
    const enemy = addEnemy(state, 'grunt', 6.5, 5.5)
    enemy.speed = 0
    enemy.maxHp = enemy.hp = 10_000
    advance(state, 3.5)
    const dealtTierOne = 10_000 - enemy.hp
    expect(dealtTierOne).toBeGreaterThan(TOWERS.arrow.damage)

    const building = buildingAtCell(state, 8, 6)
    expect(building).not.toBeNull()
    const cost = upgradeCost('arrow', 1)
    const gold = state.gold
    expect(building && orderUpgrade(state, building.id)).toBe(true)
    expect(state.gold).toBe(gold - (cost ?? 0))
    advanceUntil(state, () => building?.tier === 2, 10)
    expect(building?.invested).toBe(TOWERS.arrow.costs[0] + (cost ?? 0))

    enemy.hp = 10_000
    advance(state, 3.5)
    expect(10_000 - enemy.hp).toBeGreaterThan(dealtTierOne * 1.5)
  })

  it('stop at the top tier and refund part of what was spent when sold', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    place(state, 'arrow', 8, 6)
    const building = buildingAtCell(state, 8, 6)
    if (!building) {
      throw new Error('no building')
    }
    for (const tier of [2, 3]) {
      expect(orderUpgrade(state, building.id)).toBe(true)
      advanceUntil(state, () => building.tier === tier, 10)
    }
    expect(orderUpgrade(state, building.id)).toBe(false)
    const invested = TOWERS.arrow.costs.reduce((sum, cost) => sum + cost, 0)
    expect(building.invested).toBe(invested)
    const gold = state.gold
    expect(sellBuilding(state, building.id)).toBe(true)
    expect(state.gold).toBe(gold + Math.floor(invested * 0.7))
    expect(buildingAtCell(state, 8, 6)).toBeNull()
  })

  it('refund a queued upgrade if the tower dies first', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    place(state, 'wall', 8, 6)
    const building = buildingAtCell(state, 8, 6)
    if (!building) {
      throw new Error('no building')
    }
    state.hero.x = 1.5
    state.hero.y = 18.5
    orderUpgrade(state, building.id)
    const gold = state.gold
    expect(sellBuilding(state, building.id)).toBe(true)
    expect(state.gold).toBe(gold + (upgradeCost('wall', 1) ?? 0) + Math.floor(TOWERS.wall.costs[0] * 0.7))
    expect(state.plans).toHaveLength(0)
  })

  it('apply elemental strengths and weaknesses', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    const damageWith = (element: 'nature' | 'water' | 'earth'): number => {
      const fresh = createGameState(testLevel())
      holdWaves(fresh)
      place(fresh, 'ember', 8, 6)
      const enemy = addEnemy(fresh, 'grunt', 6.5, 5.5)
      enemy.speed = 0
      enemy.element = element
      enemy.hp = 10_000
      advance(fresh, 1.5)

      return 10_000 - enemy.hp
    }
    expect(ELEMENTS.fire.strongAgainst).toBe('nature')
    expect(damageWith('nature')).toBeGreaterThan(damageWith('earth'))
    expect(damageWith('earth')).toBeGreaterThan(damageWith('water'))
    expect(state.status).toBe('playing')
  })

  it('frost slows, burn and poison tick through armour, and ground towers ignore flyers', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    place(state, 'frost', 8, 6)
    const chilled = addEnemy(state, 'grunt', 6.5, 5.5)
    chilled.hp = 10_000
    advance(state, 1.5)
    expect(chilled.slowTimer).toBeGreaterThan(0)
    expect(chilled.slowFactor).toBeLessThan(1)

    const thorn = createGameState(testLevel())
    holdWaves(thorn)
    place(thorn, 'thorn', 8, 6)
    const armoured = addEnemy(thorn, 'boss', 6.5, 5.5)
    armoured.speed = 0
    armoured.hp = 10_000
    armoured.armor = 1_000
    advance(thorn, 3)
    expect(armoured.poisonStacks).toBeGreaterThan(1)
    // Each hit does at most 1 through this armour, so the rest of the damage is poison.
    expect(10_000 - armoured.hp).toBeGreaterThan(armoured.poisonStacks * 2)

    const boulder = createGameState(testLevel())
    holdWaves(boulder)
    place(boulder, 'boulder', 8, 6)
    const flyer = addEnemy(boulder, 'flyer', 6.5, 5.5)
    flyer.speed = 0
    flyer.hp = 1_000
    advance(boulder, 4)
    expect(flyer.hp).toBe(1_000)
  })

  it('sun beams leap between enemies', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    place(state, 'sun', 8, 6)
    const enemies = [5.5, 6.2, 6.9, 7.6].map((x) => {
      const enemy = addEnemy(state, 'brute', x, 4.5)
      enemy.speed = 0
      enemy.armor = 0

      return enemy
    })
    const events = advance(state, 0.5)
    const beam = events.find((event) => event.type === 'beam')
    expect(beam?.type === 'beam' ? beam.points.length : 0).toBe(4)
    expect(enemies.filter((enemy) => enemy.hp < enemy.maxHp)).toHaveLength(3)
  })

  it('stats improve each tier', () => {
    for (const tower of ['arrow', 'ember', 'frost', 'thorn', 'boulder', 'sun', 'hex'] as const) {
      expect(towerStats(tower, 2).damage).toBeGreaterThan(towerStats(tower, 1).damage)
      expect(towerStats(tower, 3).damage).toBeGreaterThan(towerStats(tower, 2).damage)
      expect(towerStats(tower, 3).range).toBeGreaterThan(towerStats(tower, 1).range)
    }
    expect(towerStats('wall', 3).hp).toBeGreaterThan(towerStats('wall', 1).hp)
  })
})

describe('waves and the end of the game', () => {
  it('counts down, sends waves in order, and pays a bonus for calling one early', () => {
    const state = createGameState(testLevel())
    const events = advance(state, 1)
    expect(events.some((event) => event.type === 'waveStart')).toBe(false)
    const gold = state.gold
    const bonus = callNextWave(state)
    expect(bonus).toBeGreaterThan(0)
    expect(state.gold).toBe(gold + (bonus ?? 0))
    expect(state.waveNumber).toBe(1)
    expect(callNextWave(state)).toBeNull()
    advance(state, 1)
    expect(state.enemies.length).toBeGreaterThan(0)
  })

  it('stops for an element choice, and only unlocked towers can be built', () => {
    const state = createGameState(testLevel({ picksAfter: [0, 1] }))
    expect(state.pendingPicks).toBe(1)
    const clock = state.clock
    advance(state, 1)
    expect(state.clock).toBe(clock)
    expect(orderBuild(state, 'ember', 3, 3)).toBe(false)
    expect(callNextWave(state)).toBeNull()
    expect(pickElement(state, 'fire')).toBe(true)
    expect(pickElement(state, 'fire')).toBe(false)
    expect(orderBuild(state, 'ember', 3, 3)).toBe(true)
    callNextWave(state)
    advanceUntil(state, () => state.pendingPicks === 1, 30)
    expect(pickElement(state, 'fire')).toBe(false)
    expect(pickElement(state, 'water')).toBe(true)
    expect(state.unlocked).toEqual(['fire', 'water'])
  })

  it('wins once every wave is beaten, however many coins are left', () => {
    const state = createGameState(testLevel({ waves: 1, hpScale: 0.01, startGold: 1000 }))
    state.hero.x = 6.5
    state.hero.y = 3
    for (const [col, row] of [[4, 3], [8, 3], [4, 5], [8, 5], [4, 7], [8, 7], [4, 9], [8, 9]] as const) {
      orderBuild(state, 'arrow', col, row)
    }
    advanceUntil(state, () => state.plans.length === 0, 40)
    callNextWave(state)
    advanceUntil(state, () => state.status !== 'playing', 90)
    expect(state.status).toBe('won')
    expect(state.lives).toBe(20)
    expect(computeStars(state)).toBe(3)
  })

  it('loses when the lives run out, and the stars follow the lives kept', () => {
    const state = createGameState(testLevel())
    holdWaves(state)
    state.lives = 1
    addEnemy(state, 'grunt', 6.5, 19.5)
    advanceUntil(state, () => state.status !== 'playing', 5)
    expect(state.status).toBe('lost')
    expect(state.lives).toBe(0)

    const stars = createGameState(testLevel())
    stars.lives = 18
    expect(computeStars(stars)).toBe(3)
    stars.lives = 17
    expect(computeStars(stars)).toBe(2)
    stars.lives = 10
    expect(computeStars(stars)).toBe(2)
    stars.lives = 9
    expect(computeStars(stars)).toBe(1)
  })

  it('does nothing further once the game is over', () => {
    const state = createGameState(testLevel())
    state.status = 'lost'
    expect(orderBuild(state, 'arrow', 3, 3)).toBe(false)
    expect(callNextWave(state)).toBeNull()
    const clock = state.clock
    tickGame(state, STEP)
    expect(state.clock).toBe(clock)
  })

  it('replays exactly from the same seed', () => {
    const run = (): string => {
      const state = createGameState(testLevel({ waves: 2 }), 42)
      orderBuild(state, 'arrow', 5, 6)
      orderBuild(state, 'arrow', 8, 8)
      callNextWave(state)
      advance(state, 20)

      return JSON.stringify({ enemies: state.enemies, coins: state.coins, gold: state.gold, lives: state.lives })
    }
    expect(run()).toBe(run())
  })
})
