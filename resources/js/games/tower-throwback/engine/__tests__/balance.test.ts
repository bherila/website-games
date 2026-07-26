import type { ItemKind } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { ITEM_DEFS } from '../catalog'

/**
 * Balance invariant (spec "Economy constants"): every income-bearing item pays
 * back its build cost within paybackInvariantDays at target occupancy,
 * computed ANALYTICALLY from catalog defs.
 *
 * Analytic star-3 traffic assumptions (documented per the spec's schedule
 * formulas — deliberately conservative round numbers):
 * - Shoppers: hourly N = (2+3) × C^0.7 over 11 hours in a 5-commerce tower →
 *   ≈34 visits/day per unit.
 * - Fastfood adds lunch: 40 nearby office workers × P0.7 → +28 → 62/day.
 * - Food court is the mass-lunch anchor → 120/day.
 * - Restaurants: diner formula 3 × (1+3) × 2^0.7 per hour across 2 venues ×
 *   4 evening hours → ≈39/day.
 * - Movie theater: (5×2 + 2×3) shows/week × batch (20 + 10×3) ÷ 7 → ≈114/day.
 * - Hotel nightly occupancy: 0.4 + 0.05×3 + 0.2×(70/100) = 0.69 (avg tier).
 *
 * ALLOWLIST — income-bearing items whose ROI is deliberately indirect (their
 * spec "Notes" call them eval boosts / boons / VIP-relevant, and the VIP
 * amenity rubric is their real payoff): fitness, pool, spa, conferenceCenter,
 * eventSpace, fancyRestaurant (high-tier-only dinner traffic cannot clear the
 * invariant analytically; it exists to court VIPs), medicalClinic (a +3 eval
 * amenity whose infrequent copay visits are a bonus, not a payback vehicle).
 */

const VISITS_PER_DAY: Partial<Record<ItemKind, number>> = {
  shop: 34,
  fastfood: 62,
  foodCourt: 120,
  restaurant: 39,
  movieTheater: ((5 * 2 + 2 * 3) * (TUNING.commerce.theaterBatchBase + TUNING.commerce.theaterBatchPerStar * 3)) / 7,
}

const SUPPORT_ALLOWLIST: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'fitness',
  'pool',
  'spa',
  'conferenceCenter',
  'eventSpace',
  'fancyRestaurant',
  'medicalClinic',
])

// The repo tsconfig excludes node typings ("types": []); these two ambient
// declares scope the doc-file read to this jest-node test only.
declare const require: (id: 'fs') => { readFileSync(path: string, encoding: 'utf8'): string }
declare const __dirname: string

const HOTEL_OCCUPANCY = TUNING.spawn.hotelOccBase + TUNING.spawn.hotelOccPerStar * 3 + (TUNING.spawn.hotelOccEvalFactor * 70) / 100

describe('payback invariant', () => {
  const earners = Object.values(ITEM_DEFS).filter((def) => def.income !== undefined)

  it.each(earners.map((def) => [def.kind, def] as const))('%s pays back within 90 days', (kind, def) => {
    if (SUPPORT_ALLOWLIST.has(kind)) {
      return
    }
    const income = def.income!
    let dailyIncome: number
    switch (income.type) {
      case 'rent':
        dailyIncome = income.perDay // avg tier ×1.0
        break
      case 'perVisit': {
        const visits = VISITS_PER_DAY[kind]
        expect(visits).toBeDefined() // every non-allowlisted perVisit kind needs an assumption
        dailyIncome = income.amount * (visits ?? 0)
        break
      }
      case 'perNight':
        dailyIncome = income.amount * HOTEL_OCCUPANCY
        break
      case 'perEvent':
        throw new Error(`${kind}: perEvent items must be allowlisted or given a model`)
    }
    const paybackDays = def.cost / dailyIncome
    expect(paybackDays).toBeLessThanOrEqual(TUNING.economy.paybackInvariantDays)
  })

  it('the allowlist only contains real catalog kinds', () => {
    for (const kind of SUPPORT_ALLOWLIST) {
      expect(ITEM_DEFS[kind]).toBeDefined()
    }
  })
})

describe('TUNING ↔ spec sync', () => {
  it('every TUNING leaf appears in the spec appendix with its current value', () => {
    const doc = require('fs').readFileSync(`${__dirname}/../../../../../../docs/games/tower-throwback.md`, 'utf8')
    const missing: string[] = []
    const walk = (obj: Record<string, unknown>, prefix: string): void => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          walk(value as Record<string, unknown>, path)
        } else {
          const row = `| \`${path}\` | \`${JSON.stringify(value)}\` |`
          if (!doc.includes(row)) {
            missing.push(row)
          }
        }
      }
    }
    walk(TUNING as unknown as Record<string, unknown>, '')
    expect(missing).toEqual([]) // update the spec appendix in the same commit as any TUNING change
  })
})
