import { FastifyInstance, FastifyPluginOptions } from "fastify"

export async function healthRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/health", async () => ({ ok: true }))
}
