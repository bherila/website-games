import { attachBackdrop } from '../backdrop'

test('the backdrop is static screen-space art and releases only its own canvas styles', () => {
  const canvas = document.createElement('canvas')
  canvas.style.backgroundImage = 'linear-gradient(red, blue)'
  canvas.style.backgroundSize = 'contain'
  canvas.style.backgroundPosition = 'left top'
  canvas.style.backgroundRepeat = 'repeat-x'
  canvas.style.width = '375px'
  canvas.style.pointerEvents = 'auto'
  const before = canvas.getAttribute('style')
  const release = attachBackdrop(canvas)
  expect(canvas.style.backgroundImage).toContain('url(')
  expect(canvas.style.backgroundImage).toContain('linear-gradient')
  expect(canvas.style.backgroundSize).toBe('cover')
  expect(canvas.style.backgroundPosition).toBe('center bottom')
  expect(canvas.style.backgroundRepeat).toBe('no-repeat')
  expect(canvas.style.animation).toBe('')
  expect(canvas.style.pointerEvents).toBe('auto')
  expect(canvas.style.width).toBe('375px')
  release()
  release()
  expect(canvas.getAttribute('style')).toBe(before)
})
