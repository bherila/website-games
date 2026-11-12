/** Own allocations immediately, including resources whose view never finishes construction. */
export class SceneResources {
  private readonly resources = new Set<{ dispose(): void }>()

  own<T extends { dispose(): void }>(resource: T): T {
    this.resources.add(resource)

    return resource
  }

  dispose(): void {
    for (const resource of [...this.resources].reverse()) {
      safely(() => resource.dispose())
    }
    this.resources.clear()
  }
}

/** Cleanup must continue when a driver or an individual resource fails to dispose. */
export function safely(cleanup: () => void): void {
  try {
    cleanup()
  } catch {
    // A failed graphics context may also reject its teardown operations.
  }
}
