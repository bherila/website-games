import currency from 'currency.js'
import type { ReactElement } from 'react'

import { EXCAVATION_COST, itemDef, shaftDef, upgradesFor } from '../engine/catalog'
import { nightlyRoomIncome } from '../engine/economy'
import { isSlabFamily } from '../engine/grid'
import { repairCost } from '../engine/incidents'
import { isExcavated } from '../engine/mapGeometry'
import { CITY_TOWER, getMap } from '../engine/maps'
import type { EvalBreakdown } from '../engine/occupancy'
import { shaftIssues } from '../engine/shaftIssues'
import { weeklyTenantStress } from '../engine/tenantStress'
import { unitIssues } from '../engine/unitIssues'
import { floorLabel } from '../floorLabels'
import type {
  Car,
  DirectionPriority,
  ProgramSlot,
  RentTier,
  Shaft,
  ShaftProgram,
  StarLevel,
  Unit,
  VipRecord,
} from '../gameTypes'
import { defaultShaftProgram, TUNING } from '../gameTypes'
import type { HeatmapTileSample } from '../scene/heatmapLayer'
import { vipRecordDisplayName, vipReportLine, vipVisitIdForTarget } from '../vipFlavor'
import { DemolishControl } from './DemolishControl'
import { evalFactorLines } from './evalFactors'
import { programForPreset, SHAFT_PROGRAM_PRESETS, type ShaftProgramPresetId } from './shaftProgramPresets'

export type InspectSelection = { type: 'unit'; unit: Unit } | { type: 'shaft'; shaft: Shaft }

interface InspectPanelProps {
  selection: InspectSelection | null
  overlaySample?: HeatmapTileSample | null
  maxStarReached: StarLevel
  vipRecords?: readonly VipRecord[]
  /** Live desirability factor breakdown for the selected unit (recomputed each frame). */
  evalBreakdown?: EvalBreakdown | undefined
  /** Needed only to price lobby demolition exactly. */
  lobbyHeight?: 1 | 2 | 3
  /** Excavation pricing is map-relative, so the panel needs the active map. */
  mapId?: string
  onSetRentTier: (unitId: number, tier: RentTier) => void
  onApplyUpgrade: (unitId: number, upgradeId: string) => void
  onDemolish: (selection: InspectSelection) => void
  onAddCar: (shaftId: number) => void
  onSetStopEnabled: (shaftId: number, floor: number, enabled: boolean) => void
  onSetProgram: (shaftId: number, program: ShaftProgram) => void
  onSetCarHomeFloor: (shaftId: number, carIndex: number, floor: number | null) => void
  /** Optional until TowerGame wires the incident commands. */
  onPestControl?: (unitId: number) => void
  onRepair?: (unitId: number) => void
}

function heatmapSampleValue(sample: HeatmapTileSample): string {
  return sample.kind === 'noise'
    ? `${sample.value.toFixed(1)} exposure`
    : `${sample.value.toFixed(1)} min avg wait`
}

const PROGRAM_SLOTS: Array<{ slot: ProgramSlot; label: string }> = [
  { slot: 'morningRush', label: 'Morning rush' },
  { slot: 'daytime', label: 'Daytime' },
  { slot: 'eveningRush', label: 'Evening rush' },
  { slot: 'night', label: 'Night' },
]

const PRIORITIES: DirectionPriority[] = ['balanced', 'expressToTop', 'expressToBottom']

const RENT_TIERS: RentTier[] = ['low', 'avg', 'high']

/** Clinic copay levels reuse the rentTier field; higher copay earns more per visit. */
const COPAY_TIERS: Array<{ tier: RentTier; label: string }> = [
  { tier: 'low', label: 'Low' },
  { tier: 'avg', label: 'Std' },
  { tier: 'high', label: 'High' },
]

function money(value: number): string {
  return currency(value, { precision: 0 }).format()
}

function unitBuildCost(unit: Unit, lobbyHeight: 1 | 2 | 3, mapId: string): number {
  const map = getMap(mapId)
  const def = itemDef(unit.kind)
  if (unit.kind === 'slab') {
    return (isExcavated(map, unit.floor) ? EXCAVATION_COST : def.cost) * unit.width
  }
  if (unit.kind === 'lobby') {
    return def.cost * unit.width * lobbyHeight
  }
  return def.perTile ? def.cost * unit.width : def.cost
}

function shaftBuildCost(shaft: Shaft): number {
  const def = shaftDef(shaft.kind)
  return def.baseCost + def.costPerFloor * (shaft.topFloor - shaft.bottomFloor)
}

function shaftLimitLine(def: ReturnType<typeof shaftDef>): string {
  const parts: string[] = []
  if (def.maxStops !== undefined) {
    parts.push(`${def.maxStops} enabled stops max`)
  }
  if (def.maxReachFloors !== undefined) {
    parts.push(`${def.maxReachFloors} floors reach max`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'No special stop limit'
}

/** Short live-motion label for a car row: doors, travel direction, or idle. */
function carMotionLabel(car: Car): string {
  if (car.state === 'doors') {
    return '⇄ doors'
  }
  if (car.dir === 1) {
    return '▲ up'
  }
  if (car.dir === -1) {
    return '▼ down'
  }
  return '• idle'
}

/** An idle car sitting on its configured home floor (the state that speeds response). */
function carIsAtHome(car: Car): boolean {
  return car.dir === 0 && car.state === 'idle' && car.homeFloor !== null && Math.round(car.y) === car.homeFloor
}

function incomeLine(unit: Unit): string | null {
  const income = itemDef(unit.kind).income
  if (!income) {
    return null
  }
  switch (income.type) {
    case 'rent':
      return `${money(currency(income.perDay).multiply(TUNING.rent.incomeMultiplier[unit.rentTier]).value)}/day rent`
    case 'perVisit':
      if (unit.kind === 'medicalClinic') {
        return `${money(income.amount * TUNING.clinic.copayMultiplier[unit.rentTier])} copay/visit`
      }
      return `${money(income.amount)} per visit`
    case 'perNight':
      return `${money(nightlyRoomIncome(unit))} per night`
    case 'perEvent':
      return `${money(income.amount)} per event`
  }
}

function unitMaintenancePerDay(unit: Unit): number {
  const def = itemDef(unit.kind)
  return currency(def.maintPerDay)
    .multiply(def.perTile ? unit.width : 1)
    .value
}

function fixedDailyNet(unit: Unit, maintenance: number): number | null {
  const income = itemDef(unit.kind).income
  if (income?.type !== 'rent') {
    return null
  }

  return currency(income.perDay).multiply(TUNING.rent.incomeMultiplier[unit.rentTier]).subtract(maintenance).value
}

function UnitInspect({
  unit,
  maxStarReached,
  lobbyHeight,
  mapId,
  vipRecords,
  evalBreakdown,
  onSetRentTier,
  onApplyUpgrade,
  onPestControl,
  onRepair,
  onDemolish,
}: {
  unit: Unit
  maxStarReached: StarLevel
  lobbyHeight: 1 | 2 | 3
  mapId: string
  vipRecords: readonly VipRecord[]
  evalBreakdown?: EvalBreakdown | undefined
  onSetRentTier: InspectPanelProps['onSetRentTier']
  onApplyUpgrade: InspectPanelProps['onApplyUpgrade']
  onPestControl: InspectPanelProps['onPestControl']
  onRepair: InspectPanelProps['onRepair']
  onDemolish: () => void
}): ReactElement {
  const def = itemDef(unit.kind)
  const pop = unit.population
  const popTotal = pop.low + pop.med + pop.high + pop.vip
  const income = incomeLine(unit)
  const maintenance = unitMaintenancePerDay(unit)
  const dailyNet = fixedDailyNet(unit, maintenance)
  const upgrades = upgradesFor(unit.kind, maxStarReached)
  const refund = Math.round(TUNING.economy.demolitionRefundRate * unitBuildCost(unit, lobbyHeight, mapId))
  const issues = unitIssues(unit)
  const weeklyStress = weeklyTenantStress(unit)
  const factorLines = evalBreakdown ? evalFactorLines(evalBreakdown) : []
  const vipRecord = vipRecords.find((record) => record.state === 'resident' && record.unitId === unit.id)
  const vipReport = vipRecord?.lastReport[0]

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">{def.name}</h3>
        <span className="text-[11px] text-white/50">Floor {floorLabel(unit.floor)}</span>
      </div>

      {issues.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="issues">
          {issues.map((issue) => (
            <div
              key={issue.key}
              data-testid={`issue-${issue.key}`}
              data-severity={issue.severity}
              className={`rounded px-2 py-1 text-[12px] ${
                issue.severity === 'critical' ? 'bg-red-500/20 text-red-200' : 'bg-amber-500/20 text-amber-200'
              }`}
            >
              <div className="font-bold">
                <span aria-hidden="true">{issue.severity === 'critical' ? '🔴' : '🟡'}</span> {issue.label}
              </div>
              <div className="pt-0.5 text-white/70">{issue.hint}</div>
            </div>
          ))}
        </div>
      )}
      {vipRecord && (
        <div className="rounded border border-yellow-300/40 bg-yellow-400/10 px-2 py-1 text-[12px] text-yellow-100" data-testid="vip-resident">
          <div className="font-bold">VIP resident</div>
          <div className="text-yellow-100/80">{vipRecordDisplayName(vipRecord)}</div>
          {vipReport && (
            <div className="pt-0.5 text-yellow-100/70" data-testid="vip-report-line">
              {vipReportLine(vipRecord.target, vipVisitIdForTarget(vipRecord.target), vipReport)}
            </div>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        {def.capacity !== undefined && (
          <>
            <dt className="text-white/50">Occupancy</dt>
            <dd className="tabular-nums" data-testid="occupancy">
              {popTotal}/{def.capacity}
              {popTotal > 0 && (
                <span className="text-white/50">
                  {' '}
                  ({pop.low}L·{pop.med}M·{pop.high}H{pop.vip > 0 ? `·${pop.vip}V` : ''})
                </span>
              )}
            </dd>
          </>
        )}
        {isSlabFamily(unit.kind) ? (
          <>
            <dt className="text-white/50">Tiles</dt>
            <dd className="tabular-nums" data-testid="slab-width">
              {unit.width} × {money(unitBuildCost(unit, lobbyHeight, mapId) / unit.width)}
            </dd>
          </>
        ) : (
          <>
            <dt className="text-white/50">Desirability</dt>
            <dd className="tabular-nums" data-testid="eval-score">
              {Math.round(unit.evalScore)}/100
            </dd>
          </>
        )}
        {income && (
          <>
            <dt className="text-white/50">Income</dt>
            <dd data-testid="income-line">{income}</dd>
          </>
        )}
        {unit.kind !== 'slab' && (
          <>
            <dt className="text-white/50">Maintenance</dt>
            <dd className="tabular-nums" data-testid="maintenance-line">
              {money(maintenance)}/day
            </dd>
          </>
        )}
        {dailyNet !== null && (
          <>
            <dt className="text-white/50">Daily net</dt>
            <dd className="tabular-nums" data-testid="daily-net-line">
              {money(dailyNet)}/day
            </dd>
          </>
        )}
        {weeklyStress && (
          <>
            <dt className="text-white/50">Weekly stress</dt>
            <dd className="tabular-nums" data-testid="weekly-stress">
              {weeklyStress.marks}/{weeklyStress.threshold} marks
            </dd>
          </>
        )}
      </dl>

      {factorLines.length > 0 && (
        <div data-testid="eval-factors">
          <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">DESIRABILITY FACTORS</div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[12px]">
            {factorLines.map((factor) => (
              <div key={factor.key} className="contents" data-testid={`eval-factor-${factor.key}`}>
                <dt className="text-white/60">{factor.label}</dt>
                <dd className={`tabular-nums font-bold ${factor.value >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {factor.value >= 0 ? '+' : ''}
                  {factor.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {itemDef(unit.kind).income?.type === 'rent' && (
        <div>
          <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">RENT</div>
          <div className="flex overflow-hidden rounded" role="group" aria-label="Rent tier">
            {RENT_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                data-testid={`rent-${tier}`}
                aria-pressed={unit.rentTier === tier}
                onClick={() => onSetRentTier(unit.id, tier)}
                className={`flex-1 px-2 py-1 text-[12px] font-bold uppercase ${
                  unit.rentTier === tier ? 'bg-emerald-500/80 text-slate-950' : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>
      )}

      {unit.kind === 'medicalClinic' && (
        <div>
          <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">COPAY</div>
          <p className="pb-1 text-[11px] text-white/50">Higher copay earns more per visit, but fewer patients travel to it.</p>
          <div className="flex overflow-hidden rounded" role="group" aria-label="Copay level">
            {COPAY_TIERS.map(({ tier, label }) => (
              <button
                key={tier}
                type="button"
                data-testid={`copay-${tier}`}
                aria-pressed={unit.rentTier === tier}
                onClick={() => onSetRentTier(unit.id, tier)}
                className={`flex-1 px-2 py-1 text-[12px] font-bold uppercase ${
                  unit.rentTier === tier ? 'bg-emerald-500/80 text-slate-950' : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {unit.infested && (
        <button
          type="button"
          data-testid="pest-control"
          onClick={() => onPestControl?.(unit.id)}
          className="w-full rounded bg-lime-500/25 px-2 py-1 text-[12px] font-bold text-lime-200 hover:bg-lime-500/40"
        >
          Pest control · {money(TUNING.incidents.pestControlCost)}
        </button>
      )}
      {unit.offline && (
        <button
          type="button"
          data-testid="repair"
          onClick={() => onRepair?.(unit.id)}
          className="w-full rounded bg-orange-500/25 px-2 py-1 text-[12px] font-bold text-orange-200 hover:bg-orange-500/40"
        >
          Repair · {money(repairCost(unit))}
        </button>
      )}
      {upgrades.map((upgrade) => (
        <button
          key={upgrade.id}
          type="button"
          data-testid={`upgrade-${upgrade.id}`}
          onClick={() => onApplyUpgrade(unit.id, upgrade.id)}
          className="w-full rounded bg-sky-500/25 px-2 py-1 text-left text-[12px] text-sky-100 hover:bg-sky-500/40"
        >
          {upgrade.label} · {money(upgrade.cost)}
        </button>
      ))}

      <DemolishControl
        name={def.name}
        location={`Floor ${floorLabel(unit.floor)}`}
        refund={money(refund)}
        onDemolish={onDemolish}
      />
    </>
  )
}

function ShaftInspect({
  shaft,
  onAddCar,
  onSetStopEnabled,
  onSetProgram,
  onSetCarHomeFloor,
  onDemolish,
}: {
  shaft: Shaft
  onAddCar: InspectPanelProps['onAddCar']
  onSetStopEnabled: InspectPanelProps['onSetStopEnabled']
  onSetProgram: InspectPanelProps['onSetProgram']
  onSetCarHomeFloor: InspectPanelProps['onSetCarHomeFloor']
  onDemolish: () => void
}): ReactElement {
  const def = shaftDef(shaft.kind)
  const refund = Math.round(TUNING.economy.demolitionRefundRate * shaftBuildCost(shaft))
  const issues = shaftIssues(shaft)
  const serviceOnly = def.serviceOnly === true

  const patchProgram = (patch: Partial<ShaftProgram>): void => {
    onSetProgram(shaft.id, {
      weekday: { ...shaft.program.weekday },
      weekend: { ...shaft.program.weekend },
      idleAnswerThreshold: shaft.program.idleAnswerThreshold,
      doorDwellSec: shaft.program.doorDwellSec,
      ...patch,
    })
  }
  const applyProgramPreset = (presetId: ShaftProgramPresetId): void => {
    const presetProgram = programForPreset(presetId)
    patchProgram({
      weekday: presetProgram.weekday,
      weekend: presetProgram.weekend,
    })
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">{def.name}</h3>
        <span className="text-[11px] text-white/50">
          Floors {floorLabel(shaft.bottomFloor)}–{floorLabel(shaft.topFloor)}
        </span>
      </div>

      {issues.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="shaft-issues">
          {issues.map((issue) => (
            <div
              key={issue.key}
              data-testid={`shaft-issue-${issue.key}`}
              data-severity={issue.severity}
              className={`rounded px-2 py-1 text-[12px] ${
                issue.severity === 'critical' ? 'bg-red-500/20 text-red-200' : 'bg-amber-500/20 text-amber-200'
              }`}
            >
              <div className="font-bold">
                <span aria-hidden="true">{issue.severity === 'critical' ? '🔴' : '🟡'}</span> {issue.label}
              </div>
              <div className="pt-0.5 text-white/70">{issue.hint}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[12px]">
        <span>
          Cars: <span className="tabular-nums">{shaft.cars.length}</span>/{def.maxCars} · avg wait{' '}
          <span className="tabular-nums">{shaft.stats.avgWaitGameMin.toFixed(1)}</span> min
        </span>
        <button
          type="button"
          data-testid="add-car"
          disabled={shaft.cars.length >= def.maxCars}
          onClick={() => onAddCar(shaft.id)}
          className="rounded bg-emerald-500/25 px-2 py-1 text-[12px] font-bold text-emerald-200 hover:bg-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add car · {money(def.carCost)}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 text-[11px]">
        <span
          data-testid="shaft-service-badge"
          className={`rounded px-2 py-0.5 font-bold ${
            serviceOnly ? 'bg-sky-400/20 text-sky-100' : 'bg-emerald-400/20 text-emerald-100'
          }`}
        >
          {serviceOnly ? 'Staff/trash only' : 'Passenger service'}
        </span>
        {def.exterior && <span className="rounded bg-cyan-400/20 px-2 py-0.5 font-bold text-cyan-100">Exterior glass</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-white/50">Capacity</dt>
        <dd className="tabular-nums" data-testid="shaft-capacity">
          {def.carCapacity}/car
        </dd>
        <dt className="text-white/50">Limit</dt>
        <dd data-testid="shaft-limits">{shaftLimitLine(def)}</dd>
        <dt className="text-white/50">Maintenance</dt>
        <dd className="tabular-nums">{money(def.maintPerCarPerDay)}/car/day</dd>
      </dl>

      <div>
        <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">STOPS</div>
        <p className="pb-1 text-[11px] text-white/50">Enabled stops are the landings this shaft will answer.</p>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {shaft.stops.map((floor) => {
            const enabled = shaft.enabledStops.includes(floor)
            return (
              <label key={floor} className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px]">
                <input
                  type="checkbox"
                  data-testid={`stop-${floor}`}
                  checked={enabled}
                  onChange={() => onSetStopEnabled(shaft.id, floor, !enabled)}
                />
                {floorLabel(floor)}
              </label>
            )
          })}
        </div>
      </div>

      <div>
        <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">PRESETS</div>
        <p className="pb-1 text-[11px] text-white/50">Presets update only the direction program; stops and home floors stay manual.</p>
        <div className="flex flex-col gap-1">
          {SHAFT_PROGRAM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`program-preset-${preset.id}`}
              title={preset.summary}
              onClick={() => applyProgramPreset(preset.id)}
              className="rounded bg-sky-500/20 px-2 py-1 text-left text-[11px] font-semibold text-sky-100 hover:bg-sky-500/35"
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="program-reset"
            onClick={() => onSetProgram(shaft.id, defaultShaftProgram())}
            className="rounded bg-white/10 px-2 py-1 text-left text-[11px] font-semibold text-white/75 hover:bg-white/20"
          >
            Reset to default
          </button>
        </div>
      </div>

      {serviceOnly ? (
        <div className="rounded bg-sky-400/10 px-2 py-1 text-[12px] text-sky-100" data-testid="service-program-note">
          Service shafts skip passenger direction-priority programs.
        </div>
      ) : (
        (['weekday', 'weekend'] as const).map((week) => (
          <div key={week}>
            <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">
              {week === 'weekday' ? 'WEEKDAY PROGRAM' : 'WEEKEND PROGRAM'}
            </div>
            <p className="pb-1 text-[11px] text-white/50">Direction priority nudges idle cars during each time slot.</p>
            <div className="grid grid-cols-2 gap-1">
              {PROGRAM_SLOTS.map(({ slot, label }) => (
                <label key={slot} className="flex flex-col gap-0.5 text-[11px] text-white/60">
                  {label}
                  <select
                    data-testid={`program-${week}-${slot}`}
                    value={shaft.program[week][slot]}
                    onChange={(e) =>
                      patchProgram({
                        [week]: { ...shaft.program[week], [slot]: e.target.value as DirectionPriority },
                      })
                    }
                    className="rounded bg-white/10 px-1 py-0.5 text-[11px] text-white"
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority} className="bg-slate-900">
                        {priority === 'balanced' ? 'Balanced' : priority === 'expressToTop' ? 'To top' : 'To bottom'}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px] text-white/60">
        <label className="flex flex-col gap-0.5">
          <span>Idle answer (floors)</span>
          <span className="text-[10px] text-white/40">Lower values let idle cars answer closer calls.</span>
          <input
            type="number"
            data-testid="idle-threshold"
            min={0}
            max={TUNING.elevators.idleAnswerMax}
            value={shaft.program.idleAnswerThreshold}
            onChange={(e) => patchProgram({ idleAnswerThreshold: Number(e.target.value) })}
            className="rounded bg-white/10 px-1 py-0.5 text-white"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span>Door dwell (sec)</span>
          <span className="text-[10px] text-white/40">Longer dwell gives riders more time to board.</span>
          <input
            type="number"
            data-testid="door-dwell"
            min={0}
            max={TUNING.elevators.doorDwellMaxSec}
            value={shaft.program.doorDwellSec}
            onChange={(e) => patchProgram({ doorDwellSec: Number(e.target.value) })}
            className="rounded bg-white/10 px-1 py-0.5 text-white"
          />
        </label>
      </div>

      <div>
        <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">CARS</div>
        <p className="pb-1 text-[11px] text-white/50">Live status per car. A home floor pulls an idle car back after the return delay.</p>
        <div className="flex flex-col gap-1">
          {shaft.cars.map((car) => {
            const atHome = carIsAtHome(car)
            return (
              <div
                key={car.index}
                data-testid={`car-row-${car.index}`}
                className={`flex items-center gap-2 rounded px-1.5 py-1 text-[11px] ${
                  atHome ? 'bg-emerald-500/15 text-emerald-100' : 'bg-white/5 text-white/70'
                }`}
              >
                <span className="font-bold tabular-nums">#{car.index + 1}</span>
                <span className="tabular-nums" data-testid={`car-floor-${car.index}`}>
                  {floorLabel(Math.round(car.y))}
                </span>
                <span data-testid={`car-motion-${car.index}`}>{carMotionLabel(car)}</span>
                <span className="tabular-nums text-white/50" data-testid={`car-load-${car.index}`}>
                  {car.passengerIds.length}/{def.carCapacity}
                </span>
                {atHome && (
                  <span className="text-[10px] font-bold text-emerald-300" data-testid={`car-athome-${car.index}`}>
                    HOME
                  </span>
                )}
                <select
                  data-testid={`home-${car.index}`}
                  aria-label={`Home floor for car ${car.index + 1}`}
                  value={car.homeFloor === null ? '' : String(car.homeFloor)}
                  onChange={(e) => onSetCarHomeFloor(shaft.id, car.index, e.target.value === '' ? null : Number(e.target.value))}
                  className="ml-auto rounded bg-white/10 px-1 py-0.5 text-white"
                >
                  <option value="" className="bg-slate-900">
                    —
                  </option>
                  {shaft.enabledStops.map((floor) => (
                    <option key={floor} value={floor} className="bg-slate-900">
                      {floorLabel(floor)}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      <DemolishControl
        name={def.name}
        location={`Floors ${floorLabel(shaft.bottomFloor)}–${floorLabel(shaft.topFloor)}`}
        refund={money(refund)}
        onDemolish={onDemolish}
      />
    </>
  )
}

/** Inspector for the selected unit or shaft; every control enqueues a command. */
export function InspectPanel(props: InspectPanelProps): ReactElement {
  const { selection } = props
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-slate-950/80 p-3 text-sm shadow-lg backdrop-blur-sm sm:w-64">
      {props.overlaySample && (
        <div className="rounded-lg border border-sky-300/25 bg-sky-400/10 px-2 py-1.5" data-testid="overlay-tile-sample">
          <div className="text-[10px] font-bold uppercase text-sky-100/70">
            {props.overlaySample.kind === 'noise' ? 'Noise' : 'Congestion'} · floor {floorLabel(props.overlaySample.floor)} · tile{' '}
            {props.overlaySample.x}
          </div>
          <div className="pt-0.5 font-bold tabular-nums text-sky-100">{heatmapSampleValue(props.overlaySample)}</div>
        </div>
      )}
      {selection?.type === 'unit' ? (
        <UnitInspect
          unit={selection.unit}
          maxStarReached={props.maxStarReached}
          lobbyHeight={props.lobbyHeight ?? 1}
          mapId={props.mapId ?? CITY_TOWER.id}
          vipRecords={props.vipRecords ?? []}
          evalBreakdown={props.evalBreakdown}
          onSetRentTier={props.onSetRentTier}
          onApplyUpgrade={props.onApplyUpgrade}
          onPestControl={props.onPestControl}
          onRepair={props.onRepair}
          onDemolish={() => props.onDemolish(selection)}
        />
      ) : selection?.type === 'shaft' ? (
        <ShaftInspect
          shaft={selection.shaft}
          onAddCar={props.onAddCar}
          onSetStopEnabled={props.onSetStopEnabled}
          onSetProgram={props.onSetProgram}
          onSetCarHomeFloor={props.onSetCarHomeFloor}
          onDemolish={() => props.onDemolish(selection)}
        />
      ) : null}
    </div>
  )
}
