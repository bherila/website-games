import { readCloudLineage, writeCloudLineage } from '../cloudLineage'
import { createEngineState } from '../engine/engine'
import { exportSandbox, loadSandbox, readSandboxSlotStorage, saveSandbox } from '../gameProgress'

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
