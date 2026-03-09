import { useDownloadManagerContext } from '@/contexts/DownloadManagerContext'

export type { DownloadTask, DownloadStatus } from '@/contexts/DownloadManagerContext'

export function useDownloadModel() {
  return useDownloadManagerContext()
}
