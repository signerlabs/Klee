'use client'

import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  AlertCircle,
  CheckCircle2,
  CircleCheck,
  Ellipsis,
  Loader2,
  Trash2,
  UploadCloud,
  Share2,
  Globe,
} from 'lucide-react'
import { useAlert } from '@/components/ui/alert-provider'
import { useMode } from '@/contexts/ModeContext'
import { useKnowledgeBase } from '@/hooks/knowledge-base/queries/useKnowledgeBase'
import { useUpdateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useUpdateKnowledgeBase'
import { useUploadKnowledgeBaseFile } from '@/hooks/knowledge-base/mutations/useUploadKnowledgeBaseFile'
import { useDeleteKnowledgeBaseFile } from '@/hooks/knowledge-base/mutations/useDeleteKnowledgeBaseFile'
import { useDeleteKnowledgeBase } from '@/hooks/knowledge-base/mutations/useDeleteKnowledgeBase'
import { useShareKnowledgeBase } from '@/hooks/marketplace/mutations/useShareKnowledgeBase'
import { useNavigate } from '@tanstack/react-router'
import type { KnowledgeBaseFile, KnowledgeBaseFormErrors } from '@/types'

// 类型守卫：检查是否为 Cloud Mode 知识库（有 isPublic 字段）
const isCloudKnowledgeBase = (
  kb: any
): kb is KnowledgeBase & { isPublic: boolean; shareSlug: string | null } => {
  return kb && 'isPublic' in kb
}

const formatFileSize = (bytes: number): string => {
  if (!bytes || Number.isNaN(bytes)) {
    return '0 Bytes'
  }

  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${Math.round(value * 100) / 100} ${sizes[i]}`
}

const formatDateTime = (value: string | Date | number) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }
  return date.toLocaleString()
}

function KnowledgeBaseContent() {
  const { knowledgeBaseId } = Route.useParams()
  const { source } = Route.useSearch()
  const { showAlert } = useAlert()
  const navigate = useNavigate()
  const { isPrivateMode } = useMode()
  const isTelegramMode = source === 'telegram'

  // 使用新的 TanStack Query 查询钩子
  const { data, isLoading, isError, refetch } = useKnowledgeBase(knowledgeBaseId)

  // 使用带乐观更新的变更钩子
  const updateMutation = useUpdateKnowledgeBase()
  const uploadMutation = useUploadKnowledgeBaseFile()
  const deleteFileMutation = useDeleteKnowledgeBaseFile()
  const deleteMutation = useDeleteKnowledgeBase()
  const shareMutation = useShareKnowledgeBase()

  // T058: 跟踪正在处理的文件 (Private Mode)
  const [processingFiles, setProcessingFiles] = React.useState<Set<string>>(new Set())

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // 从查询结果中提取数据
  // 注意：Hono RPC 返回的结构是 { knowledgeBase: {...}, files: [...] }
  const knowledgeBase = data?.knowledgeBase
  const files = (data?.files ?? []) as KnowledgeBaseFile[]

  const uploadDescription = React.useMemo(
    () =>
      isTelegramMode
        ? 'Upload Telegram chat JSON files to keep them in sync with your knowledge base.'
        : 'Upload documents to keep them in sync with your knowledge base.',
    [isTelegramMode]
  )

  const acceptedFileTypes = React.useMemo(
    () => (isTelegramMode ? '.json,application/json' : '.txt,.md,.pdf,.docx,.json'),
    [isTelegramMode]
  )

  // T058: 监听 Private Mode 文件处理完成/失败事件
  React.useEffect(() => {
    if (!isPrivateMode || !window.api?.knowledgeBase?.onFileProcessingComplete) {
      return
    }

    const handleComplete = (payload: {
      knowledgeBaseId: string
      fileId: string
      status: 'completed' | 'failed'
    }) => {
      if (payload.knowledgeBaseId === knowledgeBaseId) {
        setProcessingFiles((prev) => {
          const next = new Set(prev)
          next.delete(payload.fileId)
          return next
        })

        if (payload.status === 'completed') {
          showAlert({
            title: 'File processed',
            description: 'The file has been embedded and is ready to use.',
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        }
      }
    }

    const handleError = (payload: FileProcessingError) => {
      if (payload.knowledgeBaseId && payload.knowledgeBaseId !== knowledgeBaseId) {
        return
      }

      setProcessingFiles((prev) => {
        const next = new Set(prev)
        next.delete(payload.fileId)
        return next
      })

      showAlert({
        title: 'File processing failed',
        description: payload.message,
        variant: 'destructive',
        icon: <AlertCircle className="h-4 w-4" />,
      })
    }

    window.api.knowledgeBase.onFileProcessingComplete(handleComplete)
    window.api.knowledgeBase.onFileProcessingError?.(handleError)

    return () => {
      window.api.knowledgeBase.removeFileProcessingListeners?.()
    }
  }, [isPrivateMode, knowledgeBaseId, showAlert])

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [fieldErrors, setFieldErrors] = React.useState<KnowledgeBaseFormErrors>({})
  const [deletingFileId, setDeletingFileId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!knowledgeBase) {
      return
    }

    const nextName = knowledgeBase.name ?? ''
    const nextDescription = knowledgeBase.description ?? ''

    setName((prev) => (prev === nextName ? prev : nextName))
    setDescription((prev) => (prev === nextDescription ? prev : nextDescription))
  }, [knowledgeBase?.id, knowledgeBase?.name, knowledgeBase?.description])

  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  const originalName = knowledgeBase?.name ?? ''
  const originalDescription = knowledgeBase?.description ?? ''

  const hasMetadataChanges =
    trimmedName !== originalName || trimmedDescription !== originalDescription

  const validateMetadata = React.useCallback(() => {
    const errors: KnowledgeBaseFormErrors = {}

    if (!trimmedName) {
      errors.name = 'Name is required.'
    } else if (trimmedName.length > 200) {
      errors.name = 'Name must be 200 characters or fewer.'
    }

    if (trimmedDescription.length > 1000) {
      errors.description = 'Description must be 1000 characters or fewer.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [trimmedName, trimmedDescription])

  const handleSaveMetadata = React.useCallback(() => {
    if (!validateMetadata()) {
      return
    }

    // 使用带乐观更新的变更钩子
    // 缓存会立即更新，无需手动管理
    updateMutation.mutate(
      {
        id: knowledgeBaseId,
        payload: {
          name: trimmedName,
          description: trimmedDescription,
        },
      },
      {
        onSuccess: () => {
          setFieldErrors({})
          showAlert({
            title: 'Changes saved',
            description: 'Knowledge base details updated.',
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          showAlert({
            title: 'Failed to update knowledge base',
            description: message,
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
      }
    )
  }, [
    updateMutation,
    validateMetadata,
    knowledgeBaseId,
    trimmedName,
    trimmedDescription,
    showAlert,
  ])

  const handleResetMetadata = React.useCallback(() => {
    if (!knowledgeBase) {
      return
    }

    setName(knowledgeBase.name ?? '')
    setDescription(knowledgeBase.description ?? '')
    setFieldErrors({})
  }, [knowledgeBase])

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? []
    if (!file) {
      return
    }

    if (isTelegramMode) {
      const lowerName = file.name.toLowerCase()
      const isJson =
        lowerName.endsWith('.json') ||
        file.type === 'application/json' ||
        file.type === 'text/json'

      if (!isJson) {
        showAlert({
          title: 'Invalid file type',
          description: 'Telegram chat data only supports .json files.',
          variant: 'destructive',
          icon: <AlertCircle className="h-4 w-4" />,
        })
        event.target.value = ''
        return
      }
    }

    // 使用新的上传钩子，带自动缓存失效
    uploadMutation.mutate(
      { knowledgeBaseId, file },
      {
        onSuccess: (result) => {
          // Private Mode: 将文件 ID 添加到处理集合
          if (isPrivateMode && result && 'fileId' in result) {
            setProcessingFiles((prev) => new Set(prev).add(result.fileId))
          } else if (result && 'file' in result) {
            // Cloud Mode: 立即显示成功提示
            showAlert({
              title: 'File uploaded',
              description: 'The file has been processed successfully.',
              icon: <CheckCircle2 className="h-4 w-4" />,
            })
          }
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          showAlert({
            title: 'File upload failed',
            description: message,
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
      }
    )
    event.target.value = ''
  }

  const handleDeleteFile = (file: KnowledgeBaseFile) => {
    setDeletingFileId(file.id)

    // 使用新的删除钩子，带乐观更新
    // 文件会立即从 UI 中移除，如果失败会自动回滚
    deleteFileMutation.mutate(
      { knowledgeBaseId, fileId: file.id },
      {
        onSuccess: () => {
          showAlert({
            title: 'File deleted',
            description: `Removed "${file.fileName}" from this knowledge base.`,
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          showAlert({
            title: 'Failed to delete file',
            description: message,
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
        onSettled: () => {
          // 无论成功或失败，都清除删除状态
          setDeletingFileId(null)
        },
      }
    )
  }

  // 检查是否有已完成的文件
  const hasCompletedFiles = React.useMemo(() => {
    return files.some((file) => file.status === 'completed')
  }, [files])

  // T036: 处理分享/取消分享知识库 (仅 Cloud Mode)
  const handleToggleShare = React.useCallback(() => {
    if (!knowledgeBase || !isCloudKnowledgeBase(knowledgeBase)) {
      return
    }

    const newIsPublic = !knowledgeBase.isPublic

    // 如果要分享但没有已完成的文件，显示错误提示
    if (newIsPublic && !hasCompletedFiles) {
      showAlert({
        title: 'Cannot share knowledge base',
        description: 'Please upload and process at least one file before sharing.',
        variant: 'destructive',
        icon: <AlertCircle className="h-4 w-4" />,
      })
      return
    }

    shareMutation.mutate(
      { id: knowledgeBaseId, isPublic: newIsPublic },
      {
        onSuccess: () => {
          showAlert({
            title: newIsPublic ? 'Shared to Marketplace' : 'Removed from Marketplace',
            description: newIsPublic
              ? 'Your knowledge base is now public and visible in the marketplace.'
              : 'Your knowledge base is now private.',
            icon: <CheckCircle2 className="h-4 w-4" />,
          })
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          showAlert({
            title: 'Failed to update sharing status',
            description: message,
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
      }
    )
  }, [knowledgeBase, knowledgeBaseId, shareMutation, showAlert, hasCompletedFiles])

  // T057: 处理删除知识库
  // T059: 包含加载状态
  const handleDeleteKnowledgeBase = React.useCallback(() => {
    deleteMutation.mutate(knowledgeBaseId, {
      onSuccess: () => {
        showAlert({
          title: 'Knowledge Base Deleted',
          description: 'The knowledge base and all its files have been permanently removed.',
          icon: <CheckCircle2 className="h-4 w-4" />,
        })
        // 导航回知识库列表页
        navigate({ to: '/knowledge-base' })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        showAlert({
          title: 'Failed to Delete',
          description: message,
          variant: 'destructive',
          icon: <AlertCircle className="h-4 w-4" />,
        })
      },
    })
  }, [knowledgeBaseId, deleteMutation, showAlert, navigate])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading knowledge base…</span>
      </div>
    )
  }

  if (isError || !knowledgeBase) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <div>
          <p className="text-lg font-semibold">Unable to load knowledge base</p>
          <p className="text-sm text-muted-foreground">
            Please check your connection and try again.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
        <Card className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="knowledge-base-name">Name</Label>
            <Input
              id="knowledge-base-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter knowledge base name"
              maxLength={200}
            />
            {fieldErrors.name ? (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="knowledge-base-description">Description</Label>
            <Textarea
              id="knowledge-base-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what this knowledge base includes"
              maxLength={1000}
              rows={5}
            />
            {fieldErrors.description ? (
              <p className="text-sm text-destructive">{fieldErrors.description}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {!isPrivateMode && isCloudKnowledgeBase(knowledgeBase) && knowledgeBase.isPublic && (
                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <Globe className="h-3 w-3" />
                  <span>Shared to Marketplace</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              {!isPrivateMode &&
                isCloudKnowledgeBase(knowledgeBase) &&
                (knowledgeBase.isPublic ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={shareMutation.isPending}>
                        {shareMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Share2 className="mr-2 h-4 w-4" />
                        )}
                        Unshare
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unshare from Marketplace?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This knowledge base will be removed from the marketplace and will no
                          longer be visible to other users. This action can be reversed by sharing
                          again later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={shareMutation.isPending}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={shareMutation.isPending}
                          onClick={handleToggleShare}
                        >
                          {shareMutation.isPending ? (
                            <>
                              Unsharing
                              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                            </>
                          ) : (
                            'Unshare'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleToggleShare}
                    disabled={shareMutation.isPending || !hasCompletedFiles}
                    title={
                      !hasCompletedFiles
                        ? 'Please upload and process at least one file before sharing'
                        : undefined
                    }
                  >
                    {shareMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Share2 className="mr-2 h-4 w-4" />
                    )}
                    Share to Marketplace
                  </Button>
                ))}
              <Button
                variant="ghost"
                onClick={handleResetMetadata}
                disabled={!hasMetadataChanges || updateMutation.isPending}
              >
                Reset
              </Button>
              <Button
                onClick={handleSaveMetadata}
                disabled={!hasMetadataChanges || updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="animate-spin" /> : 'Save'}
              </Button>
              {/* T057: 删除知识库按钮（带确认对话框） */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Knowledge Base?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the knowledge base and all its files, embeddings,
                      and associations with agents. This action cannot be undone.
                      {isCloudKnowledgeBase(knowledgeBase) && knowledgeBase.isPublic && (
                        <>
                          <br />
                          <br />
                          <strong>Note:</strong> This knowledge base is currently shared in the
                          marketplace. Deleting it will also remove it from the marketplace.
                        </>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteMutation.isPending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteMutation.isPending}
                      onClick={handleDeleteKnowledgeBase}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMutation.isPending ? (
                        <>
                          Deleting
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        </>
                      ) : (
                        'Delete Permanently'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Files</h2>
              <p className="text-sm text-muted-foreground">{uploadDescription}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedFileTypes}
                className="hidden"
                onChange={handleFileInputChange}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending || (isPrivateMode && processingFiles.size > 0)}
              >
                <UploadCloud className="mr-2 h-4 w-4" />
                {isPrivateMode && processingFiles.size > 0
                  ? 'Processing…'
                  : uploadMutation.isPending
                    ? 'Uploading…'
                    : isTelegramMode
                      ? 'Upload JSON'
                      : 'Upload file'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file: KnowledgeBaseFile) => {
                  const isDeleting = deletingFileId === file.id
                  const statusDisplay = (() => {
                    const normalizedStatus =
                      typeof file.status === 'string' ? file.status.trim().toLowerCase() : ''

                    switch (normalizedStatus) {
                      case 'processing':
                        return {
                          icon: <Loader2 className="h-4 w-4 animate-spin" />,
                          label: 'Processing',
                          color: 'text-black',
                        }
                      case 'failed':
                        return {
                          icon: <AlertCircle className="h-4 w-4 text-red-500" />,
                          label: 'Failed',
                          color: 'text-red-600',
                        }
                      case 'completed':
                        return {
                          icon: <CircleCheck className="h-4 w-4 text-emerald-500" />,
                          label: 'Completed',
                          color: 'text-emerald-600',
                        }
                      default:
                        return {
                          icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
                          label: 'Processing',
                          color: 'text-blue-600',
                        }
                    }
                  })()

                  return (
                    <TableRow key={file.id}>
                      <TableCell className="max-w-[240px] truncate font-medium">
                        {file.fileName}
                      </TableCell>
                      <TableCell>{formatFileSize(file.fileSize)}</TableCell>
                      <TableCell>{formatDateTime(file.createdAt)}</TableCell>
                      <TableCell className="flex items-center gap-2">
                        {statusDisplay.icon}
                        <span className={`text-sm ${statusDisplay.color}`}>
                          {statusDisplay.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="rounded-md p-1 hover:bg-muted">
                              <Ellipsis className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-44">
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this file?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Removing this file will also remove its related embeddings. This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={isDeleting}
                                onClick={() => {
                                  void handleDeleteFile(file)
                                }}
                              >
                                {isDeleting ? (
                                  <>
                                    Deleting
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                  </>
                                ) : (
                                  'Delete'
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableCaption>
                {files.length === 0
                  ? 'Start by uploading your first file.'
                  : `Total files: ${files.length}`}
              </TableCaption>
            </Table>
          </div>
        </Card>
      </div>
    </ScrollArea>
  )
}

export const Route = createFileRoute('/_authenticated/knowledge-base/$knowledgeBaseId')({
  validateSearch: (search: Record<string, unknown>) => ({
    source: search?.source === 'telegram' ? 'telegram' : undefined,
  }),
  component: KnowledgeBaseContent,
})
