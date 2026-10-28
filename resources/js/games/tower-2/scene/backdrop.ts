import skylineUrl from '../assets/dusk-skyline.webp'

/** Static screen-space art: quarter turns and idle rendering need no extra GPU work. */
export function attachBackdrop(canvas: HTMLCanvasElement): () => void {
  const style = canvas.style
  const previous = { image: style.backgroundImage, size: style.backgroundSize, position: style.backgroundPosition, repeat: style.backgroundRepeat }
  style.backgroundImage = `linear-gradient(rgba(20, 16, 52, 0.32), rgba(20, 16, 52, 0.45)), url("${skylineUrl}")`
  style.backgroundSize = 'cover'
  style.backgroundPosition = 'center bottom'
  style.backgroundRepeat = 'no-repeat'
  let released = false
  return () => {
    if (released) return
    released = true
    style.backgroundImage = previous.image
    style.backgroundSize = previous.size
    style.backgroundPosition = previous.position
    style.backgroundRepeat = previous.repeat
  }
}
