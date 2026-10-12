#!/usr/bin/env node
/**
 * Mandarin boundary guard (issue #94).
 *
 * Mandarin Quest is kept in this repository but must stay separable, so that a later
 * split is a mechanical move. Two rules keep the seam from eroding:
 *
 * 1. No source file outside `resources/js/games/mandarin/` may import from it, except
 *    the allow-list below (the game-select card registration and the tests that exercise
 *    it). This covers static imports, re-exports, dynamic `import()`, `require()` and
 *    `jest.mock()`/`jest.requireActual()` specifiers.
 * 2. `routes/web.php` and `routes/api.php` contain no Mandarin lines; its routes live in
 *    `routes/mandarin.php`, loaded by `MandarinServiceProvider`.
 *
 * Usage:
 *   node scripts/check-mandarin-boundary.mjs [--root <dir>]
 *
 * Exit code 1 on any violation. Adding to the allow-list is a decision to widen the
 * coupling: do it in a PR that says so.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MANDARIN_DIR = 'resources/js/games/mandarin'

/** Files outside the Mandarin folder that may import from it. Paths are repo-relative. */
export const ALLOWED_IMPORTERS = new Set([
  // Registers Mandarin's card on the game-select page.
  'resources/js/games/game-select/mandarinCatalogEntry.ts',
  // Tests that exercise the card against real Mandarin progress.
  'resources/js/games/game-select/__tests__/GameSelectPage.test.tsx',
  // Step 3 of the plan: the audio dashboard enters through one import.
  'resources/js/admin/AdminPage.tsx',
])

/** The guard's own test, whose fixtures quote violating imports as strings. Never scanned. */
const SELF_TEST = 'tests-ts/mandarinBoundary.test.ts'

/** Route files that must not mention Mandarin at all. */
export const MANDARIN_FREE_FILES = ['routes/web.php', 'routes/api.php']

const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'public', 'storage', 'bootstrap', 'dist', 'build', 'coverage', 'test-results', 'playwright-report'])

const SPECIFIER_PATTERNS = [
  // import x from 'a' / import 'a' / export * from 'a' / export { x } from 'a'
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  // import('a') / require('a') / jest.mock('a') / jest.requireActual('a') / vi.mock('a')
  /\b(?:import|require|(?:jest|vi)\.(?:mock|doMock|requireActual|requireMock|unmock))\s*\(\s*(['"`])([^'"`\n]+)\1/g,
]

function walk(root, dir = '') {
  const files = []
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...walk(root, rel))
      }
    } else {
      files.push(rel)
    }
  }
  return files
}

function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith('.')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))
  }
  if (spec.startsWith('@/')) {
    return `resources/js/${spec.slice(2)}`
  }
  return spec
}

function pointsIntoMandarin(resolved) {
  return resolved === MANDARIN_DIR || resolved.startsWith(`${MANDARIN_DIR}/`)
}

/** @returns {string[]} one human-readable line per violation */
export function findViolations(root) {
  const violations = []

  for (const file of walk(root)) {
    if (!SOURCE_EXT.test(file) || file.startsWith(`${MANDARIN_DIR}/`) || file === SELF_TEST || ALLOWED_IMPORTERS.has(file)) {
      continue
    }
    const source = readFileSync(path.join(root, file), 'utf8')
    const seen = new Set()
    for (const pattern of SPECIFIER_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const spec = match[2]
        if (seen.has(spec)) {
          continue
        }
        seen.add(spec)
        if (pointsIntoMandarin(resolveSpecifier(spec, file))) {
          violations.push(`${file}: imports '${spec}' from the Mandarin folder; register through a shared seam instead`)
        }
      }
    }
  }

  for (const file of MANDARIN_FREE_FILES) {
    let source
    try {
      source = readFileSync(path.join(root, file), 'utf8')
    } catch {
      continue
    }
    source.split('\n').forEach((line, index) => {
      if (/mandarin/i.test(line)) {
        violations.push(`${file}:${index + 1}: Mandarin routes belong in routes/mandarin.php`)
      }
    })
  }

  return violations
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootFlag = process.argv.indexOf('--root')
  const root = rootFlag === -1
    ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    : path.resolve(process.argv[rootFlag + 1] ?? '.')
  const violations = findViolations(root)

  if (violations.length > 0) {
    console.error(`Mandarin boundary check failed (${violations.length}):`)
    for (const violation of violations) {
      console.error(`  ${violation}`)
    }
    console.error('See docs/games/mandarin.md, "Boundary and splitting".')
    process.exit(1)
  }
  console.log('Mandarin boundary check passed.')
}
