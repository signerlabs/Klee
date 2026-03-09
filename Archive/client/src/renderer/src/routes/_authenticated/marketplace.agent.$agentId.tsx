import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { Download, BadgeCheck, ChevronDown, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Avatar } from '@radix-ui/react-avatar'
import { AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateAgentFromChat } from '@/hooks/chat-config/mutations/useCreateAgentFromChat'
import { useInstallAgent } from '@/hooks/marketplace/mutations/useInstallAgent'
import { useCheckAgentInstalled } from '@/hooks/marketplace/queries/useCheckAgentInstalled'
import { useMarketplaceAgent } from '@/hooks/marketplace/queries/useMarketplaceAgent'
import { useKnowledgeBases } from '@/hooks/knowledge-base/queries/useKnowledgeBases'
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { llmModels } from '@config/models'
import { EmojiPicker } from '@/components/marketplace/emoji-picker'
import { getRandomEmoji, isValidEmoji } from '@/lib/emoji-utils'
import { useAlert } from '@/components/ui/alert-provider'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

function AgentDetail() {
  const { agentId } = useParams({ from: '/_authenticated/marketplace/agent/$agentId' })
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { showAlert } = useAlert()
  const createAgentMutation = useCreateAgentFromChat()
  const installMutation = useInstallAgent()

  // 加载知识库列表
  const { data: knowledgeBasesData } = useKnowledgeBases()

  // 模式检测：创建模式 vs 查看模式
  const isCreateMode = agentId === 'new' || search.from === 'chat'
  const isViewMode = !isCreateMode

  // 判断是否为 UUID (agent ID) 而不是 shareSlug
  const isUUID = (str: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }

  // 查看模式：根据 ID 类型使用不同的 API
  const isOwnAgent = isViewMode && isUUID(agentId)

  // 如果是自己的 Agent (UUID)，使用 chat-configs API
  const {
    data: ownAgentData,
    isLoading: isLoadingOwn,
    isError: isErrorOwn,
  } = useQuery({
    queryKey: ['chatConfig', agentId],
    queryFn: async () => {
      const res = await honoClient.api['chat-configs'][':id'].$get({
        param: { id: agentId },
      })
      if (!res.ok) throw new Error('Failed to fetch agent')
      return res.json()
    },
    enabled: isOwnAgent,
  })

  // 如果是市场 Agent (shareSlug)，使用 marketplace API
  const {
    data: marketplaceAgentData,
    isLoading: isLoadingMarket,
    isError: isErrorMarket,
  } = useMarketplaceAgent(!isOwnAgent && isViewMode ? agentId : undefined)

  // 统一数据格式
  const agentResponse = isOwnAgent
    ? ownAgentData
      ? {
          agent: {
            ...(ownAgentData.config as any),
            knowledgeBases: ownAgentData.knowledgeBases || [],
          } as any,
        }
      : undefined
    : marketplaceAgentData

  const isLoadingAgent = isOwnAgent ? isLoadingOwn : isLoadingMarket
  const isError = isOwnAgent ? isErrorOwn : isErrorMarket

  const { data: checkInstalledResponse } = useCheckAgentInstalled(
    !isOwnAgent && isViewMode ? agentId : undefined
  )

  // Form state (创建模式)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState<string[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)

  // 从 API 响应中提取数据
  const agentData = agentResponse?.agent
  const isInstalled = checkInstalledResponse?.isInstalled || false
  // 如果是通过 UUID 访问（自己的 Agent），则是所有者
  const isOwner = isOwnAgent || checkInstalledResponse?.isOwner || false

  // 表单验证：检查必填项是否完整
  const isFormValid =
    name.trim() !== '' && // 名称必填
    avatar !== '' && // Avatar 必填
    isValidEmoji(avatar) && // Avatar 必须是 emoji
    description.trim() !== '' && // 描述必填
    model !== '' // 模型必填

  // 初始化随机 emoji avatar（创建模式）
  useEffect(() => {
    if (isCreateMode && !avatar) {
      setAvatar(getRandomEmoji())
    }
  }, [isCreateMode])

  // 从Chat预填充配置（创建模式）
  useEffect(() => {
    const loadChatConfig = async () => {
      if (isCreateMode && search.from === 'chat' && search.chatId) {
        try {
          const res = await honoClient.api.chat[':id'].$get({ param: { id: search.chatId } })
          if (res.ok) {
            const data = await res.json()
            setModel(data.chat?.model || '')
            setDescription(data.chat?.systemPrompt || '')
            setWebSearchEnabled(data.chat?.webSearchEnabled || false)
            setKnowledgeBaseIds(data.chat?.availableKnowledgeBaseIds || [])
          }
        } catch (error) {
          console.error('Failed to load chat config:', error)
        }
      }
    }
    loadChatConfig()
  }, [isCreateMode, search.from, search.chatId])

  // T045: 从市场知识库预选知识库（创建模式）
  useEffect(() => {
    if (isCreateMode && search.kbId && !search.chatId) {
      // 仅当不是从 chat 预填充时才设置
      setKnowledgeBaseIds([search.kbId])
    }
  }, [isCreateMode, search.kbId, search.chatId])

  // Note: 不再需要 loadAgentDetails useEffect，因为使用了 useMarketplaceAgent hook

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 表单验证已在 isFormValid 中完成，按钮会被 disable
    if (!isFormValid) {
      return
    }

    try {
      await createAgentMutation.mutateAsync({
        name,
        avatar: avatar || null,
        defaultModel: model,
        systemPrompt: description,
        webSearchEnabled,
        isPublic: false, // 默认不分享，用户需要手动点击 Share 按钮
        knowledgeBaseIds: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
      })

      console.log('Agent created successfully')
      showAlert({
        title: 'Agent Created',
        description:
          'Agent has been created successfully! Click "Share to Marketplace" to publish it.',
        icon: <CheckCircle2 className="h-4 w-4" />,
      })
      navigate({ to: '/marketplace' })
    } catch (error: any) {
      console.error('Failed to create agent:', error)
      const message = error instanceof Error ? error.message : 'Failed to create agent'
      showAlert({
        title: 'Creation Failed',
        description: message,
        variant: 'destructive',
        icon: <AlertCircle className="h-4 w-4" />,
      })
    }
  }

  const handleInstall = () => {
    if (!agentData?.shareSlug) return

    installMutation.mutate(agentData.shareSlug, {
      onSuccess: () => {
        showAlert({
          title: 'Agent Installed',
          description: `${agentData.name} has been installed successfully!`,
          icon: <CheckCircle2 className="h-4 w-4" />,
        })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        showAlert({
          title: 'Installation Failed',
          description: message,
          variant: 'destructive',
          icon: <AlertCircle className="h-4 w-4" />,
        })
      },
    })
  }

  // 创建模式 UI
  if (isCreateMode) {
    return (
      <div className="flex flex-col h-full justify-center items-center p-4">
        <button
          onClick={() => setIsEmojiPickerOpen(true)}
          className="mb-8 cursor-pointer hover:scale-110 transition-transform"
          type="button"
        >
          <Avatar className="h-24 w-24">
            <AvatarFallback className="text-5xl">{avatar || '🤖'}</AvatarFallback>
          </Avatar>
        </button>

        <EmojiPicker
          open={isEmojiPickerOpen}
          onOpenChange={setIsEmojiPickerOpen}
          onEmojiSelect={setAvatar}
          currentEmoji={avatar}
        />

        <Card className="w-full max-w-xl">
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Agent Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (System Prompt)</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what your agent does..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-row justify-between gap-4 items-start">
                  <div className="grid gap-2 flex-1">
                    <Label htmlFor="llm">LLM</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {llmModels.map((llm) => (
                            <SelectItem key={llm.value} value={llm.value}>
                              {llm.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 flex-1">
                    <Label>Knowledge Bases (Optional)</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="truncate">
                            {knowledgeBaseIds.length > 0
                              ? `${knowledgeBaseIds.length} selected`
                              : 'Select knowledge bases...'}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-[--radix-dropdown-menu-trigger-width]"
                      >
                        {knowledgeBasesData?.knowledgeBases &&
                        knowledgeBasesData.knowledgeBases.length > 0 ? (
                          knowledgeBasesData.knowledgeBases.map((kb) => (
                            <DropdownMenuItem
                              key={kb.id}
                              className="flex items-center gap-2"
                              onSelect={(e) => {
                                e.preventDefault()
                                setKnowledgeBaseIds((prev) =>
                                  prev.includes(kb.id)
                                    ? prev.filter((id) => id !== kb.id)
                                    : [...prev, kb.id]
                                )
                              }}
                            >
                              <Checkbox
                                checked={knowledgeBaseIds.includes(kb.id)}
                                className="pointer-events-none"
                              />
                              <span>{kb.name}</span>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled>
                            <span className="text-muted-foreground">
                              No knowledge bases available
                            </span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {knowledgeBaseIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {knowledgeBaseIds.map((id) => {
                          const kb = knowledgeBasesData?.knowledgeBases?.find((k) => k.id === id)
                          return kb ? (
                            <Badge key={id} variant="secondary">
                              {kb.name}
                              <button
                                type="button"
                                className="ml-1 hover:text-destructive"
                                onClick={() =>
                                  setKnowledgeBaseIds((prev) => prev.filter((kbId) => kbId !== id))
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="web-search"
                    checked={webSearchEnabled}
                    onCheckedChange={(checked) => setWebSearchEnabled(checked === true)}
                  />
                  <Label htmlFor="web-search" className="cursor-pointer">
                    Enable Web Search
                  </Label>
                </div>
              </div>
            </form>
          </CardContent>
          <CardFooter className="flex-row gap-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: '/marketplace' })}
              type="button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full"
              disabled={!isFormValid || createAgentMutation.isPending}
              onClick={handleSubmit}
            >
              {createAgentMutation.isPending ? 'Creating...' : 'Create Agent'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // 查看模式 UI
  if (isLoadingAgent) {
    return (
      <div className="flex flex-col h-full justify-center items-center p-4 gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-center text-muted-foreground">Loading agent details...</div>
      </div>
    )
  }

  if (isError || !agentData) {
    return (
      <div className="flex flex-col h-full justify-center items-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Agent Not Found</h2>
          <p className="text-muted-foreground mb-4">
            This agent may have been removed or is no longer available.
          </p>
          <Button onClick={() => navigate({ to: '/marketplace' })}>Back to Marketplace</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full justify-center items-center p-4">
      <Avatar className="h-24 w-24 mb-8">
        <AvatarFallback className="text-4xl">{agentData.avatar}</AvatarFallback>
      </Avatar>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl">{agentData.name}</CardTitle>
          <CardDescription className="text-base">by {agentData.userId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-sm font-semibold">Description</Label>
            <p className="mt-2 text-muted-foreground">{agentData.systemPrompt}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold">LLM Model</Label>
              <p className="mt-2">
                <Badge variant="secondary">{agentData.defaultModel}</Badge>
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold">Web Search</Label>
              <p className="mt-2">
                <Badge variant={agentData.webSearchEnabled ? 'default' : 'outline'}>
                  {agentData.webSearchEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </p>
            </div>
          </div>

          {agentData.knowledgeBases && agentData.knowledgeBases.length > 0 && (
            <div>
              <Label className="text-sm font-semibold">Knowledge Bases</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {agentData.knowledgeBases.map((kb: any) => (
                  <Badge key={kb.id} variant="outline">
                    {kb.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {isOwner ? (
            <>
              <Button className="w-full" disabled variant="secondary">
                <BadgeCheck className="mr-2 h-4 w-4" />
                This is your agent
              </Button>
            </>
          ) : isInstalled ? (
            <Button className="w-full" disabled>
              <BadgeCheck className="mr-2 h-4 w-4" />
              Installed
            </Button>
          ) : (
            <Button className="w-full" onClick={handleInstall} disabled={installMutation.isPending}>
              {installMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Install Agent
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/marketplace/agent/$agentId')({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    from?: string
    chatId?: string
    kbId?: string
  } => {
    return {
      from: (search.from as string) ?? undefined,
      chatId: (search.chatId as string) ?? undefined,
      kbId: (search.kbId as string) ?? undefined, // T045: 支持预选知识库
    }
  },
  component: AgentDetail,
})
