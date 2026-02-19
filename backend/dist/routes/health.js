"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
async function healthRoutes(fastify, _opts) {
    fastify.get("/health", async (_request, reply) => {
        return reply.send({ ok: true });
    });
}
