import { useCallback, useRef, useState } from "react"

export function useSingleFlight() {
  const inFlightRef = useRef(false)
  const [isRunning, setIsRunning] = useState(false)

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current) return undefined
    inFlightRef.current = true
    setIsRunning(true)
    try {
      return await fn()
    } finally {
      inFlightRef.current = false
      setIsRunning(false)
    }
  }, [])

  return { run, isRunning }
}
