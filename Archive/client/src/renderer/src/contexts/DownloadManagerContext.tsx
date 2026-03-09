import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useMutation, useQueryClient, type UseMutateFunction } from '@tanstack/react-query'
import PQueue from 'p-queue'
import {
  pullOllamaModel,
  type OllamaDownloadProgress,
  getInstalledModels,
} from '@/lib/ollama-client'
import { ollamaModelKeys } from '@/lib/queryKeys'
import { useDiskSpace } from '@/hooks/mode/useDiskSpace'

export type DownloadStatus =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface DownloadTask {
  modelId: string
  modelName: string
  status: DownloadStatus
  progress: OllamaDownloadProgress | null
  error?: string
  queuePosition?: number
  speed?: number
  estimatedTimeRemaining?: number
  createdAt: Date
  updatedAt: Date
}

interface SpeedSample {
  timestamp: number
  downloadedBytes: number
}

interface DownloadMutationVariables {
  modelId: string
  modelName: string
  modelSizeGB: number
}

interface DownloadMutationResult {
  modelId: string
  modelName: string
  completed: boolean
}

export interface DownloadManagerValue {
  downloadTask: DownloadTask | null
  isDownloading: boolean
  download: UseMutateFunction<
    DownloadMutationResult,
    Error,
    DownloadMutationVariables,
    unknown
  >
  pause: () => void
  resume: (modelId: string, modelName: string, modelSizeGB: number) => void
}

const downloadQueue = new PQueue({ concurrency: 2 })
const normalizeModelName = (name: string): string => name.replace(/:latest$/, '')

const DownloadManagerContext = createContext<DownloadManagerValue | undefined>(undefined)

export function DownloadManagerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: diskSpace } = useDiskSpace()

  const [downloadTask, setDownloadTask] = useState<DownloadTask | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const speedSamplesRef = useRef<SpeedSample[]>([])
  const lastSpeedUpdateRef = useRef<number>(0)

  const updateSpeed = useCallback((downloadedBytes: number, totalBytes?: number) => {
    const now = Date.now()
    const timeSinceLastUpdate = now - lastSpeedUpdateRef.current

    if (timeSinceLastUpdate < 500) return

    lastSpeedUpdateRef.current = now
    speedSamplesRef.current.push({ timestamp: now, downloadedBytes })

    if (speedSamplesRef.current.length > 10) {
      speedSamplesRef.current.shift()
    }

    if (speedSamplesRef.current.length >= 2) {
      const firstSample = speedSamplesRef.current[0]
      const lastSample = speedSamplesRef.current[speedSamplesRef.current.length - 1]

      const bytesDownloaded = lastSample.downloadedBytes - firstSample.downloadedBytes
      const timeElapsed = (lastSample.timestamp - firstSample.timestamp) / 1000

      const speed = timeElapsed > 0 ? bytesDownloaded / timeElapsed : 0

      let estimatedTimeRemaining: number | undefined
      if (totalBytes && speed > 0) {
        const bytesRemaining = totalBytes - downloadedBytes
        estimatedTimeRemaining = bytesRemaining / speed
      }

      setDownloadTask((prev) =>
        prev
          ? {
              ...prev,
              speed,
              estimatedTimeRemaining,
              updatedAt: new Date(),
            }
          : prev
      )
    }
  }, [])

  const handleProgress = useCallback(
    (progress: OllamaDownloadProgress) => {
      setDownloadTask((prev) => {
        if (!prev) return null

        const nextStatus: DownloadStatus =
          progress.status === 'error'
            ? 'error'
            : progress.status === 'success'
              ? 'completed'
              : 'downloading'

        return {
          ...prev,
          status: nextStatus,
          progress,
          error:
            progress.status === 'error'
              ? progress.error || prev.error
              : progress.status === 'success'
                ? undefined
                : prev.error,
          updatedAt: new Date(),
        }
      })

      if (progress.status === 'error') {
        speedSamplesRef.current = []
        return
      }

      if (progress.completed && progress.total) {
        updateSpeed(progress.completed, progress.total)
      }
    },
    [updateSpeed]
  )

  const mutation = useMutation<DownloadMutationResult, Error, DownloadMutationVariables>({
    mutationFn: async ({ modelId, modelName, modelSizeGB }) => {
      const requiredSpace = modelSizeGB * 1.2 * 1024 * 1024 * 1024
      const freeSpace = diskSpace?.free ?? null

      if (freeSpace !== null && freeSpace < requiredSpace) {
        const requiredGb = (requiredSpace / 1024 / 1024 / 1024).toFixed(1)
        const availableGb =
          freeSpace !== null ? (freeSpace / 1024 / 1024 / 1024).toFixed(1) : 'unknown'
        throw new Error(
          `Insufficient disk space. Required: ${requiredGb} GB, Available: ${availableGb} GB`
        )
      }

      const now = new Date()
      setDownloadTask({
        modelId,
        modelName,
        status: 'downloading',
        progress: null,
        createdAt: now,
        updatedAt: now,
      })

      speedSamplesRef.current = []
      lastSpeedUpdateRef.current = Date.now()

      abortControllerRef.current = new AbortController()

      try {
        await downloadQueue.add(async () => {
          await pullOllamaModel(modelId, handleProgress, abortControllerRef.current!.signal)

          const timeoutMs = 30_000
          const intervalMs = 1_000
          const deadline = Date.now() + timeoutMs
          const targetName = normalizeModelName(modelId)
          let lastError: unknown

          while (Date.now() <= deadline) {
            try {
              const models = await getInstalledModels()
              const exists = models.some(
                (model) => normalizeModelName(model.name) === targetName
              )

              if (exists) {
                return
              }
            } catch (error) {
              lastError = error
            }

            await new Promise((resolve) => setTimeout(resolve, intervalMs))
          }

          const lastErrorMessage =
            lastError instanceof Error ? ` Last error: ${lastError.message}` : ''

          throw new Error(
            `Model download finished but Ollama did not report "${modelId}" as installed within ${Math.round(
              timeoutMs / 1000
            )}s.${lastErrorMessage}`
          )
        })

        setDownloadTask((prev) => {
          if (!prev) return null

          const prevProgress = prev.progress ?? {
            status: 'success' as OllamaDownloadProgress['status'],
            percent: 100,
          }

          return {
            ...prev,
            status: 'completed',
            progress: { ...prevProgress, status: 'success', percent: 100 },
            updatedAt: new Date(),
          }
        })

        return { modelId, modelName, completed: true }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { modelId, modelName, completed: false }
        }
        throw error
      }
    },
    onSuccess: (data) => {
      if (data.completed) {
        queryClient.invalidateQueries({ queryKey: ollamaModelKeys.installed() })
        queryClient.invalidateQueries({ queryKey: ollamaModelKeys.available() })
        queryClient.invalidateQueries({ queryKey: ['disk-space', 'ollama'] })

        setTimeout(() => {
          setDownloadTask(null)
        }, 1500)
      }
    },
    onError: (error: Error) => {
      if (error.name === 'AbortError') {
        return
      }

      setDownloadTask((prev) =>
        prev
          ? {
              ...prev,
              status: 'error',
              error: error.message,
              updatedAt: new Date(),
            }
          : null
      )
    },
  })

  const pause = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setDownloadTask((prev) =>
      prev
        ? {
            ...prev,
            status: 'paused',
            updatedAt: new Date(),
          }
        : null
    )

    speedSamplesRef.current = []
  }, [])

  const resume = useCallback(
    (modelId: string, modelName: string, modelSizeGB: number) => {
      mutation.mutate({ modelId, modelName, modelSizeGB })
    },
    [mutation]
  )

  const download = useCallback<
    UseMutateFunction<DownloadMutationResult, Error, DownloadMutationVariables, unknown>
  >(
    (variables, options) => {
      mutation.mutate(variables, options)
    },
    [mutation]
  )

  const value = useMemo<DownloadManagerValue>(
    () => ({
      downloadTask,
      isDownloading: mutation.isPending,
      download,
      pause,
      resume,
    }),
    [downloadTask, mutation.isPending, download, pause, resume]
  )

  return (
    <DownloadManagerContext.Provider value={value}>
      {children}
    </DownloadManagerContext.Provider>
  )
}

export function useDownloadManagerContext(): DownloadManagerValue {
  const context = useContext(DownloadManagerContext)
  if (!context) {
    throw new Error('useDownloadManagerContext must be used within a DownloadManagerProvider')
  }
  return context
}
