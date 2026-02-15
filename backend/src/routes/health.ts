import { FastifyInstance, FastifyPluginOptions } from "fastify"

export async function healthRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get("/health", async (_request, reply) => {
    return reply.send({ ok: true })
  })
}
