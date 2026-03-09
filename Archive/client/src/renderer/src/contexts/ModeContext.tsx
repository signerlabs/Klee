import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * 运行模式类型
 * - cloud: 云端模式（使用后端服务器）
 * - private: 私有模式（完全本地运行）
 */
export type RunMode = 'cloud' | 'private'

/**
 * ModeContext 值类型
 */
export interface ModeContextValue {
  /** 当前运行模式 */
  mode: RunMode
  /** 切换运行模式 */
  setMode: (mode: RunMode) => void
  /** 是否为私有模式（计算属性） */
  isPrivateMode: boolean
}

const ModeContext = createContext<ModeContextValue | null>(null)

export interface ModeProviderProps {
  children: ReactNode
}

/**
 * ModeProvider - 运行模式上下文提供者
 *
 * 功能：
 * - 管理应用的运行模式状态（Cloud/Private）
 * - 持久化模式到 localStorage（应用重启时恢复）
 * - 提供 isPrivateMode 计算属性便于模式检查
 *
 * @example
 * ```tsx
 * <ModeProvider>
 *   <App />
 * </ModeProvider>
 * ```
 */
export function ModeProvider({ children }: ModeProviderProps) {
  const [mode, setModeState] = useState<RunMode>('private')
  const queryClient = useQueryClient()

  // T022: 从 localStorage 恢复模式（应用重启时）
  useEffect(() => {
    const savedMode = localStorage.getItem('run-mode') as RunMode | null
    if (savedMode !== 'private') {
      localStorage.setItem('run-mode', 'private')
    }
    setModeState('private')
  }, [])

  // 切换模式并持久化到 localStorage
  const setMode = (newMode: RunMode) => {
    const enforcedMode = newMode === 'cloud' ? 'private' : newMode
    const oldMode = mode
    setModeState(enforcedMode)
    localStorage.setItem('run-mode', enforcedMode)

    // 通知 Electron 主进程切换数据库连接
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('mode:switch', enforcedMode)
    }

    // 切换模式时，清除旧模式的缓存并重新获取新模式的数据
    // 这确保用户立即看到正确模式的数据
    if (oldMode !== enforcedMode) {
      // 清除所有查询缓存（因为数据源已经改变）
      queryClient.clear()

      // 重新获取所有活跃的查询
      queryClient.refetchQueries({
        type: 'active',
      })
    }
  }

  // T023: isPrivateMode 计算属性
  const isPrivateMode = mode === 'private'

  return (
    <ModeContext.Provider
      value={{
        mode,
        setMode,
        isPrivateMode,
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}

/**
 * useMode Hook - 消费 ModeContext
 *
 * @throws {Error} 如果在 ModeProvider 外部使用
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { mode, setMode, isPrivateMode } = useMode()
 *
 *   return (
 *     <div>
 *       Current mode: {mode}
 *       {isPrivateMode && <OfflineIndicator />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useMode(): ModeContextValue {
  const context = useContext(ModeContext)
  if (!context) {
    throw new Error('useMode must be used within ModeProvider')
  }
  return context
}
