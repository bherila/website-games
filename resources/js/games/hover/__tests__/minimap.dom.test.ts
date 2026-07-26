import { type CraftState, type DroneBrain, type EngineState, type Flag, type Pod, type Trap } from '../gameTypes'
import { cellCenter, createMapDef, type MapTheme } from '../maps/mapTypes'
import { drawMinimap, MINIMAP_COLORS } from '../scene/minimap'

interface RectCall {
  x: number
  y: number
  w: number
  h: number
  fillStyle: string
}

interface ArcCall {
  x: number
  y: number
  radius: number
}

interface CtxStub {
  fillStyle: string
  strokeStyle: string
  globalAlpha: number
  lineWidth: number
  fillRectCalls: RectCall[]
  fillCalls: string[]
  arcCalls: ArcCall[]
  clearRect: jest.Mock
  fillRect: jest.Mock
  beginPath: jest.Mock
  arc: jest.Mock
  moveTo: jest.Mock
  lineTo: jest.Mock
  closePath: jest.Mock
  fill: jest.Mock
  stroke: jest.Mock
}

function createCtxStub(): CtxStub {
  const stub: CtxStub = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    fillRectCalls: [],
    fillCalls: [],
    arcCalls: [],
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
  }

  stub.fillRect = jest.fn((x: number, y: number, w: number, h: number) => {
    stub.fillRectCalls.push({ x, y, w, h, fillStyle: stub.fillStyle })
  })
  stub.arc = jest.fn((x: number, y: number, radius: number) => {
    stub.arcCalls.push({ x, y, radius })
  })
  stub.fill = jest.fn(() => {
    stub.fillCalls.push(stub.fillStyle)
  })

  return stub
}

const THEME: MapTheme = {
  name: 'test-theme',
  skyTopColor: 0x000000,
  skyBottomColor: 0x000000,
  fogColor: 0x000000,
  fogDensity: 0.01,
  floorColorA: 0x111111,
  floorColorB: 0x222222,
  wallColorA: 0x334455,
  wallColorB: 0x334455,
  lowWallColor: 0x112233,
  accentColor: 0xffffff,
  lightColor: 0xffffff,
  ambientIntensity: 1,
  directionalIntensity: 1,
  wallTexture: 'stone',
}

const MAP = createMapDef({
  id: 'castle',
  rows: ['#####', '#P.E#', '#.-.#', '#...#', '#####'],
  theme: THEME,
})

const FEATURE_MAP = createMapDef({
  id: 'castle',
  rows: ['#######', '#P....#', '#.=.^.#', '#..8..#', '#....E#', '#######'],
  theme: THEME,
})

function createCraft(overrides: Partial<CraftState> = {}): CraftState {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    heading: 0,
    angularVel: 0,
    altitude: 0,
    verticalVel: 0,
    airborne: false,
    radius: 1.1,
    speedEffect: null,
    hasJumpPower: false,
    stuckSec: 0,
    trapGraceSec: 0,
    arrowGraceSec: 0,
    ...overrides,
  }
}

const DRONE_BRAIN: DroneBrain = {
  path: [],
  waypointIndex: 0,
  targetFlagId: null,
  stallTimer: 0,
  repathCooldown: 0,
  reverseTimer: 0,
}

function createState(overrides: Partial<EngineState> = {}): EngineState {
  const flags: Flag[] = [
    { id: 1, team: 'blue', cell: { col: 1, row: 1 }, pos: { x: 6, z: 6 }, collected: false },
    { id: 2, team: 'red', cell: { col: 3, row: 1 }, pos: { x: 14, z: 6 }, collected: false },
    { id: 3, team: 'blue', cell: { col: 1, row: 3 }, pos: { x: 6, z: 14 }, collected: true },
  ]

  const pods: Pod[] = [
    { id: 1, kind: 'speedUp', cell: { col: 2, row: 3 }, pos: { x: 10, z: 14 }, active: true, respawnSec: 0 },
    { id: 2, kind: 'jump', cell: { col: 3, row: 3 }, pos: { x: 14, z: 14 }, active: false, respawnSec: 5 },
  ]

  return {
    map: MAP,
    cycle: 1,
    roundIndex: 0,
    lossesOnMap: 0,
    player: createCraft({ pos: { x: 6, z: 6 }, heading: 0 }),
    drone: createCraft({ pos: { x: 14, z: 6 }, heading: Math.PI }),
    droneBrain: DRONE_BRAIN,
    flags,
    pods,
    traps: [],
    score: 0,
    mapScore: 0,
    flagValue: 500,
    elapsedSec: 0,
    outcome: 'playing',
    prevJumpHeld: false,
    ...overrides,
  }
}

describe('drawMinimap', () => {
  it('draws wall rects for both high and low walls', () => {
    const ctx = createCtxStub()
    drawMinimap(ctx as unknown as CanvasRenderingContext2D, createState(), 200, 200)

    const highWallFill = ctx.fillRectCalls.some((call) => call.fillStyle === '#334455')
    const lowWallFill = ctx.fillRectCalls.some((call) => call.fillStyle === '#112233')

    expect(highWallFill).toBe(true)
    expect(lowWallFill).toBe(true)
  })

  it('draws only uncollected flags', () => {
    const ctx = createCtxStub()
    drawMinimap(ctx as unknown as CanvasRenderingContext2D, createState(), 200, 200)

    // 2 uncollected flags + 1 drone circle = 3 arc calls total
    expect(ctx.arcCalls).toHaveLength(3)
    expect(ctx.fillCalls).toContain(MINIMAP_COLORS.flagBlue)
    expect(ctx.fillCalls).toContain(MINIMAP_COLORS.flagRed)

    const collectedFlagPos = { x: 6, z: 14 }
    const drawnAtCollectedPos = ctx.arcCalls.some((call) => call.radius !== 3.5 && Math.abs(call.x - collectedFlagPos.x) < 0.001)
    expect(drawnAtCollectedPos).toBe(false)
  })

  it('skips inactive pods', () => {
    const ctx = createCtxStub()
    drawMinimap(ctx as unknown as CanvasRenderingContext2D, createState(), 200, 200)

    const podRects = ctx.fillRectCalls.filter((call) => call.w === 5 && call.h === 5)
    expect(podRects).toHaveLength(1)
    expect(podRects[0]?.fillStyle).toBe(MINIMAP_COLORS.podSpeedUp)
  })

  it('draws the player wedge on top', () => {
    const ctx = createCtxStub()
    drawMinimap(ctx as unknown as CanvasRenderingContext2D, createState(), 200, 200)

    expect(ctx.moveTo).toHaveBeenCalled()
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(ctx.closePath).toHaveBeenCalled()
    expect(ctx.fillCalls[ctx.fillCalls.length - 1]).toBe(MINIMAP_COLORS.player)
  })

  it('draws nothing for a zero-size rect', () => {
    const ctx = createCtxStub()
    drawMinimap(ctx as unknown as CanvasRenderingContext2D, createState(), 0, 200)

    expect(ctx.clearRect).not.toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it('draws platform/ramp tints, trap squares, and arrow-pad triangles', () => {
    const trap: Trap = { id: 1, cell: { col: 1, row: 3 }, pos: cellCenter(FEATURE_MAP, { col: 1, row: 3 }) }
    const ctx = createCtxStub()
    drawMinimap(ctx as unknown as CanvasRenderingContext2D, createState({ map: FEATURE_MAP, traps: [trap] }), 200, 200)

    const platformFill = ctx.fillRectCalls.some((call) => call.fillStyle === '#7a8591')
    const rampFill = ctx.fillRectCalls.some((call) => call.fillStyle === '#adb4bb')
    const trapFill = ctx.fillRectCalls.some((call) => call.fillStyle === MINIMAP_COLORS.trap)
    const arrowFill = ctx.fillCalls.includes(MINIMAP_COLORS.arrowPad)

    expect(platformFill).toBe(true)
    expect(rampFill).toBe(true)
    expect(trapFill).toBe(true)
    expect(arrowFill).toBe(true)
  })
})
