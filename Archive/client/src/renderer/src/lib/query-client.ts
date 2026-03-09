import { QueryClient } from '@tanstack/react-query'

/**
 * 获取当前运行模式
 * 从 localStorage 读取，避免循环依赖
 */
function getCurrentMode(): 'cloud' | 'private' {
  if (typeof window === 'undefined') return 'cloud'
  return (localStorage.getItem('run-mode') as 'cloud' | 'private') || 'cloud'
}

/**
 * 全局 TanStack Query Client 配置
 *
 * 缓存策略说明:
 * - staleTime: 数据被认为新鲜的时间，在此期间不会重新获取
 * - cacheTime: 未使用的数据保留在缓存中的时间
 * - retry: 失败时的重试次数
 * - retryDelay: 重试之间的延迟（指数退避）
 * - refetchOnWindowFocus: 窗口获得焦点时是否重新获取
 * - refetchOnReconnect: 网络重连时是否重新获取
 *
 * 模式支持:
 * - Cloud Mode: 使用 HTTP API（Hono RPC）
 * - Private Mode: 使用 IPC（Electron IPC）
 * - 两种模式都使用相同的 TanStack Query 配置
 * - 查询钩子内部根据 mode 切换数据源
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * 默认陈旧时间: 5 分钟
       * 在此期间，数据被认为是新鲜的，不会触发后台重新获取
       * 特定查询可以覆盖此值（如知识库列表使用 2 分钟）
       */
      staleTime: 5 * 60 * 1000,

      /**
       * 缓存保留时间: 10 分钟
       * 未使用的查询数据在 10 分钟后从缓存中移除
       */
      cacheTime: 10 * 60 * 1000,

      /**
       * 重试策略: 失败时最多重试 3 次
       * 适用于网络临时故障和 IPC 初始化延迟
       */
      retry: 3,

      /**
       * 重试延迟: 指数退避策略
       * 第 1 次: 1 秒
       * 第 2 次: 2 秒
       * 第 3 次: 4 秒
       * 最大延迟: 30 秒
       */
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      /**
       * 窗口焦点重新获取: 启用
       * Cloud Mode: 多标签页同步
       * Private Mode: 同步其他窗口的本地数据更新
       */
      refetchOnWindowFocus: true,

      /**
       * 网络重连重新获取: 仅在 Cloud Mode 启用
       * Cloud Mode: 网络恢复时刷新
       * Private Mode: 不需要（本地数据不依赖网络）
       */
      refetchOnReconnect: () => getCurrentMode() === 'cloud',

      /**
       * 查询启用状态: 默认启用
       * 所有查询默认启用，具体查询可以通过 enabled 参数控制
       * 查询钩子内部根据 mode 切换数据源（Cloud: RPC / Private: IPC）
       */
      enabled: true,
    },
    mutations: {
      /**
       * 变更操作重试策略: 仅重试 1 次
       * 变更操作通常有副作用，不应过度重试
       */
      retry: 1,
    },
  },
})
