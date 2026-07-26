/**
 * Which surfaces count as "blocking" is a UX policy decision, so it gets its
 * own pinned test rather than living only inside a JSX expression.
 */
import { isBlockingModalOpen, type ModalVisibility } from '../blockingModals'

function visibility(overrides: Partial<ModalVisibility> = {}): ModalVisibility {
  return {
    saveLoadOpen: false,
    shortcutHelpOpen: false,
    towerCardOpen: false,
    loanPromptOpen: false,
    financialsOpen: false,
    toastHistoryOpen: false,
    ...overrides,
  }
}

describe('isBlockingModalOpen', () => {
  it('is false with nothing open', () => {
    expect(isBlockingModalOpen(visibility())).toBe(false)
  })

  it.each([
    ['saveLoadOpen'],
    ['shortcutHelpOpen'],
    ['towerCardOpen'],
    ['loanPromptOpen'],
  ] as const)('pauses for %s', (key) => {
    expect(isBlockingModalOpen(visibility({ [key]: true }))).toBe(true)
  })

  it.each([['financialsOpen'], ['toastHistoryOpen']] as const)('does NOT pause for %s', (key) => {
    // These sit alongside the playfield rather than covering it — pausing for
    // them would make checking the books a way to stop the clock.
    expect(isBlockingModalOpen(visibility({ [key]: true }))).toBe(false)
  })

  it('stays paused while one blocking surface hands off to another', () => {
    // Closing the loan dialog straight into the save overlay must not resume
    // for a frame in between.
    expect(isBlockingModalOpen(visibility({ loanPromptOpen: true, saveLoadOpen: true }))).toBe(true)
  })

  it('ignores non-blocking surfaces when a blocking one is open', () => {
    expect(isBlockingModalOpen(visibility({ saveLoadOpen: true, financialsOpen: true }))).toBe(true)
  })
})
