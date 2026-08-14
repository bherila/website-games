// Renders public/mascot.svg into the raster brand assets: PWA icons
// (any + maskable) and favicon.ico. Run after editing the mascot:
//   node scripts/render-brand-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

const mascot = await readFile(join(publicDir, 'mascot.svg'), 'utf8')

// Maskable icons must be full-bleed (no transparent rounded corners) with the
// artwork inside the central 80% safe zone.
const maskable = mascot
  .replace('rx="96"', 'rx="0"')
  .replace('<!-- Ear pods -->', '<g transform="translate(51.2 51.2) scale(0.8)"><!-- Ear pods -->')
  .replace('</svg>', '</g></svg>')

if (!maskable.includes('<g transform=')) {
  throw new Error('mascot.svg markers changed; update render-brand-icons.mjs')
}

const browser = await chromium.launch()
const page = await browser.newPage()

async function render(svg, size) {
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>*{margin:0}</style>${sized}`)
  return page.screenshot({ omitBackground: true })
}

function buildIco(images) {
  const headerSize = 6 + 16 * images.length
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = headerSize
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4) // color planes
    header.writeUInt16LE(32, entry + 6) // bits per pixel
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(({ png }) => png)])
}

await writeFile(join(publicDir, 'pwa/icon-192.png'), await render(mascot, 192))
await writeFile(join(publicDir, 'pwa/icon-512.png'), await render(mascot, 512))
await writeFile(join(publicDir, 'pwa/icon-maskable-192.png'), await render(maskable, 192))
await writeFile(join(publicDir, 'pwa/icon-maskable-512.png'), await render(maskable, 512))

const favicon = buildIco([
  { size: 16, png: await render(mascot, 16) },
  { size: 32, png: await render(mascot, 32) },
  { size: 48, png: await render(mascot, 48) },
])
await writeFile(join(publicDir, 'favicon.ico'), favicon)

await browser.close()
console.log('Rendered pwa icons + favicon.ico from public/mascot.svg')
