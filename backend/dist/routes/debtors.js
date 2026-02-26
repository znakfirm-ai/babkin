"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debtorsRoutes = debtorsRoutes;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const telegramAuth_1 = require("../middleware/telegramAuth");
const env_1 = require("../env");
const debtorsModel = prisma_1.prisma.debtors;
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
const parseDate = (value) => {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
};
const parseAmount = (value) => {
    if (value === undefined || value === null || value === "")
        return null;
    const parsed = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(parsed))
        return null;
    return parsed;
};
const mapDebtor = (d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    issuedAt: d.issued_at.toISOString(),
    principalAmount: d.principal_amount.toString(),
    dueAt: d.due_at ? d.due_at.toISOString() : null,
    payoffAmount: d.payoff_amount ? d.payoff_amount.toString() : null,
    status: d.status,
    createdAt: d.created_at.toISOString(),
    updatedAt: d.updated_at.toISOString(),
});
async function debtorsRoutes(fastify, _opts) {
    if (!debtorsModel) {
        fastify.log.error("Prisma debtors model is not available. Run prisma generate with updated schema.");
        return;
    }
    fastify.get("/debtors", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const status = request.query.status;
        const debtors = await debtorsModel.findMany({
            where: {
                workspace_id: user.active_workspace_id,
                ...(status === "active" || status === "completed" ? { status } : {}),
            },
            orderBy: { created_at: "desc" },
        });
        return reply.send({ debtors: debtors.map(mapDebtor) });
    });
    fastify.post("/debtors", async (request, reply) => {
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
        const issuedAt = parseDate(body.issuedAt);
        if (!issuedAt) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_issued_at" });
        }
        const principalAmount = parseAmount(body.principalAmount);
        if (principalAmount === null || principalAmount <= 0) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_principal_amount" });
        }
        const dueAt = body.dueAt === null ? null : parseDate(body.dueAt);
        if (body.dueAt !== undefined && body.dueAt !== null && !dueAt) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_due_at" });
        }
        const payoffAmount = parseAmount(body.payoffAmount);
        if (body.payoffAmount !== undefined && body.payoffAmount !== null && payoffAmount === null) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_payoff_amount" });
        }
        if (payoffAmount !== null && payoffAmount < 0) {
            return reply.status(400).send({ error: "Bad Request", reason: "invalid_payoff_amount" });
        }
        const created = await debtorsModel.create({
            data: {
                workspace_id: user.active_workspace_id,
                name,
                icon: body.icon?.trim() || null,
                issued_at: issuedAt,
                principal_amount: new client_1.Prisma.Decimal(principalAmount),
                due_at: dueAt,
                payoff_amount: payoffAmount === null ? null : new client_1.Prisma.Decimal(payoffAmount),
                status: body.status === "completed" ? "completed" : "active",
            },
        });
        return reply.send({ debtor: mapDebtor(created) });
    });
    fastify.patch("/debtors/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const debtorId = request.params.id;
        if (!debtorId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_id" });
        }
        const existing = await debtorsModel.findFirst({
            where: { id: debtorId, workspace_id: user.active_workspace_id },
        });
        if (!existing) {
            return reply.status(404).send({ error: "Not Found" });
        }
        const body = request.body;
        const data = {};
        if (body.name !== undefined) {
            const name = body.name.trim();
            if (!name) {
                return reply.status(400).send({ error: "Bad Request", reason: "invalid_name" });
            }
            data.name = name;
        }
        if (body.icon !== undefined) {
            data.icon = body.icon?.trim() || null;
        }
        if (body.issuedAt !== undefined) {
            const issuedAt = parseDate(body.issuedAt);
            if (!issuedAt) {
                return reply.status(400).send({ error: "Bad Request", reason: "invalid_issued_at" });
            }
            data.issued_at = issuedAt;
        }
        if (body.principalAmount !== undefined) {
            const principalAmount = parseAmount(body.principalAmount);
            if (principalAmount === null || principalAmount <= 0) {
                return reply.status(400).send({ error: "Bad Request", reason: "invalid_principal_amount" });
            }
            data.principal_amount = new client_1.Prisma.Decimal(principalAmount);
        }
        if (body.dueAt !== undefined) {
            if (body.dueAt === null) {
                data.due_at = null;
            }
            else {
                const dueAt = parseDate(body.dueAt);
                if (!dueAt) {
                    return reply.status(400).send({ error: "Bad Request", reason: "invalid_due_at" });
                }
                data.due_at = dueAt;
            }
        }
        if (body.payoffAmount !== undefined) {
            if (body.payoffAmount === null) {
                data.payoff_amount = null;
            }
            else {
                const payoffAmount = parseAmount(body.payoffAmount);
                if (payoffAmount === null || payoffAmount < 0) {
                    return reply.status(400).send({ error: "Bad Request", reason: "invalid_payoff_amount" });
                }
                data.payoff_amount = new client_1.Prisma.Decimal(payoffAmount);
            }
        }
        if (body.status !== undefined) {
            if (body.status !== "active" && body.status !== "completed") {
                return reply.status(400).send({ error: "Bad Request", reason: "invalid_status" });
            }
            data.status = body.status;
        }
        const updated = await debtorsModel.update({
            where: { id: debtorId },
            data,
        });
        return reply.send({ debtor: mapDebtor(updated) });
    });
    fastify.delete("/debtors/:id", async (request, reply) => {
        const userId = await resolveUserId(request, reply);
        if (!userId)
            return;
        const user = await prisma_1.prisma.users.findUnique({ where: { id: userId }, select: { active_workspace_id: true } });
        if (!user?.active_workspace_id) {
            return reply.status(400).send({ error: "No active workspace" });
        }
        const debtorId = request.params.id;
        if (!debtorId) {
            return reply.status(400).send({ error: "Bad Request", reason: "missing_id" });
        }
        const existing = await debtorsModel.findFirst({
            where: { id: debtorId, workspace_id: user.active_workspace_id },
            select: { id: true },
        });
        if (!existing) {
            return reply.status(404).send({ error: "Not Found" });
        }
        await debtorsModel.delete({ where: { id: debtorId } });
        return reply.status(204).send();
    });
}
