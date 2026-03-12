-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "BotUserStage" AS ENUM ('NEW_USER', 'TRIAL_FREE_USAGE', 'TRIAL_PAYWALL', 'TRIAL_LIMITED', 'ACTIVE_PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "BotSessionMode" AS ENUM ('idle', 'processing_input', 'draft_review', 'awaiting_field_input', 'awaiting_choice', 'saving', 'saved_result', 'unfinished_draft_block', 'capture_error', 'save_error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "BotOperationDraftStatus" AS ENUM ('pending_review', 'awaiting_field_input', 'awaiting_choice', 'saving', 'saved', 'applied', 'cancelled', 'failed', 'superseded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "BotOperationSourceType" AS ENUM ('text', 'voice', 'receipt');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "bot_user_states" (
    "user_id" TEXT NOT NULL,
    "stage" "BotUserStage" NOT NULL DEFAULT 'NEW_USER',
    "successful_operations_count" INTEGER NOT NULL DEFAULT 0,
    "paywall_prompted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_user_states_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bot_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "BotSessionMode" NOT NULL DEFAULT 'idle',
    "active_draft_id" TEXT,
    "active_message_id" INTEGER,
    "awaiting_input_type" TEXT,
    "pending_input_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bot_operation_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "session_id" TEXT,
    "type" TEXT,
    "amount" DECIMAL(18,2),
    "from_entity_id" TEXT,
    "to_entity_id" TEXT,
    "category_id" TEXT,
    "income_source_id" TEXT,
    "happened_at" TIMESTAMP(3),
    "description" TEXT,
    "source_type" "BotOperationSourceType" NOT NULL,
    "source_raw" TEXT,
    "parsed_confidence" DOUBLE PRECISION,
    "status" "BotOperationDraftStatus" NOT NULL DEFAULT 'pending_review',
    "chat_id" TEXT NOT NULL,
    "source_message_id" INTEGER,
    "live_message_id" INTEGER,
    "lookup_json" JSONB,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_operation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_user_states_stage_idx" ON "bot_user_states"("stage");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bot_sessions_user_id_key" ON "bot_sessions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_sessions_updated_at_idx" ON "bot_sessions"("updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_operation_drafts_user_id_status_idx" ON "bot_operation_drafts"("user_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_operation_drafts_workspace_id_idx" ON "bot_operation_drafts"("workspace_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_operation_drafts_session_id_idx" ON "bot_operation_drafts"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bot_operation_drafts_chat_id_idx" ON "bot_operation_drafts"("chat_id");

-- Enforce single active draft per user at DB level
CREATE UNIQUE INDEX IF NOT EXISTS "bot_operation_drafts_single_active_per_user_idx"
ON "bot_operation_drafts"("user_id")
WHERE "status" IN ('pending_review', 'awaiting_field_input', 'awaiting_choice', 'saving');

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bot_user_states_user_id_fkey'
    ) THEN
      ALTER TABLE "bot_user_states" ADD CONSTRAINT "bot_user_states_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bot_sessions_user_id_fkey'
    ) THEN
      ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bot_operation_drafts_user_id_fkey'
    ) THEN
      ALTER TABLE "bot_operation_drafts" ADD CONSTRAINT "bot_operation_drafts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bot_operation_drafts_workspace_id_fkey'
    ) THEN
      ALTER TABLE "bot_operation_drafts" ADD CONSTRAINT "bot_operation_drafts_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bot_operation_drafts_session_id_fkey'
    ) THEN
      ALTER TABLE "bot_operation_drafts" ADD CONSTRAINT "bot_operation_drafts_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "bot_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
