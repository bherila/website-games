/**
 * The frontend tsconfig ships no Node types, so Node modules are reached through
 * declared ambients (as in completedTowerFixture.test.tsx); Jest provides the real ones.
 */
declare function require(moduleName: string): unknown
declare const process: { execPath: string, cwd(): string }

interface FsLike {
  mkdirSync(dir: string, options: { recursive: boolean }): void
  mkdtempSync(prefix: string): string
  rmSync(target: string, options: { recursive: boolean, force: boolean }): void
  writeFileSync(file: string, content: string): void
}
interface PathLike {
  dirname(p: string): string
  join(...parts: string[]): string
}
interface SpawnResult { status: number | null, stdout: string, stderr: string }

const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs') as FsLike
const { spawnSync } = require('node:child_process') as {
  spawnSync(command: string, args: string[], options: { encoding: 'utf8' }): SpawnResult
}
const { tmpdir } = require('node:os') as { tmpdir(): string }
const path = require('node:path') as PathLike

const SCRIPT = path.join(process.cwd(), 'scripts/check-mandarin-boundary.mjs')

function run(files: Record<string, string>): { status: number | null, output: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'mandarin-boundary-'))
  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), content)
    }
    const result = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
    return { status: result.status, output: `${result.stdout}${result.stderr}` }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const INSIDE = { 'resources/js/games/mandarin/index.tsx': "import './ui/Thing'\n" }

describe('Mandarin boundary guard', () => {
  it('passes when only Mandarin and allow-listed files touch the folder', () => {
    const { status } = run({
      ...INSIDE,
      'resources/js/games/game-select/mandarinCatalogEntry.ts': "import { x } from '../mandarin/previewSummary'\n",
      'resources/js/games/2048/game.ts': "import { y } from '../_shared/thing'\n",
      'routes/web.php': "<?php\nRoute::get('/', fn () => 1);\n",
    })
    expect(status).toBe(0)
  })

  it.each([
    ['relative import', "import { x } from '../mandarin/previewSummary'"],
    ['alias import', "import { x } from '@/games/mandarin/domain/course'"],
    ['re-export', "export { x } from '../mandarin/domain/course'"],
    ['side-effect import', "import '../mandarin/index'"],
    ['dynamic import', "const m = await import('../mandarin/MandarinGame')"],
    ['require', "const m = require('../mandarin/MandarinGame')"],
    ['jest.mock', "jest.mock('../mandarin/adapters/previewStore')"],
    ['multi-line import', "import {\n  a,\n  b,\n} from '../mandarin/domain/progress'"],
  ])('fails on a %s from a shared file', (_label, line) => {
    const { status, output } = run({ ...INSIDE, 'resources/js/games/pwa/serviceWorkerPolicy.ts': `${line}\n` })
    expect(status).toBe(1)
    expect(output).toContain('resources/js/games/pwa/serviceWorkerPolicy.ts')
  })

  it.each([
    "import type { AudioApi } from './mandarin/audioApi'",
    "import type { AudioState } from '@/admin/mandarin/types'",
    "const m = import('./mandarin/MandarinAudioDashboard')",
    "export { x } from './mandarin/types'",
    "import { x } from '../games/mandarin/domain/course'",
  ])('rejects AdminPage reaching past its barrel: %s', (source) => {
    const result = run({ ...INSIDE, 'resources/js/admin/AdminPage.tsx': source })
    expect(result.status).toBe(1)
    expect(result.output).toContain('resources/js/admin/AdminPage.tsx')
  })

  it('does not flag a game whose name merely starts with mandarin', () => {
    expect(run({ ...INSIDE, 'resources/js/games/a/b.ts': "import x from '../mandarin-lite/x'\n" }).status).toBe(0)
  })

  it('protects the admin module with a single shared AdminPage seam', () => {
    const files = {
      ...INSIDE,
      'resources/js/admin/mandarin/index.ts': "export { MandarinAudioDashboard } from './MandarinAudioDashboard'\n",
      'resources/js/admin/mandarin/MandarinAudioDashboard.tsx': "import type { AudioApi } from './audioApi'\n",
      'resources/js/admin/mandarin/__tests__/dashboard.test.tsx': "import { MandarinAudioDashboard } from '../index'\n",
      'resources/js/admin/AdminPage.tsx': "import { MandarinAudioDashboard } from './mandarin'\n",
    }
    expect(run(files).status).toBe(0)
    for (const specifier of [
      '../mandarin/audioApi', '@/admin/mandarin/types',
    ]) {
      const result = run({ ...files, 'resources/js/admin/shared/helper.ts': `import { x } from '${specifier}'\n` })
      expect(result.status).toBe(1)
      expect(result.output).toContain('resources/js/admin/shared/helper.ts')
    }
  })

  it('fails when Mandarin routes return to the shared route files', () => {
    for (const file of ['routes/web.php', 'routes/api.php']) {
      const { status, output } = run({ ...INSIDE, [file]: "<?php\nRoute::get('/mandarin', fn () => 1);\n" })
      expect(status).toBe(1)
      expect(output).toContain(`${file}:2`)
    }
  })
})
