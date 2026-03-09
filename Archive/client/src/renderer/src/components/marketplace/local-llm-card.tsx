/**
 * LocalLLMCard Component
 *
 * 显示单个本地 LLM 模型的卡片（带 HoverCard 特效）
 *
 * 功能：
 * - 显示模型基本信息（名称、提供者、大小、GPU 要求等）
 * - 显示下载状态徽章（Available / Installed）
 * - 显示推荐标签（Recommended, Fastest, Popular 等）
 * - HoverCard 特效动画
 * - 未来将集成下载和删除功能（Phase 4 & 6）
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LocalLLMModelWithStatus } from '@/hooks/ollama-models/queries/useAvailableModels'
import { CheckCircle2, Download, Loader2, Trash2 } from 'lucide-react'
import { formatModelSize } from '@/lib/ollama-client'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useDownloadModel } from '@/hooks/ollama-models/mutations/useDownloadModel'
import { useDeleteModel } from '@/hooks/ollama-models/mutations/useDeleteModel'
import { useModelUsage } from '@/hooks/mode/useModelUsage'
import { ModelDownloadProgress } from './model-download-progress'
import { ModelDeleteDialog } from './model-delete-dialog'
import { toast } from 'sonner'

interface LocalLLMCardProps {
  model: LocalLLMModelWithStatus
  index: number
  hoveredIndex: number | null
  onHover: (index: number | null) => void
}

/**
 * 本地 LLM 模型卡片组件（带 HoverCard 特效）
 *
 * @example
 * ```tsx
 * <LocalLLMCard
 *   model={model}
 *   index={0}
 *   hoveredIndex={hoveredIndex}
 *   onHover={setHoveredIndex}
 * />
 * ```
 */
export function LocalLLMCard({ model, index, hoveredIndex, onHover }: LocalLLMCardProps) {
  const isInstalled = model.downloadStatus === 'installed'
  const { downloadTask, isDownloading, download, pause, resume } = useDownloadModel()
  const deleteMutation = useDeleteModel()
  const { data: modelUsage } = useModelUsage(model.model)

  // State for delete dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // Check if this model is currently being downloaded, paused, or just completed
  const isThisModelActive =
    downloadTask?.modelId === model.model &&
    ['queued', 'downloading', 'paused', 'completed', 'error'].includes(downloadTask.status)

  /**
   * Handle download button click
   */
  const handleDownload = () => {
    try {
      download(
        {
          modelId: model.model,
          modelName: model.name,
          modelSizeGB: model.size,
        },
        {
          onSuccess: () => {
            toast.success(`${model.name} downloaded successfully!`)
          },
          onError: (error: Error) => {
            toast.error(`Failed to download ${model.name}: ${error.message}`)
          },
        }
      )
    } catch (error) {
      toast.error(
        `Failed to start download: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Handle pause button click
   */
  const handlePause = () => {
    pause()
    toast.info(`Download paused: ${model.name}`)
  }

  /**
   * Handle resume button click
   */
  const handleResume = () => {
    resume(model.model, model.name, model.size)
    toast.info(`Resuming download: ${model.name}`)
  }

  /**
   * Handle delete button click
   */
  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true)
  }

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = () => {
    deleteMutation.mutate(model.model, {
      onSuccess: () => {
        toast.success(`${model.name} deleted successfully!`)
        setIsDeleteDialogOpen(false)
      },
      onError: (error: Error) => {
        // Handle different error types
        if (error.message.includes('in use') || error.message.includes('in_use')) {
          toast.error(`Cannot delete ${model.name}: Model is currently in use`)
        } else if (error.message.includes('permission') || error.message.includes('EACCES')) {
          toast.error(`Cannot delete ${model.name}: Permission denied`)
        } else if (error.message.includes('locked') || error.message.includes('EBUSY')) {
          toast.error(`Cannot delete ${model.name}: File is locked`)
        } else {
          toast.error(`Failed to delete ${model.name}: ${error.message}`)
        }
      },
    })
  }

  return (
    <div
      className="relative group block p-2 h-full w-full"
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      {/* HoverCard 背景动画 */}
      <AnimatePresence>
        {hoveredIndex === index && (
          <motion.span
            className="absolute inset-0 h-full w-full bg-neutral-200 dark:bg-slate-800/[0.8] block rounded-2xl"
            layoutId="hoverBackground"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: 0.15 },
            }}
            exit={{
              opacity: 0,
              transition: { duration: 0.15, delay: 0.2 },
            }}
          />
        )}
      </AnimatePresence>

      {/* 卡片内容 */}
      <Card className="relative z-20 h-full hover:border-primary/50 transition-colors">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{model.name}</CardTitle>
              <CardDescription>by {model.provider}</CardDescription>
            </div>

            {/* 删除按钮 */}
            {isInstalled && (
              <Badge variant="outline" className="cursor-pointer" onClick={handleDeleteClick}>
                Delete
              </Badge>
            )}
          </div>

          {/* 推荐标签 */}
          {model.tags && model.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {model.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* 模型描述 */}
          {model.description && (
            <p className="text-sm text-muted-foreground">{model.description}</p>
          )}

          {/* 模型信息 */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Size: </span>
              <span>{formatModelSize(model.size)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">GPU: </span>
              <span>{model.minGPU}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Updated: </span>
              <span>{model.updatedAt}</span>
            </div>
          </div>

          {/* 已安装模型的额外信息 */}
          {isInstalled && model.installedSize && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              Installed: {formatModelSize(model.installedSize)}
              {model.installedAt && ` • ${new Date(model.installedAt).toLocaleDateString()}`}
            </div>
          )}

          {/* Download button or progress (only for non-installed models) */}
          {!isInstalled && (
            <div className="pt-3 border-t">
              {isThisModelActive && downloadTask ? (
                // Show download progress with control buttons
                <ModelDownloadProgress
                  downloadTask={downloadTask}
                  onPause={handlePause}
                  onResume={handleResume}
                />
              ) : (
                // Show download button
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-full"
                  variant="default"
                >
                  <>Download</>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <ModelDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        modelName={model.name}
        modelSize={model.size}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMutation.isPending}
        isInUse={modelUsage?.inUse ?? false}
        usingSessions={modelUsage?.sessions?.map((s) => s.name) ?? []}
      />
    </div>
  )
}

/**
 * LocalLLMCardGrid Component
 *
 * 管理多个 LocalLLMCard 的网格布局和 hover 状态
 */
interface LocalLLMCardGridProps {
  models: LocalLLMModelWithStatus[]
}

export function LocalLLMCardGrid({ models }: LocalLLMCardGridProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {models.map((model, index) => (
        <LocalLLMCard
          key={model.model}
          model={model}
          index={index}
          hoveredIndex={hoveredIndex}
          onHover={setHoveredIndex}
        />
      ))}
    </div>
  )
}
