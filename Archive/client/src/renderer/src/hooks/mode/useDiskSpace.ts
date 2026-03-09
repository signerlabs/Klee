import { useQuery } from '@tanstack/react-query'

/**
 * Disk space information (transformed for easy access)
 */
export interface DiskSpaceData {
  total: number // Total bytes
  free: number // Free bytes (bavail)
  used: number // Used bytes
  percentUsed: number // Usage percentage
  totalFormatted: string
  freeFormatted: string
  usedFormatted: string
}

/**
 * Hook for querying available disk space for Ollama models
 *
 * @returns Query result containing disk space information (total, free, used bytes)
 */
export function useDiskSpace() {
  const isDiskSpaceApiAvailable =
    typeof window !== 'undefined' && Boolean(window.api?.diskSpace?.get)

  return useQuery({
    queryKey: ['disk-space', 'ollama'],
    queryFn: async (): Promise<DiskSpaceData | null> => {
      if (!isDiskSpaceApiAvailable) {
        console.warn('[useDiskSpace] Disk space API not available in current environment')
        return null
      }

      // Call IPC handler to get disk space
      const result = await window.api.diskSpace.get()

      if (!result.success || !result.data) {
        console.error('[useDiskSpace] Failed to get disk space:', result.error)
        return null
      }

      // Transform to simpler structure
      return {
        total: result.data.totalBytes,
        free: result.data.availableBytes, // Use availableBytes (considers permissions)
        used: result.data.usedBytes,
        percentUsed: result.data.percentUsed,
        totalFormatted: result.data.totalFormatted,
        freeFormatted: result.data.availableFormatted,
        usedFormatted: result.data.usedFormatted,
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every 60 seconds
    retry: isDiskSpaceApiAvailable ? 2 : false, // Retry twice when API exists
    enabled: isDiskSpaceApiAvailable,
  })
}
