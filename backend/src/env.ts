import { z } from "zod"

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
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
