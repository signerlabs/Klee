import { useLocation } from '@tanstack/react-router'

/**
 * 检测导航列表中的活动项目
 *
 * 此钩子通过比较当前 URL 中的 ID 与导航项目的 ID 来确定哪个项目处于活动状态。
 * 它从 URL 路径中提取 ID（例如从 '/chat/abc123' 提取 'abc123'），然后为每个项目添加 isActive 标记。
 *
 * @template T - 必须包含 id 属性的导航项目类型（id 可以是可选的）
 * @param items - 导航项目列表
 * @param routePrefix - 路由前缀，用于提取 ID（例如 '/chat', '/note', '/knowledge-base'）
 * @returns 带有 isActive 标记的项目列表，isActive 为 true 表示该项目当前处于活动状态
 *
 * @example
 * ```typescript
 * // 在聊天列表组件中使用
 * const chatItems = [
 *   { id: '123', name: 'Chat 1', url: '/chat/123' },
 *   { id: '456', name: 'Chat 2', url: '/chat/456' }
 * ]
 * const chatItemsWithActive = useActiveNavItem(chatItems, '/chat')
 * // 如果当前 URL 是 '/chat/123'，则第一个项目的 isActive 为 true
 * ```
 */
export function useActiveNavItem<T extends { id?: string }>(
  items: T[],
  routePrefix: string
): Array<T & { isActive: boolean }> {
  const location = useLocation()

  // 从 URL 中提取 ID（例如 '/chat/abc123' -> 'abc123'）
  const activeId = location.pathname.split(`${routePrefix}/`)[1]

  return items.map((item) => ({
    ...item,
    isActive: item.id === activeId,
  }))
}
