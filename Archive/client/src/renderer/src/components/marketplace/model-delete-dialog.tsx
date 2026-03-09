/**
 * Model Delete Confirmation Dialog
 *
 * 显示删除模型前的确认对话框
 *
 * 功能：
 * - 显示模型名称
 * - 显示将释放的磁盘空间
 * - 确认/取消按钮
 * - 警告模型被使用的情况
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ModelDeleteDialogProps {
  /** 是否打开对话框 */
  open: boolean

  /** 关闭对话框回调 */
  onOpenChange: (open: boolean) => void

  /** 模型名称 */
  modelName: string

  /** 模型大小（GB） */
  modelSize: number

  /** 确认删除回调 */
  onConfirm: () => void

  /** 是否正在删除 */
  isDeleting?: boolean

  /** 模型是否被使用 */
  isInUse?: boolean

  /** 使用该模型的会话列表 */
  usingSessions?: string[]
}

/**
 * Format size in GB to human-readable string
 */
function formatSizeGB(sizeGB: number): string {
  if (sizeGB < 1) {
    return `${(sizeGB * 1024).toFixed(0)} MB`
  }
  return `${sizeGB.toFixed(1)} GB`
}

/**
 * 删除模型确认对话框
 *
 * @example
 * ```tsx
 * <ModelDeleteDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   modelName="Llama 3.2 1B"
 *   modelSize={1.3}
 *   onConfirm={handleDelete}
 *   isDeleting={deleteMutation.isPending}
 * />
 * ```
 */
export function ModelDeleteDialog({
  open,
  onOpenChange,
  modelName,
  modelSize,
  onConfirm,
  isDeleting = false,
  isInUse = false,
  usingSessions = [],
}: ModelDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Model</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Are you sure you want to delete <span className="font-medium">{modelName}</span>?
              </p>
              <p>
                This will free up approximately{' '}
                <span className="font-medium">{formatSizeGB(modelSize)}</span> of disk space.
              </p>
              {isInUse && usingSessions.length > 0 && (
                <p className="text-yellow-600 text-sm pt-2">
                  ⚠️ This model is currently being used by {usingSessions.length} chat session(s).
                  Those chats will need to select a new model to continue.
                </p>
              )}
              <p className="text-muted-foreground text-sm pt-2">
                This action cannot be undone. You will need to download the model again if you
                want to use it later.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
