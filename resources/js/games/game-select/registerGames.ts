import { registerGame } from './gameCatalog'
import { MANDARIN_CATALOG_ENTRY } from './mandarinCatalogEntry'

/**
 * Adds the games that bring their own card to the catalog, after the built-in ones.
 * Safe to call more than once. A game's card lives here, not in `gameCatalog.ts`,
 * so the shared catalog has no import into that game.
 */
export function registerGames(): void {
  registerGame(MANDARIN_CATALOG_ENTRY)
}
