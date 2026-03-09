import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Meteors } from '@/components/magicui/meteors'
import { SearchBar } from '@/components/search-bar'
import { HoverCards } from '@/components/marketplace/hover-cards'
import { LocalLLMCardGrid } from '@/components/marketplace/local-llm-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMarketplaceAgents } from '@/hooks/marketplace/queries/useMarketplaceAgents'
import { useMarketplaceKnowledgeBases } from '@/hooks/marketplace/queries/useMarketplaceKnowledgeBases'
import { useAvailableModels } from '@/hooks/ollama-models/queries/useAvailableModels'
import { useMode } from '@/contexts/ModeContext'

function MarketplaceContent() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { isPrivateMode } = useMode()

  // Cloud Mode 数据 - 只在 Cloud Mode 下查询
  const { data: agentsData, isLoading: agentsLoading } = useMarketplaceAgents(page, search, {
    enabled: !isPrivateMode, // 只在非 Private Mode 下启用
  })
  const { data: kbData, isLoading: kbLoading } = useMarketplaceKnowledgeBases(page, search, {
    enabled: !isPrivateMode, // 只在非 Private Mode 下启用
  })

  // Private Mode 数据 - 只在 Private Mode 下查询
  const { data: localModels, isLoading: modelsLoading } = useAvailableModels({
    enabled: isPrivateMode, // 只在 Private Mode 下启用
  })

  // Private Mode 搜索过滤
  const filteredModels =
    localModels?.filter((model) => {
      if (!search) return true

      const searchLower = search.toLowerCase()
      return (
        model.name.toLowerCase().includes(searchLower) ||
        model.model.toLowerCase().includes(searchLower) ||
        model.provider.toLowerCase().includes(searchLower) ||
        model.description?.toLowerCase().includes(searchLower) ||
        model.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
      )
    }) || []

  // 将 Cloud Agents 转换为 HoverCards 格式
  const agents =
    agentsData?.agents.map((agent: any) => ({
      type: 'agent' as const,
      avatar: agent.avatar || '🤖',
      title: agent.name,
      author: agent.userId,
      description: agent.systemPrompt || 'No description available',
      link: `/marketplace/agent/${agent.shareSlug}`,
    })) || []

  // 将 Cloud Knowledge Bases 转换为 HoverCards 格式
  const knowledgeBases =
    kbData?.knowledgeBases.map((kb: any) => ({
      type: 'knowledge-base' as const,
      avatar: '📚',
      title: kb.name,
      author: kb.userId,
      description: kb.description || 'No description available',
      link: `/marketplace/knowledge-base/${kb.shareSlug}`,
    })) || []

  return (
    <div className="relative flex flex-col items-center justify-start h-full p-6 w-full mx-auto gap-12">
      <div className="relative flex flex-col items-center justify-center w-full gap-6 overflow-hidden pt-32">
        <Meteors number={6} />
        <span className="text-6xl font-bold z-10">Klee Marketplace</span>
        <span className="text-xl z-10">
          Discover and connect with AI agents, knowledge bases and LLMs.
        </span>
        <SearchBar
          className="max-w-2xl m-2"
          onSearch={(value: string) => {
            setSearch(value)
            setPage(1)
          }}
        />
      </div>

      {/* Private Mode - 只显示 Local LLMs */}
      {isPrivateMode ? (
        <div className="w-full max-w-5xl">
          <h2 className="text-2xl font-semibold mb-6">Local LLMs</h2>

          {modelsLoading ? (
            // 加载骨架屏
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index} className="h-full">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-4/6" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !localModels || localModels.length === 0 ? (
            // 空状态 - 无模型
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="text-6xl">🤖</div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">No Local Models Available</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Local LLM models are not available yet. Please ensure Ollama is running and try
                  again.
                </p>
              </div>
            </div>
          ) : filteredModels.length === 0 ? (
            // 空状态 - 搜索无结果
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="text-6xl">🔍</div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">No Models Found</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  No models match your search "{search}". Try a different search term.
                </p>
              </div>
            </div>
          ) : (
            // 模型列表 - 使用 LocalLLMCardGrid (带 HoverCard 特效)
            <LocalLLMCardGrid models={filteredModels} />
          )}
        </div>
      ) : (
        // Cloud Mode - 显示 Agents 和 Knowledge Bases
        <Tabs defaultValue="agents" className="w-full max-w-5xl">
          <TabsList>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="knowledge-bases">Knowledge Bases</TabsTrigger>
          </TabsList>

          <TabsContent value="agents">
            {agentsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index} className="h-full">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                        <Skeleton className="h-3 w-4/6" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No agents found. {search && `Try a different search term.`}
              </div>
            ) : (
              <HoverCards items={agents} />
            )}
          </TabsContent>

          <TabsContent value="knowledge-bases">
            {kbLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index} className="h-full">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                        <Skeleton className="h-3 w-4/6" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : knowledgeBases.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No knowledge bases found. {search && `Try a different search term.`}
              </div>
            ) : (
              <HoverCards items={knowledgeBases} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/marketplace/')({
  component: MarketplaceContent,
})
