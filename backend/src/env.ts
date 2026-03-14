import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  MINI_APP_URL: z.string().url().optional(),
  BOT_PAYWALL_URL: z.string().url().optional(),
  BACKEND_BASE_URL: z.string().url().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  SUBSCRIPTIONS_TEST_MODE: z.string().optional(),
  SUBSCRIPTION_TRIAL_DURATION_MINUTES_TEST: z.coerce.number().int().positive().optional(),
  SUBSCRIPTION_RENEWAL_DELAY_MINUTES_TEST: z.coerce.number().int().positive().optional(),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.string().default("development"),
})

const parsed = baseSchema.parse(process.env)
const normalizedBotToken = parsed.BOT_TOKEN ?? parsed.TELEGRAM_BOT_TOKEN

if (!normalizedBotToken) {
  throw new Error("BOT_TOKEN is required (BOT_TOKEN or TELEGRAM_BOT_TOKEN)")
}

export type Env = Omit<typeof parsed, "BOT_TOKEN"> & { BOT_TOKEN: string }

export const env: Env = {
  ...parsed,
  BOT_TOKEN: normalizedBotToken,
}
