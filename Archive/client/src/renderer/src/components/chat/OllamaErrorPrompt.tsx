/**
 * OllamaErrorPrompt Component
 *
 * 显示 Ollama 连接错误提示和解决方案
 *
 * 使用场景：
 * - Ollama 未运行
 * - Ollama 未安装
 * - 网络连接失败
 */

import { AlertCircle, Download, PlayCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useOllamaSource } from '@/hooks/mode/useOllamaSource'
import { checkOllamaAvailable } from '@/lib/ollama-client'
import { useState } from 'react'

interface OllamaErrorPromptProps {
  /** 错误消息 */
  error?: string
  /** 重试回调 */
  onRetry?: () => void
}

/**
 * OllamaErrorPrompt - Ollama 连接错误提示组件
 *
 * @example
 * ```tsx
 * <OllamaErrorPrompt
 *   error="Connection refused"
 *   onRetry={() => console.log('Retrying...')}
 * />
 * ```
 */
export function OllamaErrorPrompt({ error, onRetry }: OllamaErrorPromptProps) {
  const { source, isInitializing } = useOllamaSource()
  const [isChecking, setIsChecking] = useState(false)

  // 检查 Ollama 是否可用
  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const isAvailable = await checkOllamaAvailable()
      if (isAvailable) {
        onRetry?.()
      } else {
        alert('Ollama is still not available. Please start Ollama and try again.')
      }
    } catch (err) {
      console.error('Failed to check Ollama:', err)
    } finally {
      setIsChecking(false)
    }
  }

  // 根据 Ollama 来源显示不同的提示
  const getErrorContent = () => {
    // 如果正在初始化，显示加载提示
    if (isInitializing) {
      return {
        title: 'Initializing Ollama...',
        description: 'Please wait while Ollama is being initialized.',
        showActions: false,
      }
    }

    // 如果 Ollama 未就绪
    if (source === 'none') {
      return {
        title: 'Ollama Not Available',
        description:
          'Ollama is required for Private Mode. It will be automatically downloaded and started when you switch to Private Mode.',
        showActions: false,
      }
    }

    // 如果使用系统 Ollama 但连接失败
    if (source === 'system') {
      return {
        title: 'Ollama Connection Failed',
        description:
          'Cannot connect to Ollama. Please make sure Ollama is running on localhost:11434.',
        showActions: true,
        actions: [
          {
            label: 'Start Ollama',
            icon: PlayCircle,
            onClick: () => {
              // 打开终端指令提示
              alert('Please run: ollama serve')
            },
          },
          {
            label: 'Check Again',
            icon: RefreshCw,
            onClick: handleCheck,
            loading: isChecking,
          },
        ],
      }
    }

    // 如果使用内嵌 Ollama 但连接失败
    if (source === 'embedded') {
      return {
        title: 'Embedded Ollama Error',
        description:
          'Failed to connect to embedded Ollama. This may be a temporary issue.',
        showActions: true,
        actions: [
          {
            label: 'Retry Connection',
            icon: RefreshCw,
            onClick: handleCheck,
            loading: isChecking,
          },
        ],
      }
    }

    // 默认错误提示
    return {
      title: 'Connection Error',
      description: error || 'An unknown error occurred while connecting to Ollama.',
      showActions: true,
      actions: [
        {
          label: 'Retry',
          icon: RefreshCw,
          onClick: onRetry || handleCheck,
          loading: isChecking,
        },
      ],
    }
  }

  const content = getErrorContent()

  return (
    <Alert variant="destructive" className="my-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDescription>
        <p className="mb-4">{content.description}</p>

        {content.showActions && content.actions && (
          <div className="flex gap-2">
            {content.actions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={action.onClick}
                disabled={action.loading}
              >
                {action.loading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  action.icon && <action.icon className="mr-2 h-4 w-4" />
                )}
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* 安装 Ollama 的指引链接 */}
        {source === 'none' && (
          <div className="mt-4 text-sm">
            <p className="text-muted-foreground">
              Don't have Ollama installed?{' '}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                Download Ollama
              </a>
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * 简化版错误提示（仅显示错误消息）
 */
export function SimpleOllamaError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
