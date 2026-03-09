ALTER TABLE "chat_configs" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "model" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "system_prompt" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "web_search_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_configs" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "chat_configs" DROP COLUMN "visibility";