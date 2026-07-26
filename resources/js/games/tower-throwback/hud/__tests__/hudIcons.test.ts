import { ITEM_DEFS, SHAFT_DEFS } from '../../engine/catalog'
import type { ItemKind, ShaftKind } from '../../gameTypes'
import { ALL_HUD_ICON_FILES, BUILD_TOOL_ICON_FILES, HUD_ICON_FILES, HUD_ICON_URLS } from '../hudIcons'

declare const __dirname: string
declare const require: {
  (id: 'fs'): { existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string }
  (id: 'path'): { join(...paths: string[]): string; resolve(...paths: string[]): string }
}

const { existsSync, readFileSync } = require('fs')
const path = require('path')

const iconRoot = path.resolve(__dirname, '../../assets/icons')

function iconSource(fileName: string): string {
  return readFileSync(path.join(iconRoot, fileName), 'utf8')
}

describe('Tower Throwback HUD icon assets', () => {
  it('defines one build-palette icon for every item and shaft kind', () => {
    const catalogKinds = [...Object.keys(ITEM_DEFS), ...Object.keys(SHAFT_DEFS)].sort()
    expect(Object.keys(BUILD_TOOL_ICON_FILES).sort()).toEqual(catalogKinds)
  })

  it('defines native SVG assets for toolbar, overlay, star, VIP, and incident icons', () => {
    expect(Object.keys(HUD_ICON_FILES).sort()).toEqual([
      'incident.bombThreat',
      'incident.cockroach',
      'incident.repair',
      'incident.request',
      'incident.vacancy',
      'incident.warning',
      'overlay.congestion',
      'overlay.noise',
      'overlay.none',
      'star.progress',
      'star.rating',
      'star.tower',
      'toolbar.build',
      'toolbar.financials',
      'toolbar.pause',
      'toolbar.run',
      'toolbar.saves',
      'toolbar.soundOff',
      'toolbar.soundOn',
      'toolbar.speed1',
      'toolbar.speed16',
      'toolbar.speed2',
      'toolbar.speed4',
      'toolbar.speed8',
      'vip',
    ])
    expect(Object.keys(HUD_ICON_URLS).sort()).toEqual(Object.keys(HUD_ICON_FILES).sort())
  })

  it('keeps every declared icon file present and in the 24x24 native SVG vector language', () => {
    expect(new Set(ALL_HUD_ICON_FILES).size).toBe(ALL_HUD_ICON_FILES.length)

    for (const fileName of ALL_HUD_ICON_FILES) {
      const filePath = path.join(iconRoot, fileName)
      expect(existsSync(filePath)).toBe(true)

      const source = iconSource(fileName)
      expect(source).toContain('viewBox="0 0 24 24"')
      expect(source).toContain('role="img"')
      expect(source).toMatch(/aria-label="[^"]+"/)
      expect(source.match(/<(circle|ellipse|line|path|polygon|polyline|rect)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
      expect(source).toMatch(/<(circle|ellipse|line|path|polygon|polyline)\b/)
      expect(source).not.toMatch(/<(image|text)\b/)
      expect(source).not.toMatch(/base64|data:image|<script\b|undefined/i)
    }
  })

  it('uses category-coded badge backgrounds for build and status groups', () => {
    const expectedBackgrounds: Record<string, string[]> = {
      '#dcf0d0': ['aptStudio.svg', 'apt1br.svg', 'apt2br.svg', 'aptPenthouse.svg'],
      '#dcedff': ['officeS.svg', 'officeM.svg', 'officeL.svg', 'shop.svg', 'conferenceCenter.svg'],
      '#ffe1a3': ['fastfood.svg', 'foodCourt.svg', 'restaurant.svg', 'fancyRestaurant.svg'],
      '#eadcff': ['hotelReception.svg', 'hotel1p.svg', 'hotel2p.svg', 'hotelSuite.svg', 'housekeeping.svg'],
      '#d9f0f5': ['skybridge.svg', 'parkingRamp.svg', 'parkingSpace.svg', 'subway.svg'],
      '#e5dfd1': ['restroom.svg', 'trashRoom.svg', 'recyclingCenter.svg', 'securityOffice.svg', 'medicalClinic.svg'],
      '#e8edf0': ['standard-elevator.svg', 'express-elevator.svg', 'service-elevator.svg', 'glass-elevator.svg'],
      '#fff1bd': ['toolbar-build.svg', 'toolbar-run.svg', 'star.svg', 'vip.svg'],
      '#ffd6c8': ['incident-warning.svg', 'incident-bomb-threat.svg', 'incident-cockroach.svg', 'incident-repair.svg', 'incident-request.svg', 'incident-vacancy.svg'],
    }

    for (const [background, fileNames] of Object.entries(expectedBackgrounds)) {
      for (const fileName of fileNames) {
        expect(iconSource(fileName)).toContain(`fill="${background}"`)
      }
    }
  })

  it('builds URL entries for all catalog-driven icons', () => {
    for (const kind of Object.keys(ITEM_DEFS) as ItemKind[]) {
      expect(BUILD_TOOL_ICON_FILES[kind]).toMatch(/\.svg$/)
    }
    for (const kind of Object.keys(SHAFT_DEFS) as ShaftKind[]) {
      expect(BUILD_TOOL_ICON_FILES[kind]).toMatch(/\.svg$/)
    }
  })
})
