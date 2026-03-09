import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAlert } from '@/components/ui/alert-provider'
import { useCreateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useCreateKnowledgeBase'
import { AlertCircle } from 'lucide-react'
import type { CreateKnowledgeBaseFormErrors } from '@/types'

type CreationMode = 'standard' | 'telegram'

function KnowledgeBaseNew() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [creationMode, setCreationMode] = React.useState<CreationMode>('standard')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [errors, setErrors] = React.useState<CreateKnowledgeBaseFormErrors>({})

  const navigate = useNavigate()
  const { showAlert } = useAlert()

  // 使用新的 TanStack Query 变更钩子
  const createMutation = useCreateKnowledgeBase()

  const resetForm = React.useCallback(() => {
    setName('')
    setDescription('')
    setErrors({})
    setCreationMode('standard')
  }, [])

  const validateForm = React.useCallback(() => {
    const validationErrors: CreateKnowledgeBaseFormErrors = {}
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()

    if (!trimmedName) {
      validationErrors.name = 'Name is required.'
    } else if (trimmedName.length > 200) {
      validationErrors.name = 'Name must be 200 characters or fewer.'
    }

    if (trimmedDescription.length > 1000) {
      validationErrors.description = 'Description must be 1000 characters or fewer.'
    }

    setErrors(validationErrors)
    return Object.keys(validationErrors).length === 0
  }, [name, description])

  const handleDialogChange = React.useCallback(
    (open: boolean) => {
      setDialogOpen(open)
      if (!open) {
        resetForm()
      }
    },
    [resetForm]
  )

  const handleSubmit = React.useCallback(() => {
    if (!validateForm()) {
      return
    }

    // 使用新的变更钩子，它会自动失效列表查询
    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (response) => {
          setDialogOpen(false)
          resetForm()

          const createdId = response?.knowledgeBase?.id
          if (createdId) {
            navigate({
              to: '/knowledge-base/$knowledgeBaseId',
              params: { knowledgeBaseId: createdId },
              search: { source: creationMode === 'telegram' ? 'telegram' : undefined },
            })
          }
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          showAlert({
            title: 'Failed to create knowledge base',
            description: message,
            variant: 'destructive',
            icon: <AlertCircle className="h-4 w-4" />,
          })
        },
      }
    )
  }, [
    createMutation,
    name,
    description,
    validateForm,
    navigate,
    resetForm,
    showAlert,
    creationMode,
  ])

  return (
    <AlertDialog open={dialogOpen} onOpenChange={handleDialogChange}>
      <div className="flex flex-1 flex-col gap-10 p-4 items-center justify-center">
        <span className="text-2xl font-bold">Local, private, self-hosted knowledge base</span>
        <Tabs defaultValue="file" className="w-full max-w-xl">
          <TabsList className="w-full mx-auto">
            <TabsTrigger value="file">Knowledge Base</TabsTrigger>
            <TabsTrigger value="telegram">Telegram Chat Data</TabsTrigger>
          </TabsList>
          <TabsContent value="file">
            <Card>
              <CardHeader>
                <CardTitle>Import files and create new knowledge base</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Your files will be uploaded into cloud</li>
                  <li>Original files can be deleted after embedding</li>
                  <li>File Format: .txt, .md, .pdf, .docx</li>
                </ul>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setCreationMode('standard')}
                  >
                    Create
                  </Button>
                </AlertDialogTrigger>
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="telegram">
            <Card>
              <CardHeader>
                <CardTitle>Import telegram chat data files and create new knowledge base</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Export your TG chat data as JSON</li>
                  <li>Your TG data will be uploaded into cloud</li>
                  <li>File Format: .json</li>
                </ul>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setCreationMode('telegram')}
                  >
                    Create
                  </Button>
                </AlertDialogTrigger>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create knowledge base</AlertDialogTitle>
          <AlertDialogDescription>
            Provide the details for your new knowledge base.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="knowledge-base-name">Name</Label>
            <Input
              id="knowledge-base-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My knowledge base"
              autoFocus
              maxLength={200}
            />
            {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-base-description">Description</Label>
            <Textarea
              id="knowledge-base-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the purpose of this knowledge base"
              maxLength={1000}
              rows={4}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">{errors.description}</p>
            ) : null}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={createMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={createMutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              void handleSubmit()
            }}
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export const Route = createFileRoute('/_authenticated/knowledge-base/')({
  component: KnowledgeBaseNew,
})
