import { createMuteStorage } from '../muteStorage'

test('round-trips the preference and treats anything unreadable as sound on', () => {
  const storage = createMuteStorage('bwh.test.muted.v1')
  expect(storage.load()).toBe(false)
  storage.save(true)
  expect(window.localStorage.getItem('bwh.test.muted.v1')).toBe('true')
  expect(storage.load()).toBe(true)
  window.localStorage.setItem('bwh.test.muted.v1', '{broken')
  expect(storage.load()).toBe(false)
  window.localStorage.setItem('bwh.test.muted.v1', '"yes"')
  expect(storage.load()).toBe(false)
})

test('blocked storage neither throws nor mutes', () => {
  const storage = createMuteStorage('bwh.test.blocked.v1')
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(storage.load()).toBe(false)
  expect(() => storage.save(true)).not.toThrow()
  get.mockRestore()
  set.mockRestore()
})
