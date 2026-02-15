import Fastify from "fastify"
import cors from "@fastify/cors"
import { env } from "./env"
import { healthRoutes } from "./routes/health"
import { meRoutes } from "./routes/me"
import { authRoutes } from "./routes/auth"

const fastify = Fastify({
  logger: true,
})

fastify.register(cors, { origin: true })
fastify.register(healthRoutes)
fastify.register(authRoutes, { prefix: "/api/v1" })
fastify.register(meRoutes, { prefix: "/api/v1" })

const port = env.PORT

fastify.listen({ port, host: "0.0.0.0" }).catch((err) => {
  fastify.log.error(err)
  process.exit(1)
})
