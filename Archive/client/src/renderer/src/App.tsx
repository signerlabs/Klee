import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { AlertProvider, useAlert } from '@/components/ui/alert-provider'
import { ModeProvider } from '@/contexts/ModeContext'
import { DownloadManagerProvider } from '@/contexts/DownloadManagerContext'
import { queryClient } from '@/lib/query-client'
import { modelConfig, validateModelConfig } from '@config/models'
import { createSessionFromOAuthTokens } from '@/lib/auth'
import { routeTree } from './routeTree.gen'

// Electron 打包后使用 file:// 协议，使用内存路由避免路径解析为本地文件绝对路径
const shouldUseMemoryHistory =
  typeof window !== 'undefined' &&
  window.location &&
  window.location.protocol !== 'http:' &&
  window.location.protocol !== 'https:'

const router = createRouter({
  routeTree,
  history: shouldUseMemoryHistory ? createMemoryHistory({ initialEntries: ['/'] }) : undefined,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/**
 * OAuth回调处理组件
 * 监听来自Electron主进程的OAuth事件并创建会话
 */
function OAuthHandler() {
  const { showAlert } = useAlert()

  useEffect(() => {
    // 检查是否在Electron环境
    if (!window.electron?.ipcRenderer) {
      return
    }

    // 处理OAuth成功事件
    const handleOAuthSuccess = async (
      _event: unknown,
      { accessToken, refreshToken }: { accessToken: string; refreshToken: string }
    ) => {
      try {
        await createSessionFromOAuthTokens(accessToken, refreshToken)

        // 导航到首页
        router.navigate({ to: '/' })

        // 显示成功提示
        showAlert({
          title: 'Login Successful',
          description: 'Welcome back!',
          variant: 'default',
        })
      } catch (error) {
        showAlert({
          title: 'Login Failed',
          description: error instanceof Error ? error.message : 'Failed to create session',
          variant: 'destructive',
        })
      }
    }

    // 处理OAuth错误事件
    const handleOAuthError = (
      _event: unknown,
      { error, errorDescription }: { error: string; errorDescription?: string }
    ) => {
      showAlert({
        title: 'Authentication Error',
        description: errorDescription || error || 'An unknown error occurred',
        variant: 'destructive',
      })
    }

    // 注册IPC事件监听器
    window.electron.ipcRenderer.on('oauth-success', handleOAuthSuccess)
    window.electron.ipcRenderer.on('oauth-error', handleOAuthError)

    // 清理函数
    return () => {
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.off('oauth-success', handleOAuthSuccess)
        window.electron.ipcRenderer.off('oauth-error', handleOAuthError)
      }
    }
  }, [showAlert])

  return null
}

function App() {
  // 应用启动时验证模型配置
  useEffect(() => {
    const validation = validateModelConfig(modelConfig)

    if (!validation.isValid) {
      console.error('[Model Config] Validation failed:')
      validation.errors.forEach(({ type, model, errors }) => {
        console.error(`  [${type}] ${model}:`, errors)
      })
    } else {
      console.log('[Model Config] Validation passed:', {
        localModels: modelConfig.localModels.length,
        cloudModels: modelConfig.cloudModels.length,
        version: modelConfig.version,
      })
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <DownloadManagerProvider>
          <AlertProvider>
            <OAuthHandler />
            <RouterProvider router={router} />
          </AlertProvider>
          {/* TanStack Query DevTools - 仅在开发环境显示，用于调试缓存和查询状态 */}
          <ReactQueryDevtools initialIsOpen={false} />
        </DownloadManagerProvider>
      </ModeProvider>
    </QueryClientProvider>
  )
}

export default App
