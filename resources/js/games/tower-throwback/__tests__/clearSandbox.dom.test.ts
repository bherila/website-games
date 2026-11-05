import { clearSandbox, sandboxOwnerStorageKey } from '../gameProgress'
import { SANDBOX_STORAGE_KEY } from '../gameTypes'

const saveKey = `${SANDBOX_STORAGE_KEY}.slot-a`
const ownerKey = sandboxOwnerStorageKey('slot-a')

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(saveKey, 'original bytes')
  localStorage.setItem(ownerKey, 'this-tab')
})

afterEach(() => jest.restoreAllMocks())

it('refuses another tab at the removal boundary', () => {
  expect(clearSandbox('slot-a', 'other-tab')).toEqual({ ok: false, reason: 'slotOwnedByAnotherTab' })
  expect(localStorage.getItem(saveKey)).toBe('original bytes')
  expect(localStorage.getItem(ownerKey)).toBe('this-tab')
})

it('returns an unavailable outcome when browser storage cannot be accessed', () => {
  jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Denied') })
  expect(clearSandbox('slot-a', 'this-tab')).toEqual({ ok: false, reason: 'storageUnavailable' })
})

it.each([false, true])('reports whether the save was removed when the owner key fails: %s', (failOwner) => {
  const removeItem = Storage.prototype.removeItem
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key === (failOwner ? ownerKey : saveKey)) throw new DOMException('Denied', 'SecurityError')
    removeItem.call(this, key)
  })
  expect(clearSandbox('slot-a', 'this-tab')).toEqual({ ok: false, reason: 'removalFailed', saveRemoved: failOwner })
  expect(localStorage.getItem(saveKey)).toBe(failOwner ? null : 'original bytes')
  expect(localStorage.getItem(ownerKey)).toBe('this-tab')
  jest.restoreAllMocks()
  expect(clearSandbox('slot-a', 'this-tab')).toEqual({ ok: true })
  expect(localStorage.getItem(saveKey)).toBeNull()
  expect(localStorage.getItem(ownerKey)).toBeNull()
})
