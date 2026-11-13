import { useEffect, useLayoutEffect, useRef } from 'react'

/** Synchronously suspend input before another queue/repeat timer can run. */
export function useInputActivity(onSuspend: () => void): { current: boolean } {
  const activeRef = useRef(!document.hidden)
  const onSuspendRef = useRef(onSuspend)
  useLayoutEffect(() => {
    onSuspendRef.current = onSuspend
  }, [onSuspend])

  useEffect(() => {
    activeRef.current = !document.hidden
    let blurred = false
    const suspend = (): void => {
      activeRef.current = false
      onSuspendRef.current()
    }
    const onBlur = (): void => {
      blurred = true
      suspend()
    }
    const onFocus = (): void => {
      blurred = false
      activeRef.current = !document.hidden
    }
    const onVisibilityChange = (): void => {
      if (document.hidden) suspend()
      else activeRef.current = !blurred
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      suspend()
    }
  }, [])

  return activeRef
}
