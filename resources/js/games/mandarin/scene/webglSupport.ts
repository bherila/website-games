/** Cheap capability probe so the DOM screen never waits on a Three.js import that cannot work. */
export function probeWebGl(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context) return false
    const loseContext = (context as WebGLRenderingContext).getExtension('WEBGL_lose_context')
    loseContext?.loseContext()
    return true
  } catch {
    return false
  }
}
