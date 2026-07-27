/**
 * Which HUD surfaces suspend the simulation.
 *
 * A "blocking" surface COVERS the playfield, so continuing to simulate behind
 * it would advance the tower where the player can neither see nor react to it.
 * Readouts that sit alongside the game (financials, toast history) deliberately
 * do NOT pause — otherwise checking the books would become a way to stop the
 * clock, which is a much bigger balance change than the pause itself.
 *
 * Pausing is applied as a zero engine step, not a speed change, so the player's
 * own speed selection is never written to and there is nothing to restore.
 */

export interface ModalVisibility {
  inventoryOpen: boolean
  saveLoadOpen: boolean
  shortcutHelpOpen: boolean
  towerCardOpen: boolean
  loanPromptOpen: boolean
  financialsOpen: boolean
  toastHistoryOpen: boolean
}

export function isBlockingModalOpen(visibility: ModalVisibility): boolean {
  return (
    visibility.inventoryOpen
    || visibility.saveLoadOpen
    || visibility.shortcutHelpOpen
    || visibility.towerCardOpen
    || visibility.loanPromptOpen
  )
}
