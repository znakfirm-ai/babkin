import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { processYookassaWebhook, runSubscriptionMaintenanceTick } from "../services/subscriptions"

export async function yookassaWebhookRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/yookassa/webhook", async (request, reply) => {
    try {
      await processYookassaWebhook(fastify, request.body)
      await runSubscriptionMaintenanceTick(fastify)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fastify.log.error(`[yookassa:webhook] failed: ${message}`)
    }
    return reply.send({ ok: true })
  })
}
