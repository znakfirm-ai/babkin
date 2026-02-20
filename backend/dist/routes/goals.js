"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalsRoutes = goalsRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
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
const mapGoal = (g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    targetAmount: g.target_amount.toString(),
    currentAmount: g.current_amount.toString(),
    status: g.status,
    createdAt: g.created_at.toISOString(),
    completedAt: g.completed_at ? g.completed_at.toISOString() : null,
});
async function goalsRoutes(fastify, _opts) {
    fastify.get("/goals", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const status = request.query.status;
        const goals = await prisma_1.prisma.goals.findMany({
            where: {
                workspace_id: user.active_workspace_id,
                ...(status === "active" || status === "completed" ? { status } : {}),
            },
            orderBy: { created_at: "desc" },
        });
        return reply.send({ goals: goals.map(mapGoal) });
    });
    fastify.post("/goals", async (request, reply) => {
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
        const parsedAmount = typeof body.targetAmount === "string" ? Number(body.targetAmount) : body.targetAmount;
        if (parsedAmount === undefined || parsedAmount === null || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_target_amount" });
        }
        const created = await prisma_1.prisma.goals.create({
            data: {
                workspace_id: user.active_workspace_id,
                name,
                icon: body.icon?.trim() || null,
                target_amount: new client_1.Prisma.Decimal(parsedAmount),
            },
        });
        return reply.send({ goal: mapGoal(created) });
    });
}
