'use client'

import { createFileRoute } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { NoteEditor } from '@/components/note/note-editor'
import { useNote } from '@/hooks/note/queries/useNote'
import { AlertCircleIcon, Loader } from 'lucide-react'

function NoteRouteComponent() {
  const { noteId } = Route.useParams()
  const { data, isLoading, isError } = useNote(noteId)

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-4 sm:p-6">
        <Loader className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !data?.note) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-4 sm:p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircleIcon />
          <AlertTitle>Unable to load note.</AlertTitle>
          <AlertDescription>Please try again later.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <NoteEditor
      noteId={noteId}
      initialTitle={data.note.title ?? ''}
      initialContent={data.note.content ?? ''}
    />
  )
}

export const Route = createFileRoute('/_authenticated/note/$noteId')({
  component: NoteRouteComponent,
})
