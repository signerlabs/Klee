import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from './alert'

type AlertComponentProps = React.ComponentProps<typeof Alert>
type AlertVariant = AlertComponentProps extends { variant?: infer V } ? V : never

type ShowAlertOptions = {
  id?: string
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  variant?: AlertVariant
  duration?: number
}

type AlertInstance = Required<Pick<ShowAlertOptions, 'id'>> &
  Omit<ShowAlertOptions, 'id'> & {
    createdAt: number
  }

type AlertContextValue = {
  showAlert: (options: ShowAlertOptions) => string
  dismissAlert: (id: string) => void
}

const AlertContext = createContext<AlertContextValue | null>(null)

const DEFAULT_DURATION = 5000

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertInstance[]>([])
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimer = useCallback((id: string) => {
    const existingTimeout = timeoutsRef.current.get(id)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      timeoutsRef.current.delete(id)
    }
  }, [])

  const dismissAlert = useCallback(
    (id: string) => {
      clearTimer(id)
      setAlerts((prev) => prev.filter((item) => item.id !== id))
    },
    [clearTimer]
  )

  const showAlert = useCallback(
    (options: ShowAlertOptions) => {
      const id = options.id ?? generateId()
      const duration = options.duration ?? DEFAULT_DURATION

      clearTimer(id)
      setAlerts((prev) => {
        const existing = prev.filter((item) => item.id !== id)
        const next: AlertInstance = {
          ...options,
          id,
          createdAt: Date.now(),
        }
        return [...existing, next]
      })

      if (duration > 0) {
        const timeoutId = setTimeout(() => dismissAlert(id), duration)
        timeoutsRef.current.set(id, timeoutId)
      }

      return id
    },
    [clearTimer, dismissAlert]
  )

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        clearTimeout(timeoutId)
      }
      timeoutsRef.current.clear()
    }
  }, [])

  const value = useMemo(
    () => ({
      showAlert,
      dismissAlert,
    }),
    [showAlert, dismissAlert]
  )

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AlertViewport alerts={alerts} dismissAlert={dismissAlert} />
    </AlertContext.Provider>
  )
}

export function useAlert() {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider')
  }
  return context
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

function AlertViewport({
  alerts,
  dismissAlert,
}: {
  alerts: AlertInstance[]
  dismissAlert: (id: string) => void
}) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[1000] mx-auto flex flex-col gap-3 sm:inset-x-auto sm:right-6 sm:w-full sm:max-w-sm">
      {alerts.map((alert) => (
        <Alert
          key={alert.id}
          variant={alert.variant}
          className="pointer-events-auto shadow-lg"
          role="status"
          aria-live="assertive"
        >
          {alert.icon}
          <button
            type="button"
            aria-label="Dismiss alert"
            onClick={() => dismissAlert(alert.id)}
            className="absolute right-2 top-2 rounded p-1 text-foreground/60 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
          {alert.title ? <AlertTitle>{alert.title}</AlertTitle> : null}
          {alert.description ? <AlertDescription>{alert.description}</AlertDescription> : null}
        </Alert>
      ))}
    </div>,
    document.body
  )
}
