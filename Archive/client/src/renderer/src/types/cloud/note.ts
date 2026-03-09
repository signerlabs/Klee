/**
 * Cloud Mode - Note related types
 *
 * All types rely on Hono RPC inference to stay in sync with the server.
 */

import type { InferRequestType, InferResponseType } from 'hono/client'
import type { honoClient } from '@/lib/hono-client'

/**
 * GET /api/note response
 */
export type GetNotesResponse = InferResponseType<
  (typeof honoClient.api.note)['$get'],
  200
>

/**
 * Note list item
 */
export type NoteListItem = GetNotesResponse['note'][number]

/**
 * Alias for a single note entry
 */
export type Note = NoteListItem

/**
 * GET /api/note/:id response
 */
export type GetNoteResponse = InferResponseType<
  (typeof honoClient.api.note)[':id']['$get'],
  200
>

/**
 * Note detail payload
 */
export type NoteDetail = GetNoteResponse['note']

/**
 * POST /api/note payload
 */
export type CreateNotePayload = InferRequestType<
  (typeof honoClient.api.note)['$post']
>['json']

/**
 * POST /api/note response
 */
export type CreateNoteResponse = InferResponseType<
  (typeof honoClient.api.note)['$post'],
  201
>

/**
 * PUT /api/note/:id payload
 */
export type UpdateNotePayload = InferRequestType<
  (typeof honoClient.api.note)[':id']['$put']
>['json']

/**
 * PUT /api/note/:id response
 */
export type UpdateNoteResponse = InferResponseType<
  (typeof honoClient.api.note)[':id']['$put'],
  200
>

/**
 * DELETE /api/note/:id response
 */
export type DeleteNoteResponse = InferResponseType<
  (typeof honoClient.api.note)[':id']['$delete'],
  200
>

/**
 * POST /api/note/:id/embed response
 */
export type EmbedNoteResponse = InferResponseType<
  (typeof honoClient.api.note)[':id']['embed']['$post'],
  200
>
