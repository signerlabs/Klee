import { Copy, Trash2, AlertCircle, NotebookPen, PlusCircle } from 'lucide-react'
import { IConversation, IConversationDetail, IMessage, EnumErrorCode } from '@/types'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
// import { useConfig } from '@/hooks/use-config'
import { cn } from '@/lib/utils'
import LottieLoading from '@/components/lottie/Loading'
import { ActionIcon } from '@/components/ActionIcon'
import { useCopyToClipboard } from 'usehooks-ts'
import { toast } from 'sonner'
import { deleteMessage } from '@/services/messages'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNote } from '@/services'
import { useNavigate, useParams } from 'react-router-dom'
import { EnumRouterLink } from '@/constants/paths'
import { useTranslation } from 'react-i18next'
import { useCreateConversation } from '@/hooks/use-conversation'
import { useMemo } from 'react'
import CodeDisplayBlock from './CodeDisplayBlock'

// Add Think component
const Think = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation()
  return (
    <div className="my-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
      <div className="mb-2 font-medium">{t('chat.thinkingProcess')}</div>
      {children}
    </div>
  )
}

// Extend ReactMarkdown component types
type CustomComponents = Components & {
  think: React.ComponentType<{ children: React.ReactNode }>
}

export default function ChatMessageCard({
  data,
  userMessage,
  conversation,
  showDelete = true,
  showAdd = false,
}: {
  data: IMessage
  userMessage?: IMessage
  conversation: IConversation
  showDelete?: boolean
  showAdd?: boolean
}) {
  const { t } = useTranslation()
  // const [config] = useConfig()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [, copy] = useCopyToClipboard()
  const { mutateAsync: deleteMessageMutate } = useMutation({
    mutationFn: deleteMessage,
  })
  const { mutateAsync: createConversationMutate } = useCreateConversation()

  const handleCopy = () => {
    const text = data.content
    copy(text)
      .then(() => {
        // console.log('Copied!', { text })
        toast.success(t('chat.copySuccess'))
      })
      .catch((error) => {
        toast.error(t('chat.copyFailed', { message: error.message }))
      })
  }

  const handleDelete = async () => {
    const result = await deleteMessageMutate(data.id)
    const ids = result?.ids || []
    queryClient.setQueryData(['conversation', conversation.id], (old: IConversationDetail) => {
      return {
        ...old,
        messages: old.messages.filter((item) => !ids.includes(item.id)),
      }
    })
    toast.success(t('chat.deleteSuccess'))
  }

  const { thinkContent, cleanContent } = useMemo(() => {
    const getThinkContent = (content: string) => {
      const match = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/)
      return match ? match[1].trim() : null
    }

    return {
      thinkContent: getThinkContent(data.content),
      cleanContent: data.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim(),
    }
  }, [data.id, data.status, data.content])
  const contentParts = useMemo(() => cleanContent.split('```'), [cleanContent])

  const handleAddToNotes = async () => {
    const title = userMessage?.content || 'Question'
    const newNote = await createNote({
      title,
      type: 'note',
      content: data.content,
      status: 'normal',
      folder_id: 'default',
      html_content: `# ${title}\n\n${data.content}`,
      is_pin: false,
    })
    queryClient.invalidateQueries({ queryKey: ['conversationsByNoteId', noteId] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    toast.success(t('chat.addToNotesSuccess'), { description: t('chat.noteCreated', { title }) })
    navigate(EnumRouterLink.NoteDetail.replace(':noteId', newNote.id))
  }

  const showActions = data.status !== 'pending'

  const { noteId = '' } = useParams()

  const handleNewChat = async () => {
    const newConversation = await createConversationMutate({ note_ids: [noteId] })
    navigate(
      EnumRouterLink.NoteDetail.replace(':noteId', noteId) + `?conversationId=${newConversation.conversation.id}`,
    )
    queryClient.invalidateQueries({ queryKey: ['conversationsByNoteId', noteId] })
  }
  return (
    <div key={data.id} className="my-2 flex flex-col gap-4 pt-2">
      <div className="flex items-center gap-2 overflow-hidden text-foreground">
        <LottieLoading className="h-8 w-8" loop={data.status === 'pending'} autoplay={data.status === 'pending'} />
        <span className="text-lg font-medium">{t('chat.answer')}</span>
      </div>
      <div className={cn('prose overflow-hidden break-words')}>
        {thinkContent && <Think>{thinkContent}</Think>}
        {contentParts.length &&
          contentParts.map((part, index) => {
            if (index % 2 === 0) {
              return <ReactMarkdown key={index}>{part}</ReactMarkdown>
            } else {
              return (
                <pre
                  className="m-0 whitespace-pre-wrap rounded-none border-none bg-transparent p-0 shadow-none"
                  key={index}
                >
                  <CodeDisplayBlock code={part} />
                </pre>
              )
            }
          })}
      </div>
      {data.status === 'error' && (
        <div className="flex items-center text-destructive">
          <AlertCircle className="mr-2 h-5 w-5" />
          <span>
            {data.error_code && data.error_code in EnumErrorCode
              ? t(`error.${data.error_code}`)
              : t('chat.failedToRespond')}
          </span>
          {/* <span>{t(`error.free_message_count_exceeded`)}</span> */}
        </div>
      )}
      <div
        className={cn(
          'flex justify-between border-b pb-2 text-muted-foreground transition-opacity',
          showActions ? '' : 'opacity-0 [visibility:hidden]',
        )}
      >
        <div className="flex items-center gap-2">
          {showAdd && (
            <ActionIcon
              icon={<PlusCircle className="h-4 w-4" />}
              tooltipText={t('chat.newChat')}
              onClick={handleNewChat}
            />
          )}
        </div>
        <div>
          <ActionIcon icon={<Copy className="h-4 w-4" />} tooltipText={t('chat.copy')} onClick={handleCopy} />
          <ActionIcon
            icon={<NotebookPen className="h-4 w-4" />}
            tooltipText={t('chat.addToNotes')}
            onClick={handleAddToNotes}
          />
          {showDelete && (
            <ActionIcon icon={<Trash2 className="h-4 w-4" />} tooltipText={t('chat.delete')} onClick={handleDelete} />
          )}
        </div>
      </div>
      {/* <Separator className="mb-4" /> */}
    </div>
  )
}
