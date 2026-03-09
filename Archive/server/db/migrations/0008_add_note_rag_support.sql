ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS available_note_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "note_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "note_embeddings" ADD CONSTRAINT "note_embeddings_note_id_note_id_fk" 
FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE CASCADE;

CREATE INDEX "note_embeddings_note_id_idx" ON "note_embeddings" USING btree ("note_id");
CREATE INDEX "note_embeddings_vector_idx" ON "note_embeddings" USING hnsw (embedding vector_cosine_ops);