CREATE SCHEMA "jackson";
--> statement-breakpoint
CREATE TYPE "jackson"."request_status" AS ENUM('pending', 'replied');--> statement-breakpoint
CREATE TYPE "jackson"."webhook_update_status" AS ENUM('processed', 'ignored', 'duplicate');--> statement-breakpoint
CREATE TABLE "jackson"."replies" (
	"request_id" text NOT NULL,
	"reply_text" text NOT NULL,
	"telegram_update_id" bigint,
	"telegram_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_reply_per_request" PRIMARY KEY("request_id")
);
--> statement-breakpoint
ALTER TABLE "jackson"."replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jackson"."requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" "jackson"."request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jackson"."requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jackson"."telegram_messages" (
	"request_id" text NOT NULL,
	"operator_chat_id" bigint NOT NULL,
	"sent_message_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_telegram_message_request" PRIMARY KEY("request_id")
);
--> statement-breakpoint
ALTER TABLE "jackson"."telegram_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jackson"."telegram_webhook_updates" (
	"update_id" bigint NOT NULL,
	"status" "jackson"."webhook_update_status" NOT NULL,
	"request_id" text,
	"message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_telegram_update_id" PRIMARY KEY("update_id")
);
--> statement-breakpoint
ALTER TABLE "jackson"."telegram_webhook_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jackson"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"token_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jackson"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jackson"."replies" ADD CONSTRAINT "replies_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "jackson"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackson"."requests" ADD CONSTRAINT "requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "jackson"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackson"."telegram_messages" ADD CONSTRAINT "telegram_messages_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "jackson"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackson"."telegram_webhook_updates" ADD CONSTRAINT "telegram_webhook_updates_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "jackson"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_reply_update_id" ON "jackson"."replies" USING btree ("telegram_update_id");--> statement-breakpoint
CREATE INDEX "by_user_created" ON "jackson"."requests" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_operator_sent_message" ON "jackson"."telegram_messages" USING btree ("operator_chat_id","sent_message_id");--> statement-breakpoint
CREATE INDEX "by_request_status" ON "jackson"."telegram_webhook_updates" USING btree ("request_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_username_normalized" ON "jackson"."users" USING btree ("username_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_token_hash" ON "jackson"."users" USING btree ("token_hash");