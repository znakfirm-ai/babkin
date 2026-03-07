import Fastify from "fastify"
import cors from "@fastify/cors"
import { env } from "./env"
import { healthRoutes } from "./routes/health"
import { meRoutes } from "./routes/me"
import { authRoutes } from "./routes/auth"
import { workspacesRoutes } from "./routes/workspaces"
import { accountsRoutes } from "./routes/accounts"
import { categoriesRoutes } from "./routes/categories"
import { transactionsRoutes } from "./routes/transactions"
import { incomeSourcesRoutes } from "./routes/incomeSources"
import { analyticsRoutes } from "./routes/analytics"
import { goalsRoutes } from "./routes/goals"
import { debtorsRoutes } from "./routes/debtors"
import { bootstrapRoutes } from "./routes/bootstrap"
import { runOpenAITest } from "./utils/openaiTest"
import { telegramWebhookRoutes } from "./routes/telegramWebhook"
import { devToolsRoutes } from "./routes/devTools"

const fastify = Fastify({
  logger: true,
})
const debugTimingsEnabled = process.env.DEBUG_TIMINGS === "1"
const requestTimings = new WeakMap<object, { startedAtMs: number; requestId: string }>()
let debugRequestCounter = 0

const createDebugRequestId = () => {
  debugRequestCounter += 1
  return `dbg-${Date.now().toString(36)}-${debugRequestCounter.toString(36)}`
}

if (debugTimingsEnabled) {
  fastify.addHook("onRequest", async (request) => {
    const requestId = request.id ? String(request.id) : createDebugRequestId()
    requestTimings.set(request, { startedAtMs: Date.now(), requestId })
  })

  fastify.addHook("onResponse", async (request, reply) => {
    const timing = requestTimings.get(request)
    if (!timing) return
    requestTimings.delete(request)
    const durationMs = Date.now() - timing.startedAtMs
    const urlPath = request.url.split("?")[0]
    fastify.log.info(
      `[timing][http] requestId=${timing.requestId} method=${request.method} url=${urlPath} status=${reply.statusCode} durationMs=${durationMs}`,
    )
  })
}

fastify.register(cors, { origin: true })
fastify.register(healthRoutes)
fastify.register(authRoutes, { prefix: "/api/v1" })
fastify.register(meRoutes, { prefix: "/api/v1" })
fastify.register(workspacesRoutes, { prefix: "/api/v1" })
fastify.register(accountsRoutes, { prefix: "/api/v1" })
fastify.register(categoriesRoutes, { prefix: "/api/v1" })
fastify.register(incomeSourcesRoutes, { prefix: "/api/v1" })
fastify.register(goalsRoutes, { prefix: "/api/v1" })
fastify.register(debtorsRoutes, { prefix: "/api/v1" })
fastify.register(bootstrapRoutes, { prefix: "/api/v1" })
fastify.register(transactionsRoutes, { prefix: "/api/v1" })
fastify.register(analyticsRoutes, { prefix: "/api/v1" })
fastify.register(telegramWebhookRoutes, { prefix: "/api/v1" })
fastify.register(devToolsRoutes, { prefix: "/api/v1" })

const port = Number(process.env.PORT) || env.PORT

fastify
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    fastify.log.info(`listening on http://0.0.0.0:${port}`)
    void (async () => {
      try {
        await runOpenAITest()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        fastify.log.warn(`[openai-test] skipped: ${message}`)
      }
    })()
  })
  .catch((err) => {
    fastify.log.error(err)
    process.exit(1)
  })
