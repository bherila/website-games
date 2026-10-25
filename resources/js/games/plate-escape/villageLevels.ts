import type { Plate, PuzzleLevel, Screw, ScrewColor } from './level'

/** New structures reuse the cottage shell, with individually authored access layers. */
export function createVillageLevels(plates: readonly Plate[], screws: readonly Screw[], workshop: PuzzleLevel): PuzzleLevel[] {
  const colors = ['coral', 'mint', 'blue', 'amber'] as const
  const sails: Plate[] = colors.map((color, index) => {
    const angle = Math.PI / 4 + index * Math.PI / 2
    const x = Math.sin(angle)
    const y = Math.cos(angle)
    return { id: `sail-${color}`, name: `${color} sail`, position: [x * 0.85, 0.5 + y * 0.85, 1.95 + index * 0.035], size: [0.70, 1.9], normal: [0, 0, 1], up: [x, y, 0], finish: 'sail', color: '#f0dfb7' }
  })
  // The back wall’s only screw waits for the roof, so it takes the late blue
  // and the roof gives up the mint; this keeps the mill's difficulty.
  const millColors: Record<string, ScrewColor> = { 'front-1': 'blue', 'back-1': 'blue', 'right-roof-1': 'mint', 'left-roof-1': 'coral', 'left-roof-2': 'amber', 'right-roof-2': 'amber' }
  const mill: PuzzleLevel = {
    id: 3, name: 'Village Windmill', spareCapacity: 2, overflowLoses: true,
    trayColors: colors, theme: 'windmill',
    introduction: 'The four sails cover the hub screw. Remove the sails to reach it, and check the upcoming tray colors before using your two spare slots. Drag to look around the back.',
    plates: [...plates, ...sails],
    screws: [
      ...screws.filter((screw) => screw.id !== 'front-2').map((screw): Screw => ({ ...screw, color: millColors[screw.id] ?? screw.color, ...(screw.id === 'front-1' ? { position: [0, 0.75], blockedBy: sails.map((sail) => sail.id) } : {}) })),
      ...colors.map((color): Screw => ({ id: `sail-${color}-1`, plate: `sail-${color}`, color, position: [0, 0.4] })),
    ],
  }
  const glasshouse: PuzzleLevel = {
    id: 4, name: 'Glasshouse', spareCapacity: 3, overflowLoses: true,
    trayColors: colors, theme: 'glasshouse',
    introduction: 'You can see screws through glass, but cannot reach through it. A lock marks a covered head. Remove the outer glass panel to reach the screws behind it. This introduction gives you three spare slots.',
    plates: workshop.plates.map((plate): Plate => ({ ...plate, translucent: true, color: '#a4d7cf', finish: plate.finish === 'roof' ? 'glass-roof' : plate.finish === 'brace' ? 'glass' : 'glass-wall' })),
    screws: workshop.screws.map((screw): Screw => ({ ...screw, ...(screw.id === 'front-brace-1' ? { position: [-1.4, 0] as const } : screw.id === 'front-brace-2' ? { position: [1.4, 0] as const } : {}) })),
  }
  glasshouse.plates = glasshouse.plates.map((plate) => ({ ...plate, name: plate.id === 'front-brace' ? 'Front glass cover' : plate.id === 'back-brace' ? 'Back glass cover' : plate.name }))
  const slope = Math.SQRT1_2
  const cafe: PuzzleLevel = {
    id: 5, name: 'Corner Café', spareCapacity: 2, overflowLoses: true,
    trayColors: colors, theme: 'cafe',
    introduction: 'The café sign covers the awning fastener. Release the sign, then the glass awning, to reach the wall screws. Plan the opening order using the tray queue and two spare slots.',
    plates: [
      ...plates.map((plate) => ({ ...plate, color: plate.finish === 'roof' ? '#677f86' : '#efd9b6' })),
      { id: 'cafe-awning', name: 'Glass awning', position: [0, 0.7, 1.8], size: [3.6, 1.2], normal: [0, slope, slope], up: [0, slope, -slope], finish: 'awning', color: '#a4d7cf', translucent: true },
      { id: 'cafe-sign', name: 'Café sign', position: [0, 0.92, 2.3], size: [3.6, 0.9], normal: [0, 0, 1], up: [0, 1, 0], finish: 'sign', color: '#48776f' },
    ],
    screws: [
      ...workshop.screws.filter((screw) => !screw.plate.endsWith('brace')).map(({ blockedBy: _braces, ...screw }): Screw => ({ ...screw, ...(['front-1', 'front-2'].includes(screw.id) ? { blockedBy: ['cafe-sign', 'cafe-awning'] } : {}) })),
      { id: 'cafe-sign-1', plate: 'cafe-sign', color: 'coral', position: [-1.35, 0] },
      { id: 'cafe-sign-2', plate: 'cafe-sign', color: 'coral', position: [1.35, 0] },
      { id: 'cafe-awning-1', plate: 'cafe-awning', color: 'mint', position: [0, -0.25], blockedBy: ['cafe-sign'] },
    ],
  }
  return [mill, glasshouse, cafe]
}
