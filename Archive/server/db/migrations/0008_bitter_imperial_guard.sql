ALTER TABLE "chat_configs" ADD COLUMN "avatar" text;--> statement-breakpoint
ALTER TABLE "chat_configs" ADD COLUMN "source_share_slug" varchar(64);--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "share_slug" varchar(64);--> statement-breakpoint
CREATE INDEX "chat_configs_source_share_slug_idx" ON "chat_configs" USING btree ("source_share_slug");--> statement-breakpoint
CREATE INDEX "knowledge_bases_share_slug_idx" ON "knowledge_bases" USING btree ("share_slug");--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_share_slug_unique" UNIQUE("share_slug");