"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incomeSourcesRoutes = incomeSourcesRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
const DEFAULT_INCOME_SOURCES = [
    { name: "Зарплата" },
    { name: "Бизнес" },
];
const unauthorized = async (reply, reason) => {
    await reply.status(401).send({ error: "Unauthorized", reason });
    return null;
};
async function resolveUserId(request, reply) {
    const authHeader = request.headers.authorization;
    let userId = null;
    let reason = null;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice("Bearer ".length);
        try {
            const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
            userId = payload.sub;
        }
        catch {
            reason = "invalid_jwt";
            return unauthorized(reply, reason);
        }
    }
    if (!userId) {
        const initDataRaw = request.headers[telegramAuth_1.TELEGRAM_INITDATA_HEADER];
        const hasInitData = Boolean(initDataRaw && initDataRaw.length > 0);
        const authDate = (() => {
            const params = initDataRaw ? new URLSearchParams(initDataRaw) : null;
            const ad = params?.get("auth_date");
            return ad ? Number(ad) : undefined;
        })();
        if (!env_1.env.BOT_TOKEN) {
            reason = "missing_bot_token";
            request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
            return unauthorized(reply, reason);
        }
        const auth = await (0, telegramAuth_1.validateInitData)(initDataRaw);
        if (!auth) {
            reason = hasInitData ? "invalid_initdata" : "missing_initdata";
            request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
            return unauthorized(reply, reason);
        }
        userId = auth.userId;
    }
    return userId;
}
async function incomeSourcesRoutes(fastify, _opts) {
    fastify.get("/income-sources", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const workspaceId = user.active_workspace_id;
        const existing = await prisma_1.prisma.income_sources.findMany({ where: { workspace_id: workspaceId } });
        if (existing.length === 0) {
            await prisma_1.prisma.income_sources.createMany({
                data: DEFAULT_INCOME_SOURCES.map((s) => ({
                    workspace_id: workspaceId,
                    name: s.name,
                })),
                skipDuplicates: true,
            });
        }
        const sources = existing.length
            ? existing
            : await prisma_1.prisma.income_sources.findMany({ where: { workspace_id: workspaceId } });
        const payload = {
            incomeSources: sources.map((s) => ({ id: s.id, name: s.name })),
        };
        return reply.send(payload);
    });
    fastify.post("/income-sources", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const body = request.body;
        const name = body?.name?.trim();
        if (!name) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" });
        }
        const duplicate = await prisma_1.prisma.income_sources.findFirst({
            where: { workspace_id: user.active_workspace_id, name: { equals: name, mode: "insensitive" } },
        });
        if (duplicate) {
            return reply.status(409).send({ error: "Conflict", code: "INCOME_SOURCE_NAME_EXISTS" });
        }
        const created = await prisma_1.prisma.income_sources.create({
            data: {
                workspace_id: user.active_workspace_id,
                name,
            },
        });
        const payload = {
            incomeSource: { id: created.id, name: created.name },
        };
        return reply.send(payload);
    });
    fastify.patch("/income-sources/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const incomeSourceId = request.params.id;
        if (!incomeSourceId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_id" });
        }
        const body = request.body;
        const name = body?.name?.trim();
        if (!name) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" });
        }
        const existing = await prisma_1.prisma.income_sources.findFirst({
            where: { id: incomeSourceId, workspace_id: user.active_workspace_id },
        });
        if (!existing) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const duplicate = await prisma_1.prisma.income_sources.findFirst({
            where: {
                workspace_id: user.active_workspace_id,
                name: { equals: name, mode: "insensitive" },
                NOT: { id: incomeSourceId },
            },
        });
        if (duplicate) {
            return reply.status(409).send({ error: "Conflict", code: "INCOME_SOURCE_NAME_EXISTS" });
        }
        const updated = await prisma_1.prisma.income_sources.update({
            where: { id: incomeSourceId },
            data: { name },
        });
        return reply.send({ incomeSource: { id: updated.id, name: updated.name } });
    });
    fastify.delete("/income-sources/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const incomeSourceId = request.params.id;
        if (!incomeSourceId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_id" });
        }
        const existing = await prisma_1.prisma.income_sources.findFirst({
            where: { id: incomeSourceId, workspace_id: user.active_workspace_id },
        });
        if (!existing) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const txCount = await prisma_1.prisma.transactions.count({
            where: { workspace_id: user.active_workspace_id, income_source_id: incomeSourceId },
        });
        if (txCount > 0) {
            return reply.status(409).send({ error: "Conflict", code: "INCOME_SOURCE_IN_USE" });
        }
        await prisma_1.prisma.income_sources.delete({ where: { id: incomeSourceId } });
        return reply.status(204).send();
    });
}
