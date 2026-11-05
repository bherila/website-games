/**
 * Node module hooks that let the Marble Works search import the game's TypeScript
 * directly: Node strips the types itself; this only resolves the extensionless
 * relative imports the Vite source uses ('../board/grid' → '../board/grid.ts').
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(specifier + suffix, context.parentURL)
      if (existsSync(fileURLToPath(url))) {
        return next(url.href, context)
      }
    }
  }

  return next(specifier, context)
}
