import type { VipRecord, VipTarget } from './gameTypes'

export interface VipFlavor {
  name: string
  title: string
  arrivalLine: string
}

export const VIP_TARGETS = [2, 3, 4, 5, 'tower'] as const satisfies readonly VipTarget[]

const FALLBACK_FLAVOR: VipFlavor = {
  name: 'Skyline Guest',
  title: 'VIP inspector',
  arrivalLine: 'They are watching the tower operations closely.',
}

const VIP_FLAVORS: Record<VipTarget, readonly VipFlavor[]> = {
  2: [
    { name: 'Avery Vell', title: 'City desk critic', arrivalLine: 'They are touring the offices and street-level services.' },
    { name: 'Rowan Vale', title: 'Downtown columnist', arrivalLine: 'They are checking whether the early tower has a pulse.' },
    { name: 'Mira Sable', title: 'Neighborhood envoy', arrivalLine: 'They are looking for dependable access and clean amenities.' },
  ],
  3: [
    { name: 'Cassian Reed', title: 'Regional development chair', arrivalLine: 'They expect smooth circulation and a stronger tenant mix.' },
    { name: 'Selene Ward', title: 'Civic awards juror', arrivalLine: 'They are comparing your tower against the city shortlist.' },
    { name: 'Noel Maris', title: 'Metro business editor', arrivalLine: 'They are weighing the tower as a serious destination.' },
  ],
  4: [
    { name: 'Iris Calder', title: 'Luxury travel reviewer', arrivalLine: 'They need a clean suite and memorable amenities.' },
    { name: 'Theo Lark', title: 'Hospitality board delegate', arrivalLine: 'They are measuring the hotel experience from curb to checkout.' },
    { name: 'Vera Quinn', title: 'Concierge guild examiner', arrivalLine: 'They expect polish from the lobby through the suite.' },
  ],
  5: [
    { name: 'Dorian Pike', title: 'International tower scout', arrivalLine: 'They are judging whether the building can carry a five-star name.' },
    { name: 'Lyra Holt', title: 'Skyline council patron', arrivalLine: 'They want quiet luxury and flawless elevator service.' },
    { name: 'Emery Vale', title: 'Penthouse society editor', arrivalLine: 'They are looking for a tower worthy of its address.' },
  ],
  tower: [
    { name: 'The Crown Delegate', title: 'Tower status envoy', arrivalLine: 'They are here for the final walk through the landmark.' },
    { name: 'The Skyline Chancellor', title: 'Civic landmark arbiter', arrivalLine: 'They will decide whether the tower deserves its crown.' },
    { name: 'The Gold Ribbon Patron', title: 'Grand opening guest of honor', arrivalLine: 'They expect every signature space to be ready.' },
  ],
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

export function vipVisitIdForTarget(target: VipTarget): string {
  return `target:${target}`
}

export function vipFlavorFor(target: VipTarget, visitId: string | number): VipFlavor {
  const flavors = VIP_FLAVORS[target]
  const index = stableHash(`${target}:${visitId}`) % flavors.length
  return flavors[index] ?? FALLBACK_FLAVOR
}

export function vipDisplayName(target: VipTarget, visitId: string | number): string {
  const flavor = vipFlavorFor(target, visitId)
  return `${flavor.name}, ${flavor.title}`
}

export function vipReportLine(target: VipTarget, visitId: string | number, reportLine: string): string {
  return `${vipFlavorFor(target, visitId).name}: ${reportLine}`
}

export function vipRecordDisplayName(record: VipRecord): string {
  return vipDisplayName(record.target, vipVisitIdForTarget(record.target))
}
