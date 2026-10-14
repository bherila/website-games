/** Shared operator-panel contract. Game modules own their additional fields. */
export interface PanelData {
  /** The identity provider's user-management page; null when not configured. */
  usersUrl: string | null
}
