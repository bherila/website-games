import { readCloudLineage, writeCloudLineage } from '../cloudLineage'
import { createEngineState } from '../engine/engine'
import { exportSandbox, importSandbox, loadSandbox, readSandboxSlotStorage, saveSandbox } from '../gameProgress'

it('preserves another tab slot record when this tab updates its own lineage', () => {
  localStorage.clear()
  writeCloudLineage('fixture-account', 'slot-a', { revision: 'first' })
  writeCloudLineage('fixture-account', 'slot-b', { revision: 'second', blocked: true })
  writeCloudLineage('fixture-account', 'slot-a', { revision: 'third' })
  expect(readCloudLineage('fixture-account', () => null)['slot-b']).toMatchObject({ revision: 'second', blocked: true })
})

it('keeps browser incarnation metadata out of cloud/exported saves', () => {
  saveSandbox(createEngineState({ seed: 1, mapId: 'city-tower', lobbyHeight: 1 }), 'slot-a')
  expect(JSON.parse(readSandboxSlotStorage('slot-a')!.raw!)).toHaveProperty('_cloudLocal.incarnation')
  const saved = loadSandbox('slot-a')!
  expect(saved).not.toHaveProperty('_cloudLocal')
  expect(exportSandbox(saved)).not.toContain('_cloudLocal')
})

it('rotates local identity for imports and a new run, while ordinary progress retains it', () => {
  const state = createEngineState({ seed: 1, mapId: 'city-tower', lobbyHeight: 1 })
  saveSandbox(state, 'slot-a')
  const original = JSON.parse(readSandboxSlotStorage('slot-a')!.raw!)._cloudLocal.incarnation
  state.funds += 2
  saveSandbox(state, 'slot-a')
  expect(JSON.parse(readSandboxSlotStorage('slot-a')!.raw!)._cloudLocal.incarnation).toBe(original)
  const imported = importSandbox(exportSandbox(loadSandbox('slot-a')!), 'slot-a')
  expect(imported.ok).toBe(true)
  const replacement = JSON.parse(readSandboxSlotStorage('slot-a')!.raw!)._cloudLocal.incarnation
  expect(replacement).not.toBe(original)
  saveSandbox(state, 'slot-a', undefined, true)
  expect(JSON.parse(readSandboxSlotStorage('slot-a')!.raw!)._cloudLocal.incarnation).not.toBe(replacement)
})
