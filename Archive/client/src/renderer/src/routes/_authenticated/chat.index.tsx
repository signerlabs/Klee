import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { ContainerTextFlip } from '@/components/ui/container-text-flip'
import { AnimatedGridPattern } from '@/components/magicui/animated-grid-pattern'
import { cn, generateUUID } from '@/lib/utils'
import logoImage from '@/assets/logo.png'
import { ChatPromptInput } from '@/components/chat/chat-prompt-input'
import { useChatLogic } from '@/hooks/chat/useChatLogic'
import { useCreateConversation } from '@/hooks/chat/mutations/useCreateConversation'
import { useChatContext } from '@/contexts/ChatContext'

function RouteComponent() {
  const { input, setInput, model, setModel, webSearch, setWebSearch, isUsingAgent } =
    useChatLogic()
  // T012: 使用 TanStack Query 的 useCreateConversation 变更钩子
  const createConversationMutation = useCreateConversation()
  const navigate = useNavigate()
  const { selectedKnowledgeBaseIds, selectedNoteIds } = useChatContext()

  const handleSubmit = useCallback(async (message: { text?: string }) => {
    if (!message.text) {
      return
    }

    const newChatId = generateUUID()
    const messageId = generateUUID()

    try {
      // 将当前配置缓存在客户端，确保新页面能够读取
      if (typeof window !== 'undefined') {
        try {
          const cachedConfig = {
            model,
            webSearch,
            knowledgeBaseIds: selectedKnowledgeBaseIds,
            noteIds: selectedNoteIds,
          }
          window.localStorage.setItem(`chat-config:${newChatId}`, JSON.stringify(cachedConfig))
        } catch (error) {
          console.error('Failed to cache chat config:', error)
        }
      }

      // 使用 TanStack Mutation 创建新的聊天会话
      // 注意：不使用 mutate，而是直接导航，让后端在首次消息时创建会话
      // 跳转到聊天页面，传递初始消息和配置
      void navigate({
        to: `/chat/${newChatId}`,
        search: {
          initialMessage: message.text,
          model,
          webSearch,
          knowledgeBaseIds: selectedKnowledgeBaseIds,
          noteIds: selectedNoteIds,
        },
      })
    } catch (error) {
      console.error('Failed to navigate to chat:', error)
    }
  }, [model, webSearch, selectedKnowledgeBaseIds, selectedNoteIds, navigate])

  return (
    <>
      <div className="flex flex-col items-center justify-center h-full p-6 max-w-3xl w-full mx-auto z-10">
        <div className="flex flex-row items-center justify-start w-full pb-16 gap-6">
          <img src={logoImage} alt="Logo" className="h-16 w-16" />
          <span className="text-4xl font-bold">Welcome to</span>
          <ContainerTextFlip
            words={['Better', 'Modern', 'Awesome']}
            className="text-xl md:text-xl font-bold"
          />
          <span className="text-4xl font-bold">Klee</span>
        </div>
        <ChatPromptInput
          input={input}
          setInput={setInput}
          model={model}
          setModel={setModel}
          webSearch={webSearch}
          setWebSearch={setWebSearch}
          isUsingAgent={isUsingAgent}
          onSubmit={handleSubmit}
        />
      </div>
      <AnimatedGridPattern
        numSquares={10}
        maxOpacity={0.1}
        duration={1}
        repeatDelay={10}
        className={cn('[mask-image:radial-gradient(800px_circle_at_center,white,transparent)]')}
      />
    </>
  )
}

export const Route = createFileRoute('/_authenticated/chat/')({
  component: RouteComponent,
})
