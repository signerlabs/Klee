/**
 * Model Download Progress Component
 *
 * Displays simplified download progress for Ollama models
 *
 * Features:
 * - Progress bar with percentage
 * - Control buttons (Pause, Resume)
 *
 * Note: Ollama supports resumable downloads, so pausing preserves progress.
 */

import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Pause, Play } from 'lucide-react'
import type { DownloadTask } from '@/hooks/ollama-models/mutations/useDownloadModel'

interface ModelDownloadProgressProps {
  /** Download task state */
  downloadTask: DownloadTask

  /** Pause download callback */
  onPause?: () => void

  /** Resume download callback */
  onResume?: () => void
}

/**
 * Format seconds to human-readable time string
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }
  const hours = Math.floor(seconds / 3600)
  const remainingMinutes = Math.round((seconds % 3600) / 60)
  return `${hours}h ${remainingMinutes}m`
}

export function ModelDownloadProgress({
  downloadTask,
  onPause,
  onResume,
}: ModelDownloadProgressProps) {
  const { progress, estimatedTimeRemaining, status } = downloadTask
  const errorMessage = downloadTask.error || progress?.error
  const isError = status === 'error'

  // Get progress percentage
  const progressPercent = progress?.percent ?? 0

  // Determine which buttons to show based on status
  const showPauseButton = status === 'downloading'
  const showResumeButton = status === 'paused'

  return (
    <div className="space-y-2">
      {/* Progress bar and control buttons */}
      <div className="flex items-center gap-2">
        <Progress value={progressPercent} className="h-2 flex-1" />

        {/* Control buttons */}
        <div className="flex items-center gap-1">
          {/* Pause button */}
          {showPauseButton && onPause && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={onPause}
                  >
                    <Pause className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">
                    Pause download. Progress will be preserved and you can resume later.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Resume button */}
          {showResumeButton && onResume && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={onResume}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Resume download from where it left off</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Progress info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {/* Left: Percentage */}
        <span className="font-medium">{progressPercent}%</span>

        {/* Right: Time remaining or status */}
        {estimatedTimeRemaining && estimatedTimeRemaining > 0 && status === 'downloading' && (
          <span>{formatTime(estimatedTimeRemaining)} remaining</span>
        )}
        {status === 'paused' && <span className="text-yellow-600">Paused</span>}
        {status === 'completed' && <span className="text-green-600">Completed</span>}
      </div>

      {isError && errorMessage && (
        <div className="text-xs text-red-600">{errorMessage}</div>
      )}
    </div>
  )
}
