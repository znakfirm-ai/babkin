"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountsRoutes = accountsRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
async function accountsRoutes(fastify, _opts) {
    const resolveUserId = async (request, reply) => {
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
                await reply.status(401).send({ error: "Unauthorized", reason });
                return null;
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
                await reply.status(401).send({ error: "Unauthorized", reason });
                return null;
            }
            const auth = await (0, telegramAuth_1.validateInitData)(initDataRaw);
            if (!auth) {
                reason = hasInitData ? "invalid_initdata" : "missing_initdata";
                request.log.info({ hasInitData, initDataLength: initDataRaw?.length ?? 0, authDate, reason });
                await reply.status(401).send({ error: "Unauthorized", reason });
                return null;
            }
            userId = auth.userId;
        }
        return userId;
    };
    fastify.get("/accounts", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: userId },
            select: { active_workspace_id: true },
        });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const accounts = await prisma_1.prisma.accounts.findMany({
            where: { workspace_id: user.active_workspace_id, archived_at: null, is_archived: false },
        });
        const payload = {
            accounts: accounts.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                currency: a.currency,
                balance: Number(a.balance),
            })),
        };
        return reply.send(payload);
    });
    fastify.post("/accounts", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: userId },
            select: { active_workspace_id: true },
        });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const body = request.body;
        if (!body?.name || !body.type || !body.currency) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_fields" });
        }
        const created = await prisma_1.prisma.accounts.create({
            data: {
                workspace_id: user.active_workspace_id,
                name: body.name,
                type: body.type,
                currency: body.currency,
                balance: body.balance ?? 0,
            },
        });
        const account = {
            id: created.id,
            name: created.name,
            type: created.type,
            currency: created.currency,
            balance: Number(created.balance),
        };
        return reply.send({ account });
    });
    fastify.delete("/accounts/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: userId },
            select: { active_workspace_id: true },
        });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const accountId = request.params?.id;
        if (!accountId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_account_id" });
        }
        const updated = await prisma_1.prisma.accounts.updateMany({
            where: { id: accountId, workspace_id: user.active_workspace_id },
            data: { is_archived: true, archived_at: new Date() },
        });
        if (updated.count === 0) {
            return reply.status(404).send({ error: "Not Found" });
        }
        return reply.status(204).send();
    });
    fastify.post("/accounts/:id/adjust-balance", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({
            where: { id: userId },
            select: { active_workspace_id: true },
        });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const accountId = request.params?.id;
        if (!accountId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_account_id" });
        }
        const body = request.body;
        if (typeof body?.targetBalance !== "number" || Number.isNaN(body.targetBalance)) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_target_balance" });
        }
        const workspaceId = user.active_workspace_id;
        const account = await prisma_1.prisma.accounts.findFirst({
            where: { id: accountId, workspace_id: user.active_workspace_id, archived_at: null },
            select: { balance: true },
        });
        if (!account) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const target = new client_1.Prisma.Decimal(body.targetBalance);
        const current = new client_1.Prisma.Decimal(account.balance);
        const diff = target.minus(current);
        if (diff.equals(0)) {
            return reply.send({ ok: true });
        }
        const absDiff = diff.abs();
        const happenedAt = body.date ? new Date(body.date) : new Date();
        if (Number.isNaN(happenedAt.getTime())) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_date" });
        }
        await prisma_1.prisma.$transaction(async (trx) => {
            await trx.accounts.update({
                where: { id: accountId },
                data: { balance: { increment: diff } },
            });
            await trx.transactions.create({
                data: {
                    workspace_id: workspaceId,
                    kind: "adjustment",
                    amount: absDiff,
                    happened_at: happenedAt,
                    account_id: accountId,
                    note: body.note ?? null,
                },
            });
        });
        return reply.send({ ok: true });
    });
}
