-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SubscriptionPlanCode" AS ENUM ('personal_monthly', 'personal_shared_monthly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('pending_initial_payment', 'trialing', 'active', 'past_due', 'cancelled', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PaymentProvider" AS ENUM ('yookassa');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PaymentType" AS ENUM ('trial', 'recurring', 'one_time');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'waiting_for_capture', 'succeeded', 'canceled', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SubscriptionEventType" AS ENUM (
      'trial_payment_created',
      'trial_payment_succeeded',
      'trial_activated',
      'recurring_payment_created',
      'recurring_payment_succeeded',
      'recurring_payment_failed',
      'subscription_cancelled',
      'subscription_expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "plan_code" "SubscriptionPlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_customer_id" TEXT,
    "provider_payment_method_id" TEXT,
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "current_period_starts_at" TIMESTAMP(3),
    "current_period_ends_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "next_renewal_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "provider_idempotence_key" TEXT,
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount_value" DECIMAL(18,2) NOT NULL,
    "amount_currency" TEXT NOT NULL,
    "plan_code" "SubscriptionPlanCode" NOT NULL,
    "is_trial" BOOLEAN NOT NULL DEFAULT false,
    "provider_payment_method_id" TEXT,
    "raw_payload_json" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscription_events" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "event_type" "SubscriptionEventType" NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_next_renewal_at_idx" ON "subscriptions"("next_renewal_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_idempotence_key_key" ON "payments"("provider_idempotence_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_subscription_id_idx" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscription_events_subscription_id_created_at_idx" ON "subscription_events"("subscription_id", "created_at");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_fkey'
    ) THEN
      ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_workspace_id_fkey'
    ) THEN
      ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payments_subscription_id_fkey'
    ) THEN
      ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payments_user_id_fkey'
    ) THEN
      ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payments_workspace_id_fkey'
    ) THEN
      ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'subscription_events_subscription_id_fkey'
    ) THEN
      ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
