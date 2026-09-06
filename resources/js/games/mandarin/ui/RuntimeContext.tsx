import { createContext, type ReactElement, type ReactNode, useContext } from 'react'

import type { MandarinRuntime } from '../runtime/MandarinRuntime'

const RuntimeContext = createContext<MandarinRuntime | null>(null)

export function RuntimeProvider({ runtime, children }: { runtime: MandarinRuntime; children: ReactNode }): ReactElement {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
}

export function useRuntime(): MandarinRuntime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('useRuntime must be used inside RuntimeProvider')
  return runtime
}
