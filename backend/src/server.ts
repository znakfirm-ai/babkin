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

const fastify = Fastify({
  logger: true,
})

fastify.register(cors, { origin: true })
fastify.register(healthRoutes)
fastify.register(authRoutes, { prefix: "/api/v1" })
fastify.register(meRoutes, { prefix: "/api/v1" })
fastify.register(workspacesRoutes, { prefix: "/api/v1" })
fastify.register(accountsRoutes, { prefix: "/api/v1" })
fastify.register(categoriesRoutes, { prefix: "/api/v1" })
fastify.register(incomeSourcesRoutes, { prefix: "/api/v1" })
fastify.register(transactionsRoutes, { prefix: "/api/v1" })
fastify.register(analyticsRoutes, { prefix: "/api/v1" })

const port = Number(process.env.PORT) || env.PORT

fastify
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    fastify.log.info(`listening on http://0.0.0.0:${port}`)
  })
  .catch((err) => {
    fastify.log.error(err)
    process.exit(1)
  })
