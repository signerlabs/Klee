import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, FileText, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMarketplaceKnowledgeBase } from '@/hooks/marketplace/queries/useMarketplaceKnowledgeBase'

function KnowledgeBaseDetail() {
  const { shareSlug } = useParams({
    from: '/_authenticated/marketplace/knowledge-base/$shareSlug',
  })
  const navigate = useNavigate()

  // 获取知识库详情
  const { data: kbResponse, isLoading, isError } = useMarketplaceKnowledgeBase(shareSlug)

  const knowledgeBase = kbResponse?.knowledgeBase
  const files = knowledgeBase?.files || []

  // T043, T044: 处理"使用此知识库"按钮点击
  const handleUseKnowledgeBase = () => {
    // 导航到 Agent 创建页面，并通过 search 参数传递知识库 ID
    navigate({
      to: '/marketplace/agent/$agentId',
      params: { agentId: 'new' },
      search: { kbId: knowledgeBase?.id },
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (isError || !knowledgeBase) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h2 className="text-2xl font-semibold">Knowledge Base Not Found</h2>
        <p className="text-muted-foreground">
          The knowledge base you're looking for doesn't exist or has been removed.
        </p>
        <Button onClick={() => navigate({ to: '/marketplace' })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
        </Button>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate({ to: '/marketplace' })}>
        <ArrowLeft className="h-4 w-4 mr-2" />
      </Button>

      {/* Knowledge Base Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="text-5xl">📚</div>
              <div>
                <CardTitle className="text-3xl">{knowledgeBase.name}</CardTitle>
                <CardDescription className="text-base mt-2">
                  {knowledgeBase.description || 'No description available'}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{files.length} files</Badge>
            <span>•</span>
            <span>Created by {knowledgeBase.userId}</span>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This knowledge base is publicly shared. You can reference it when creating or installing
            agents from the marketplace.
          </p>
          <Button onClick={handleUseKnowledgeBase} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Use in New Agent
          </Button>
        </CardFooter>
      </Card>

      {/* Files List Card */}
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            {files.length === 0
              ? 'No files in this knowledge base'
              : `${files.length} file${files.length > 1 ? 's' : ''} available`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>This knowledge base doesn't contain any files yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file: any) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{file.fileName}</p>
                      <p className="text-sm text-muted-foreground">
                        {file.status === 'completed' ? 'Ready' : file.status}
                      </p>
                    </div>
                  </div>
                  <Badge variant={file.status === 'completed' ? 'default' : 'secondary'}>
                    {file.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/marketplace/knowledge-base/$shareSlug')({
  component: KnowledgeBaseDetail,
})
