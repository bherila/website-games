import * as THREE from 'three'

/** A lost graphics context can reject teardown; always finish releasing the scene. */
export function safely(cleanup: () => void): void {
  try {
    cleanup()
  } catch {
    // Continue disposing the remaining independent resources.
  }
}

/** Collect first so one failed disposal cannot interrupt traversal or double-dispose shared resources. */
export function disposeScene(scene: THREE.Object3D): void {
  const resources = new Set<{ dispose(): void }>()
  scene.traverse((object) => {
    if (object instanceof THREE.Light) resources.add(object)
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      if (object.geometry.userData.cached !== true) resources.add(object.geometry)
      for (const material of [object.material].flat()) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture && value.userData.cached !== true) resources.add(value)
        }
        resources.add(material)
      }
      if (object instanceof THREE.InstancedMesh) resources.add(object)
    }
  })
  for (const resource of resources) safely(() => resource.dispose())
}
