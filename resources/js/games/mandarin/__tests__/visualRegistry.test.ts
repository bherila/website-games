import { manifestSlotIds, VISUAL_REGISTRY, VISUAL_SLOT_IDS, visualSlot } from '../assets/visualRegistry'
import { loadCourse } from '../domain/course'
import { DIORAMA_CONFIGS } from '../scene/sceneConfigs'

describe('visual asset slots', () => {
  it('matches the manifest ids exactly', () => {
    expect([...VISUAL_SLOT_IDS].sort()).toEqual([...manifestSlotIds()].sort())
    expect(VISUAL_SLOT_IDS).toHaveLength(9)
  })

  it('binds eight generated assets while retaining SVG fallbacks and optional paper', () => {
    for (const id of VISUAL_SLOT_IDS) {
      const slot = VISUAL_REGISTRY[id]
      expect(slot.fallbackSrc).toBe(`/images/games/mandarin/fallback/${id}.svg`)
      expect(slot.src).toBe(id === 'material-paper' ? slot.fallbackSrc : `/images/games/mandarin/${id}.webp`)
      expect(slot.status).toBe(id === 'material-paper' ? 'fallback' : 'generated')
      expect(slot.generatedPath).toBe(`/images/games/mandarin/${id}.webp`)
    }
  })

  it('covers every scene poster and role portrait the course references', () => {
    const course = loadCourse()
    for (const scene of course.scenes) {
      expect(visualSlot(scene.artSlotId).kind).toBe('scene_poster')
      expect(DIORAMA_CONFIGS[scene.setting]).toBeDefined()
    }
    for (const role of course.roleById.values()) expect(visualSlot(role.portraitSlotId).kind).toBe('portrait')
    expect(() => visualSlot('nope')).toThrow()
  })
})
