/** Factories own allocations until they can hand a complete object to the scene. */
interface Disposable { dispose: () => void }
let current: Disposable[] | null = null
const allocations = new WeakMap<object, Disposable[]>()

export function ownedResources(root: object): readonly Disposable[] {
  return allocations.get(root) ?? []
}

export function own<T extends Disposable>(resource: T): T {
  current?.push(resource)
  return resource
}

export function buildOwned<T>(build: () => T): T {
  const parent = current
  const resources: Disposable[] = []
  current = resources
  try {
    const result = build()
    if (parent) parent.push(...resources)
    else if (result && typeof result === 'object') {
      const output = result as { isObject3D?: boolean; group?: object; mesh?: object }
      const root = output.isObject3D ? output : output.group ?? output.mesh ?? output
      allocations.set(root, resources)
    }
    return result
  } catch (error) {
    for (const resource of new Set(resources.reverse())) {
      try { resource.dispose() } catch { /* Release every allocation even if one owner fails. */ }
    }
    throw error
  } finally {
    current = parent
  }
}
