CREATE TABLE "chat_config_knowledge_bases" (
	"chat_config_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	CONSTRAINT "chat_config_knowledge_bases_chat_config_id_knowledge_base_id_pk" PRIMARY KEY("chat_config_id","knowledge_base_id")
);
--> statement-breakpoint
CREATE TABLE "chat_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"default_model" varchar(64) NOT NULL,
	"system_prompt" text,
	"web_search_enabled" boolean DEFAULT false NOT NULL,
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"share_slug" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_configs_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "chat_config_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_config_knowledge_bases" ADD CONSTRAINT "chat_config_knowledge_bases_chat_config_id_chat_configs_id_fk" FOREIGN KEY ("chat_config_id") REFERENCES "public"."chat_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_config_knowledge_bases" ADD CONSTRAINT "chat_config_knowledge_bases_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_config_kb_config_id_idx" ON "chat_config_knowledge_bases" USING btree ("chat_config_id");--> statement-breakpoint
CREATE INDEX "chat_config_kb_kb_id_idx" ON "chat_config_knowledge_bases" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "chat_configs_user_id_idx" ON "chat_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_configs_share_slug_idx" ON "chat_configs" USING btree ("share_slug");--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_chat_config_id_chat_configs_id_fk" FOREIGN KEY ("chat_config_id") REFERENCES "public"."chat_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_chat_config_id_idx" ON "chat_sessions" USING btree ("chat_config_id");