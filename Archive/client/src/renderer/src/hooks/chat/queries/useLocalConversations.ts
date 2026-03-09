import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { ipcAPI, type LocalChatSession } from '@/lib/ipc-helpers'

async function fetchLocalConversations(): Promise<LocalChatSession[]> {
  return ipcAPI.getConversations()
}

export function useLocalConversations() {
  const options = {
    queryKey: ['local-conversations'] as const,
    queryFn: fetchLocalConversations,
    staleTime: 2 * 60 * 1000, // 2 分钟陈旧时间
    cacheTime: 5 * 60 * 1000, // 5 分钟缓存时间
    retry: 2, // 失败重试 2 次
    refetchOnWindowFocus: true, // 窗口焦点时重新获取
    enabled: true, // 覆盖默认设置，Private Mode 下也需要启用
  } satisfies UseQueryOptions<
    LocalChatSession[],
    Error,
    LocalChatSession[],
    ['local-conversations']
  >

  return useQuery(options)
}

async function fetchLocalConversation(id: string): Promise<LocalChatSession> {
  const conversation = await ipcAPI.getConversation(id)

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  return conversation
}

export function useLocalConversation(id: string) {
  const options = {
    queryKey: ['local-conversation', id] as const,
    queryFn: () => fetchLocalConversation(id),
    staleTime: 5 * 60 * 1000, // 5 分钟陈旧时间
    enabled: !!id,
  } satisfies UseQueryOptions<
    LocalChatSession,
    Error,
    LocalChatSession,
    ['local-conversation', string]
  >

  return useQuery(options)
}

async function fetchStarredConversations(): Promise<LocalChatSession[]> {
  // 前端过滤收藏的对话
  return (await ipcAPI.getConversations()).filter((conv) => conv.starred)
}

export function useStarredConversations() {
  const options = {
    queryKey: ['local-starred-conversations'] as const,
    queryFn: fetchStarredConversations,
    staleTime: 2 * 60 * 1000,
    enabled: true,
  } satisfies UseQueryOptions<
    LocalChatSession[],
    Error,
    LocalChatSession[],
    ['local-starred-conversations']
  >

  return useQuery(options)
}
